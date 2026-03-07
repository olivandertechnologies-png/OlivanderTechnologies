import base64
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from supabase import Client, create_client

from backend.security import (
    MAX_ACTION_PRIORITY_SCORE,
    MAX_ACTION_CONFIDENCE_REASON_LENGTH,
    MAX_ACTION_DRAFT_LENGTH,
    MAX_ACTION_LABEL_LENGTH,
    MAX_ACTION_REASONING_LENGTH,
    MAX_ACTION_STEP_LENGTH,
    MAX_ACTION_STEPS,
    MAX_CLIENT_SUMMARY_LENGTH,
    MAX_DIGEST_THIS_WEEK_LENGTH,
    MIN_ACTION_PRIORITY_SCORE,
    MIN_ACTION_STEPS,
    AuthenticatedUser,
    GenerateActionRequest,
    GmailNotificationPayload,
    GmailWebhookEnvelope,
    GoogleSessionSyncRequest,
    RateLimitExceeded,
    enforce_rate_limits,
    get_authenticated_user,
    sanitize_text,
)

load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("olivander-api")

ACTION_CONFIDENCE_LEVELS = ("high", "medium", "low")
DIGEST_CRON_HEADER = "X-Olivander-Cron-Secret"
NZ_TIMEZONE = ZoneInfo("Pacific/Auckland")

app = FastAPI(title="Olivander API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://olivander.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
ACTION_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reasoning": {"type": "STRING", "maxLength": MAX_ACTION_REASONING_LENGTH},
        "action": {"type": "STRING", "maxLength": MAX_ACTION_LABEL_LENGTH},
        "draft": {"type": "STRING", "maxLength": MAX_ACTION_DRAFT_LENGTH},
        "confidence": {
            "type": "STRING",
            "enum": list(ACTION_CONFIDENCE_LEVELS),
        },
        "confidence_reason": {
            "type": "STRING",
            "maxLength": MAX_ACTION_CONFIDENCE_REASON_LENGTH,
        },
        "priority_score": {
            "type": "INTEGER",
            "minimum": MIN_ACTION_PRIORITY_SCORE,
            "maximum": MAX_ACTION_PRIORITY_SCORE,
        },
        "steps": {
            "type": "ARRAY",
            "minItems": MIN_ACTION_STEPS,
            "maxItems": MAX_ACTION_STEPS,
            "items": {
                "type": "STRING",
                "maxLength": MAX_ACTION_STEP_LENGTH,
            },
        },
    },
    "required": [
        "reasoning",
        "action",
        "draft",
        "confidence",
        "confidence_reason",
        "priority_score",
        "steps",
    ],
}
ACTION_SYSTEM_PROMPT = (
    "You are Olivander, an AI business agent for a New Zealand sole trader. "
    "Given a business situation and user context, respond with exactly one JSON object "
    'containing keys "reasoning", "action", "draft", "confidence", '
    '"confidence_reason", "priority_score", and "steps". '
    '"reasoning" should be one sentence that explains why the action is needed. '
    '"action" should be a short action label. '
    '"draft" should be the full prepared message or email in a natural professional tone. '
    '"confidence" must be one of "high", "medium", or "low". '
    '"high" means the situation is unambiguous and the correct action is clear. '
    '"medium" means there is enough context to act but some ambiguity remains. '
    '"low" means the agent is uncertain and the user should review closely. '
    '"confidence_reason" should be one sentence explaining why that confidence level applies. '
    '"priority_score" must be an integer from 1 to 10. Score invoices and quote follow-ups '
    "above routine scheduling, use any time sensitivity in the situation or context, and let "
    "high confidence push the score slightly higher when appropriate. "
    '"steps" should be an array of 4 to 6 short, past-tense sentences, each describing '
    "one discrete observation or decision the agent made while preparing the action."
)
CLIENT_SUMMARY_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {
            "type": "STRING",
            "maxLength": MAX_CLIENT_SUMMARY_LENGTH,
        },
    },
    "required": ["summary"],
}
CLIENT_SUMMARY_SYSTEM_PROMPT = (
    "You are Olivander, an AI business agent for a New Zealand sole trader. "
    "Given a client's current context, respond with exactly one JSON object containing the key "
    '"summary". '
    '"summary" must be plain-language relationship guidance in 2 to 3 sentences. '
    "It should cover the current relationship status, any outstanding items, and one recommended "
    "next action for the user. Refer to the client by name and do not use bullet points."
)
WEEKLY_DIGEST_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {
            "type": "STRING",
            "maxLength": MAX_DIGEST_THIS_WEEK_LENGTH,
        },
    },
    "required": ["summary"],
}
WEEKLY_DIGEST_SYSTEM_PROMPT = (
    "You are Olivander, an AI business agent for a New Zealand sole trader. "
    "Given the current weekly business summary context, respond with exactly one JSON object "
    'containing the key "summary". '
    '"summary" must be a single plain-text paragraph of 2 to 3 sentences. '
    "It should explain what likely needs attention this week based on outstanding items, "
    "clients needing follow-up, and last week's completed work. Do not use bullet points."
)


@dataclass(frozen=True)
class DigestWindow:
    start_utc: datetime
    end_utc_exclusive: datetime
    start_nz: datetime
    end_nz_inclusive: datetime


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        logger.error("Missing required environment variable: %s", name)
        raise HTTPException(status_code=500, detail="Server configuration is incomplete.")
    return value


def get_supabase_client() -> Client:
    url = get_env("SUPABASE_URL")
    key = get_env("SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def decode_base64_json(data: str) -> dict[str, Any]:
    padding = "=" * (-len(data) % 4)
    decoded = base64.urlsafe_b64decode(f"{data}{padding}".encode("utf-8"))
    return json.loads(decoded.decode("utf-8"))


def parse_generated_steps(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("Gemini returned malformed action steps")

    if not MIN_ACTION_STEPS <= len(value) <= MAX_ACTION_STEPS:
        raise ValueError("Gemini returned an invalid number of action steps")

    return [
        sanitize_text(
            step,
            field_name=f"steps[{index}]",
            max_length=MAX_ACTION_STEP_LENGTH,
        )
        for index, step in enumerate(value, start=1)
    ]


def parse_generated_confidence(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Gemini returned malformed action confidence")

    cleaned = sanitize_text(
        value,
        field_name="confidence",
        max_length=max(len(level) for level in ACTION_CONFIDENCE_LEVELS),
    ).lower()

    if cleaned not in ACTION_CONFIDENCE_LEVELS:
        raise ValueError("Gemini returned an unsupported action confidence")

    return cleaned


def parse_generated_priority_score(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("Gemini returned malformed action priority score")

    if not MIN_ACTION_PRIORITY_SCORE <= value <= MAX_ACTION_PRIORITY_SCORE:
        raise ValueError("Gemini returned an out-of-range action priority score")

    return value


def parse_generated_action(response_json: dict[str, Any]) -> dict[str, Any]:
    candidates = response_json.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    raw_text = "".join(text_chunks).strip()
    if not raw_text:
        raise ValueError("Gemini returned an empty response")

    parsed = json.loads(raw_text)
    reasoning = parsed.get("reasoning")
    action = parsed.get("action")
    draft = parsed.get("draft")
    confidence = parsed.get("confidence")
    confidence_reason = parsed.get("confidence_reason")
    priority_score = parsed.get("priority_score")
    steps = parsed.get("steps")

    if not all(isinstance(value, str) and value.strip() for value in [reasoning, action, draft]):
        raise ValueError("Gemini returned malformed action JSON")

    return {
        "reasoning": sanitize_text(
            reasoning,
            field_name="reasoning",
            max_length=MAX_ACTION_REASONING_LENGTH,
        ),
        "action_label": sanitize_text(
            action,
            field_name="action",
            max_length=MAX_ACTION_LABEL_LENGTH,
        ),
        "draft": sanitize_text(
            draft,
            field_name="draft",
            max_length=MAX_ACTION_DRAFT_LENGTH,
            multiline=True,
        ),
        "confidence": parse_generated_confidence(confidence),
        "confidence_reason": sanitize_text(
            confidence_reason,
            field_name="confidence_reason",
            max_length=MAX_ACTION_CONFIDENCE_REASON_LENGTH,
        ),
        "priority_score": parse_generated_priority_score(priority_score),
        "steps": parse_generated_steps(steps),
    }


def parse_generated_client_summary(response_json: dict[str, Any]) -> str:
    candidates = response_json.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    raw_text = "".join(text_chunks).strip()
    if not raw_text:
        raise ValueError("Gemini returned an empty response")

    parsed = json.loads(raw_text)
    summary = parsed.get("summary")

    return sanitize_text(
        summary,
        field_name="summary",
        max_length=MAX_CLIENT_SUMMARY_LENGTH,
        multiline=True,
    )


def parse_generated_weekly_digest_summary(response_json: dict[str, Any]) -> str:
    candidates = response_json.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    raw_text = "".join(text_chunks).strip()
    if not raw_text:
        raise ValueError("Gemini returned an empty response")

    parsed = json.loads(raw_text)
    summary = parsed.get("summary")

    return sanitize_text(
        summary,
        field_name="summary",
        max_length=MAX_DIGEST_THIS_WEEK_LENGTH,
        multiline=True,
    )


async def call_gemini_for_action(
    situation: str, user_context: dict[str, Any]
) -> dict[str, Any]:
    api_key = get_env("GEMINI_API_KEY")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": json.dumps(
                            {
                                "system": ACTION_SYSTEM_PROMPT,
                                "situation": situation,
                                "user_context": user_context,
                            }
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": ACTION_RESPONSE_SCHEMA,
        },
    }

    logger.info(
        "Calling Gemini model=%s for situation preview=%s",
        GEMINI_MODEL,
        situation[:120],
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=payload,
        )

    logger.info("Gemini response status=%s", response.status_code)

    if response.status_code >= 400:
        logger.error("Gemini request failed status=%s", response.status_code)
        raise HTTPException(status_code=502, detail="Failed to generate action.")

    try:
        return parse_generated_action(response.json())
    except (ValueError, json.JSONDecodeError) as exc:
        logger.exception("Failed to parse Gemini response")
        raise HTTPException(status_code=502, detail="Failed to generate action.") from exc


async def call_gemini_for_client_summary(client_row: dict[str, Any]) -> str:
    api_key = get_env("GEMINI_API_KEY")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": json.dumps(
                            {
                                "system": CLIENT_SUMMARY_SYSTEM_PROMPT,
                                "client": {
                                    "name": client_row.get("name"),
                                    "descriptor": client_row.get("descriptor"),
                                    "status": client_row.get("status"),
                                    "last_contact": client_row.get("last_contact"),
                                    "notes": client_row.get("notes") or [],
                                    "recent_actions": client_row.get("recent_actions") or [],
                                },
                            }
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": CLIENT_SUMMARY_RESPONSE_SCHEMA,
        },
    }

    logger.info(
        "Calling Gemini model=%s for client summary client_id=%s",
        GEMINI_MODEL,
        client_row.get("id"),
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=payload,
        )

    logger.info("Gemini client summary response status=%s", response.status_code)

    if response.status_code >= 400:
        logger.error("Gemini client summary request failed status=%s", response.status_code)
        raise HTTPException(status_code=502, detail="Failed to generate client summary.")

    try:
        return parse_generated_client_summary(response.json())
    except (ValueError, json.JSONDecodeError) as exc:
        logger.exception("Failed to parse Gemini client summary response")
        raise HTTPException(status_code=502, detail="Failed to generate client summary.") from exc


async def call_gemini_for_weekly_digest_summary(
    digest_context: dict[str, Any]
) -> str:
    api_key = get_env("GEMINI_API_KEY")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": json.dumps(
                            {
                                "system": WEEKLY_DIGEST_SYSTEM_PROMPT,
                                "digest_context": digest_context,
                            }
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": WEEKLY_DIGEST_RESPONSE_SCHEMA,
        },
    }

    logger.info(
        "Calling Gemini model=%s for weekly digest user_id=%s",
        GEMINI_MODEL,
        digest_context.get("user_id"),
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=payload,
        )

    logger.info("Gemini weekly digest response status=%s", response.status_code)

    if response.status_code >= 400:
        logger.error("Gemini weekly digest request failed status=%s", response.status_code)
        raise HTTPException(status_code=502, detail="Failed to generate weekly digest.")

    try:
        return parse_generated_weekly_digest_summary(response.json())
    except (ValueError, json.JSONDecodeError) as exc:
        logger.exception("Failed to parse Gemini weekly digest response")
        raise HTTPException(status_code=502, detail="Failed to generate weekly digest.") from exc


async def process_new_email(
    user_id: str | None, history_id: str | None, payload: dict[str, Any]
) -> None:
    logger.info(
        "process_new_email stub user_id=%s history_id=%s payload_keys=%s",
        user_id,
        history_id,
        sorted(payload.keys()),
    )


def fetch_user_by_email(supabase: Client, email: str) -> dict[str, Any] | None:
    logger.info("Supabase select users by email=%s", email)
    response = (
        supabase.table("users")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    logger.info("Supabase users lookup rows=%s", len(rows))
    return rows[0] if rows else None


def fetch_user_row(supabase: Client, user_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def ensure_public_user_row(
    supabase: Client,
    *,
    user_id: str,
    email: str | None,
) -> dict[str, Any]:
    existing_user = fetch_user_row(supabase, user_id)
    if existing_user:
        return existing_user

    payload = {
        "id": user_id,
        "email": email,
    }
    response = supabase.table("users").insert(payload).execute()
    rows = response.data or []
    if rows:
        return rows[0]

    user_row = fetch_user_row(supabase, user_id)
    if user_row:
        return user_row

    raise HTTPException(status_code=500, detail="Failed to prepare user profile.")


def store_google_refresh_token(
    supabase: Client,
    *,
    user_id: str,
    provider_email: str | None,
    refresh_token: str,
) -> dict[str, Any]:
    existing_response = (
        supabase.table("user_google_oauth_credentials")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    existing_rows = existing_response.data or []
    payload = {
        "provider_email": provider_email,
        "refresh_token": refresh_token,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if existing_rows:
        supabase.table("user_google_oauth_credentials").update(payload).eq(
            "user_id", user_id
        ).execute()
    else:
        supabase.table("user_google_oauth_credentials").insert(
            {
                "user_id": user_id,
                "provider_email": provider_email,
                "refresh_token": refresh_token,
                "updated_at": payload["updated_at"],
            }
        ).execute()

    response = (
        supabase.table("user_google_oauth_credentials")
        .select("user_id, provider_email, updated_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to store Google credentials.")
    return rows[0]


def fetch_google_oauth_credentials(supabase: Client, user_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("user_google_oauth_credentials")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_weekly_digest_enabled_users(supabase: Client) -> list[dict[str, Any]]:
    response = (
        supabase.table("users")
        .select("id, email, name, business_name, weekly_digest_enabled")
        .eq("weekly_digest_enabled", True)
        .execute()
    )
    return response.data or []


def format_digest_date(value: datetime) -> str:
    return f"{value.day} {value.strftime('%b %Y')}"


def get_previous_week_digest_window(now: datetime | None = None) -> DigestWindow:
    current_time_utc = now.astimezone(timezone.utc) if now else datetime.now(timezone.utc)
    current_time_nz = current_time_utc.astimezone(NZ_TIMEZONE)
    current_week_start_nz = current_time_nz.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    ) - timedelta(days=current_time_nz.weekday())
    previous_week_start_nz = current_week_start_nz - timedelta(days=7)
    previous_week_end_nz = current_week_start_nz - timedelta(microseconds=1)

    return DigestWindow(
        start_utc=previous_week_start_nz.astimezone(timezone.utc),
        end_utc_exclusive=current_week_start_nz.astimezone(timezone.utc),
        start_nz=previous_week_start_nz,
        end_nz_inclusive=previous_week_end_nz,
    )


def build_weekly_digest_subject(digest_window: DigestWindow) -> str:
    return (
        "Your Olivander weekly summary — "
        f"{format_digest_date(digest_window.start_nz)} to "
        f"{format_digest_date(digest_window.end_nz_inclusive)}"
    )


def build_digest_action_description(action_row: dict[str, Any]) -> str:
    action_label = sanitize_text(
        action_row.get("action_label") or action_row.get("action") or "Action completed",
        field_name="action_label",
        max_length=MAX_ACTION_LABEL_LENGTH,
    )
    reasoning_value = action_row.get("reasoning")
    reasoning = ""
    if isinstance(reasoning_value, str) and reasoning_value.strip():
        reasoning = sanitize_text(
            reasoning_value,
            field_name="reasoning",
            max_length=MAX_ACTION_REASONING_LENGTH,
        )

    return f"{action_label} — {reasoning}" if reasoning else action_label


def build_pending_action_description(action_row: dict[str, Any], now_utc: datetime) -> str:
    action_label = sanitize_text(
        action_row.get("action_label") or action_row.get("action") or "Pending action",
        field_name="action_label",
        max_length=MAX_ACTION_LABEL_LENGTH,
    )
    created_at = parse_optional_timestamp(action_row.get("created_at"))
    if created_at is None:
        return action_label

    age = now_utc - created_at.astimezone(timezone.utc)
    age_days = max(2, int((age.total_seconds() + 86399) // 86400))
    return f"{action_label} — pending for {age_days} days"


def build_client_attention_description(client_row: dict[str, Any]) -> str:
    name = sanitize_text(
        client_row.get("name") or "Unnamed client",
        field_name="name",
        max_length=120,
    )
    status = sanitize_text(
        client_row.get("status") or "Needs follow-up",
        field_name="status",
        max_length=60,
    )
    last_contact = client_row.get("last_contact")
    if isinstance(last_contact, str) and last_contact.strip():
        return f"{name} — {status} (last contact: {last_contact.strip()})"
    return f"{name} — {status}"


def fetch_approved_actions_for_digest(
    supabase: Client,
    *,
    user_id: str,
    digest_window: DigestWindow,
) -> list[dict[str, Any]]:
    response = (
        supabase.table("actions")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "approved")
        .gte("created_at", digest_window.start_utc.isoformat())
        .lt("created_at", digest_window.end_utc_exclusive.isoformat())
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def count_dismissed_actions_for_digest(
    supabase: Client,
    *,
    user_id: str,
    digest_window: DigestWindow,
) -> int:
    response = (
        supabase.table("actions")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "dismissed")
        .gte("created_at", digest_window.start_utc.isoformat())
        .lt("created_at", digest_window.end_utc_exclusive.isoformat())
        .execute()
    )
    return len(response.data or [])


def fetch_stale_pending_actions(
    supabase: Client,
    *,
    user_id: str,
    now_utc: datetime,
) -> list[dict[str, Any]]:
    cutoff = now_utc - timedelta(hours=48)
    response = (
        supabase.table("actions")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .lt("created_at", cutoff.isoformat())
        .order("created_at", desc=False)
        .execute()
    )
    return response.data or []


def fetch_clients_needing_attention(supabase: Client, *, user_id: str) -> list[dict[str, Any]]:
    response = (
        supabase.table("clients")
        .select("name, status, last_contact")
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []
    return [
        row
        for row in rows
        if row.get("status") in {"Overdue", "Needs follow-up"}
    ]


def build_fallback_weekly_digest_summary(
    *,
    approved_count: int,
    outstanding_count: int,
    attention_count: int,
) -> str:
    if outstanding_count or attention_count:
        return (
            f"You have {outstanding_count} older pending item(s) and {attention_count} client "
            "relationship(s) that need attention this week. Prioritising those follow-ups early "
            "should keep the queue moving and reduce the risk of missed revenue."
        )

    if approved_count:
        return (
            f"You cleared {approved_count} action(s) last week and there are no overdue client "
            "follow-ups waiting right now. This week looks steady, with space for the agent to "
            "handle routine inbox activity as it arrives."
        )

    return (
        "There are no urgent carry-overs from last week right now. This week should be mostly "
        "about staying responsive to new enquiries and keeping an eye on fresh follow-ups."
    )


def build_weekly_digest_body(
    *,
    recipient_name: str,
    digest_window: DigestWindow,
    approved_actions: list[dict[str, Any]],
    dismissed_count: int,
    stale_pending_actions: list[dict[str, Any]],
    clients_needing_attention: list[dict[str, Any]],
    this_week_summary: str,
    now_utc: datetime,
) -> str:
    greeting_name = recipient_name.strip() or "there"
    approved_lines = (
        [f"- {build_digest_action_description(action)}" for action in approved_actions]
        if approved_actions
        else ["- None."]
    )
    outstanding_lines = (
        [f"- {build_pending_action_description(action, now_utc)}" for action in stale_pending_actions]
        if stale_pending_actions
        else ["- None."]
    )
    client_lines = (
        [f"- {build_client_attention_description(client)}" for client in clients_needing_attention]
        if clients_needing_attention
        else ["- None."]
    )

    return "\n".join(
        [
            f"Kia ora {greeting_name},",
            "",
            (
                "Here is your Olivander summary for "
                f"{format_digest_date(digest_window.start_nz)} to "
                f"{format_digest_date(digest_window.end_nz_inclusive)}."
            ),
            "",
            f"Actions completed last week ({len(approved_actions)}):",
            *approved_lines,
            "",
            f"Items dismissed: {dismissed_count}",
            "",
            f"Outstanding ({len(stale_pending_actions)}):",
            *outstanding_lines,
            "",
            f"Clients needing attention ({len(clients_needing_attention)}):",
            *client_lines,
            "",
            "This week:",
            this_week_summary,
            "",
            "Olivander",
        ]
    )


def fetch_client_row(supabase: Client, client_id: UUID, user_id: str) -> dict[str, Any]:
    client_id_str = str(client_id)
    response = (
        supabase.table("clients")
        .select("*")
        .eq("id", client_id_str)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Client not found.")
    return rows[0]


def parse_optional_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_client_summary_fresh(client_row: dict[str, Any]) -> bool:
    generated_at = parse_optional_timestamp(client_row.get("summary_generated_at"))
    summary = client_row.get("summary")
    if not isinstance(summary, str) or not summary.strip() or generated_at is None:
        return False

    return generated_at >= datetime.now(timezone.utc) - timedelta(hours=24)


def update_client_summary(
    supabase: Client, client_id: UUID, user_id: str, summary: str
) -> dict[str, Any]:
    client_id_str = str(client_id)
    payload = {
        "summary": summary,
        "summary_generated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("clients").update(payload).eq("id", client_id_str).eq(
        "user_id", user_id
    ).execute()
    return fetch_client_row(supabase, client_id, user_id)


def insert_action(
    supabase: Client, user_id: str, generated_action: dict[str, Any]
) -> dict[str, Any]:
    payload = {
        "user_id": user_id,
        "status": "pending",
        "reasoning": generated_action["reasoning"],
        "action_label": generated_action["action_label"],
        "draft": generated_action["draft"],
        "confidence": generated_action["confidence"],
        "confidence_reason": generated_action["confidence_reason"],
        "priority_score": generated_action["priority_score"],
        "steps": generated_action["steps"],
    }
    logger.info(
        "Creating action for user_id=%s action_label=%s",
        user_id,
        generated_action["action_label"],
    )
    response = supabase.table("actions").insert(payload).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create action.")
    logger.info("Supabase insert action created_id=%s", rows[0].get("id"))
    return rows[0]


def update_action_status(
    supabase: Client, action_id: UUID, user_id: str, status: str
) -> dict[str, Any]:
    action_id_str = str(action_id)
    logger.info("Supabase update action_id=%s user_id=%s status=%s", action_id_str, user_id, status)
    supabase.table("actions").update({"status": status}).eq("id", action_id_str).eq(
        "user_id", user_id
    ).execute()
    response = (
        supabase.table("actions")
        .select("*")
        .eq("id", action_id_str)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Action not found.")
    logger.info("Supabase fetched updated action_id=%s", action_id_str)
    return rows[0]


async def refresh_google_access_token(refresh_token: str) -> str:
    client_id = get_env("GOOGLE_CLIENT_ID")
    client_secret = get_env("GOOGLE_CLIENT_SECRET")

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )

    if response.status_code >= 400:
        logger.error("Google token refresh failed status=%s body=%s", response.status_code, response.text)
        raise HTTPException(
            status_code=502,
            detail="Failed to refresh the Gmail connection. Please reconnect Google.",
        )

    access_token = response.json().get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise HTTPException(
            status_code=502,
            detail="Failed to refresh the Gmail connection. Please reconnect Google.",
        )

    return access_token.strip()


async def send_gmail_message(
    *,
    access_token: str,
    recipient_email: str,
    subject: str,
    body: str,
) -> None:
    message = EmailMessage()
    message["To"] = recipient_email
    message["From"] = f"Olivander <{recipient_email}>"
    message["Subject"] = subject
    message.set_content(body)

    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw_message},
        )

    if response.status_code >= 400:
        logger.error("Gmail send failed status=%s body=%s", response.status_code, response.text)
        raise HTTPException(status_code=502, detail="Failed to send the weekly digest email.")


def build_weekly_digest_context_payload(
    *,
    user_id: str,
    digest_window: DigestWindow,
    approved_actions: list[dict[str, Any]],
    dismissed_count: int,
    stale_pending_actions: list[dict[str, Any]],
    clients_needing_attention: list[dict[str, Any]],
    now_utc: datetime,
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "date_range": {
            "start": format_digest_date(digest_window.start_nz),
            "end": format_digest_date(digest_window.end_nz_inclusive),
        },
        "approved_actions_last_week": [
            build_digest_action_description(action) for action in approved_actions
        ],
        "dismissed_count_last_week": dismissed_count,
        "outstanding_actions": [
            build_pending_action_description(action, now_utc)
            for action in stale_pending_actions
        ],
        "clients_needing_attention": [
            build_client_attention_description(client)
            for client in clients_needing_attention
        ],
    }


async def generate_weekly_digest_summary_with_fallback(
    *,
    user_id: str,
    digest_window: DigestWindow,
    approved_actions: list[dict[str, Any]],
    dismissed_count: int,
    stale_pending_actions: list[dict[str, Any]],
    clients_needing_attention: list[dict[str, Any]],
    now_utc: datetime,
) -> str:
    digest_context = build_weekly_digest_context_payload(
        user_id=user_id,
        digest_window=digest_window,
        approved_actions=approved_actions,
        dismissed_count=dismissed_count,
        stale_pending_actions=stale_pending_actions,
        clients_needing_attention=clients_needing_attention,
        now_utc=now_utc,
    )

    try:
        return await call_gemini_for_weekly_digest_summary(digest_context)
    except HTTPException:
        logger.exception("Falling back to deterministic weekly digest summary user_id=%s", user_id)
        return build_fallback_weekly_digest_summary(
            approved_count=len(approved_actions),
            outstanding_count=len(stale_pending_actions),
            attention_count=len(clients_needing_attention),
        )


async def send_weekly_digest_for_user(
    supabase: Client,
    *,
    user_row: dict[str, Any],
    now_utc: datetime,
) -> dict[str, Any]:
    user_id = user_row.get("id")
    if not isinstance(user_id, str) or not user_id.strip():
        raise HTTPException(status_code=500, detail="User record is invalid.")

    recipient_email = user_row.get("email")
    if not isinstance(recipient_email, str) or not recipient_email.strip():
        raise HTTPException(status_code=400, detail="User email is unavailable for the weekly digest.")

    credentials_row = fetch_google_oauth_credentials(supabase, user_id)
    refresh_token = credentials_row.get("refresh_token") if credentials_row else None
    if not isinstance(refresh_token, str) or not refresh_token.strip():
        raise HTTPException(
            status_code=409,
            detail="Google sending access is not connected. Please sign in with Google again.",
        )

    digest_window = get_previous_week_digest_window(now_utc)
    approved_actions = fetch_approved_actions_for_digest(
        supabase,
        user_id=user_id,
        digest_window=digest_window,
    )
    dismissed_count = count_dismissed_actions_for_digest(
        supabase,
        user_id=user_id,
        digest_window=digest_window,
    )
    stale_pending_actions = fetch_stale_pending_actions(
        supabase,
        user_id=user_id,
        now_utc=now_utc,
    )
    clients_needing_attention = fetch_clients_needing_attention(
        supabase,
        user_id=user_id,
    )
    this_week_summary = await generate_weekly_digest_summary_with_fallback(
        user_id=user_id,
        digest_window=digest_window,
        approved_actions=approved_actions,
        dismissed_count=dismissed_count,
        stale_pending_actions=stale_pending_actions,
        clients_needing_attention=clients_needing_attention,
        now_utc=now_utc,
    )
    subject = build_weekly_digest_subject(digest_window)
    body = build_weekly_digest_body(
        recipient_name=str(user_row.get("name") or user_row.get("business_name") or "there"),
        digest_window=digest_window,
        approved_actions=approved_actions,
        dismissed_count=dismissed_count,
        stale_pending_actions=stale_pending_actions,
        clients_needing_attention=clients_needing_attention,
        this_week_summary=this_week_summary,
        now_utc=now_utc,
    )

    access_token = await refresh_google_access_token(refresh_token.strip())
    await send_gmail_message(
        access_token=access_token,
        recipient_email=recipient_email.strip(),
        subject=subject,
        body=body,
    )

    return {
        "user_id": user_id,
        "recipient_email": recipient_email.strip(),
        "subject": subject,
        "approved_count": len(approved_actions),
        "dismissed_count": dismissed_count,
        "outstanding_count": len(stale_pending_actions),
        "clients_needing_attention_count": len(clients_needing_attention),
    }


async def handle_gmail_notification(payload: dict[str, Any]) -> None:
    email_address = payload.get("emailAddress")
    history_id = payload.get("historyId")
    logger.info(
        "Handling Gmail notification email=%s history_id=%s",
        email_address,
        history_id,
    )

    user_id = None
    if email_address:
        supabase = get_supabase_client()
        user = fetch_user_by_email(supabase, email_address)
        user_id = user.get("id") if user else None

    await process_new_email(user_id, history_id, payload)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    logger.info("Incoming request method=%s path=%s", request.method, request.url.path)
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "Completed request method=%s path=%s status=%s duration_ms=%.2f",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Pragma", "no-cache")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


@app.exception_handler(RateLimitExceeded)
async def handle_rate_limit_exceeded(
    _request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": exc.detail,
            "retry_after_seconds": exc.retry_after_seconds,
        },
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid request payload.",
            "errors": exc.errors(),
        },
    )


async def get_current_user_dependency(request: Request) -> Any:
    return await get_authenticated_user(
        request,
        supabase_url=get_env("SUPABASE_URL"),
        service_role_key=get_env("SUPABASE_SERVICE_KEY"),
    )


def is_valid_digest_cron_request(request: Request) -> bool:
    configured_secret = os.getenv("DIGEST_CRON_SECRET", "").strip()
    if not configured_secret:
        return False

    received_secret = request.headers.get(DIGEST_CRON_HEADER, "").strip()
    return bool(received_secret) and hmac.compare_digest(received_secret, configured_secret)


async def get_authenticated_user_for_request(request: Request) -> AuthenticatedUser:
    return await get_authenticated_user(
        request,
        supabase_url=get_env("SUPABASE_URL"),
        service_role_key=get_env("SUPABASE_SERVICE_KEY"),
    )


@app.get("/")
async def health_check(request: Request) -> dict[str, str]:
    enforce_rate_limits(request, "health_check")
    return {"status": "Olivander API running"}


@app.post("/webhook/gmail")
async def gmail_webhook(
    envelope: GmailWebhookEnvelope,
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, bool]:
    try:
        payload = decode_base64_json(envelope.message.data)
        notification = GmailNotificationPayload.model_validate(payload)
        enforce_rate_limits(
            request,
            "gmail_webhook",
            user_identifier=notification.emailAddress,
        )
        logger.info(
            "Decoded Gmail webhook email=%s history_id=%s",
            notification.emailAddress,
            notification.historyId,
        )
        background_tasks.add_task(handle_gmail_notification, notification.model_dump())
    except RateLimitExceeded:
        raise
    except HTTPException:
        raise
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from exc
    except Exception:
        logger.exception("Failed to handle Gmail webhook")
        raise HTTPException(status_code=500, detail="Failed to handle webhook.")

    return {"ok": True}


@app.post("/actions/generate")
async def generate_action(
    request_body: GenerateActionRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user_dependency),
) -> dict[str, Any]:
    enforce_rate_limits(request, "actions_generate", user_identifier=current_user.id)
    supabase = get_supabase_client()
    generated_action = await call_gemini_for_action(
        request_body.situation,
        request_body.user_context,
    )
    created_row = insert_action(supabase, current_user.id, generated_action)
    return created_row


@app.post("/clients/{client_id}/summary")
async def generate_client_summary(
    client_id: UUID,
    request: Request,
    force: bool = False,
    current_user: AuthenticatedUser = Depends(get_current_user_dependency),
) -> dict[str, Any]:
    enforce_rate_limits(request, "client_summary", user_identifier=current_user.id)
    supabase = get_supabase_client()
    client_row = fetch_client_row(supabase, client_id, current_user.id)

    if not force and is_client_summary_fresh(client_row):
        return {
            "summary": client_row.get("summary"),
            "summary_generated_at": client_row.get("summary_generated_at"),
        }

    summary = await call_gemini_for_client_summary(client_row)
    updated_row = update_client_summary(supabase, client_id, current_user.id, summary)
    return {
        "summary": updated_row.get("summary"),
        "summary_generated_at": updated_row.get("summary_generated_at"),
    }


@app.post("/integrations/google/session")
async def sync_google_session(
    payload: GoogleSessionSyncRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user_dependency),
) -> dict[str, Any]:
    enforce_rate_limits(request, "provider_session_sync", user_identifier=current_user.id)

    if not payload.provider_refresh_token:
        return {"stored": False}

    supabase = get_supabase_client()
    ensure_public_user_row(
        supabase,
        user_id=current_user.id,
        email=current_user.email,
    )
    stored_row = store_google_refresh_token(
        supabase,
        user_id=current_user.id,
        provider_email=current_user.email,
        refresh_token=payload.provider_refresh_token,
    )
    return {
        "stored": True,
        "updated_at": stored_row.get("updated_at"),
    }


@app.post("/digest/send")
async def send_weekly_digest(request: Request) -> dict[str, Any]:
    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc)

    if is_valid_digest_cron_request(request):
        users = fetch_weekly_digest_enabled_users(supabase)
        results: list[dict[str, Any]] = []
        sent_count = 0
        skipped_count = 0
        failed_count = 0

        for user_row in users:
            user_id = str(user_row.get("id") or "")
            try:
                result = await send_weekly_digest_for_user(
                    supabase,
                    user_row=user_row,
                    now_utc=now_utc,
                )
                results.append(
                    {
                        "user_id": user_id,
                        "status": "sent",
                        "recipient_email": result["recipient_email"],
                    }
                )
                sent_count += 1
            except HTTPException as exc:
                status = "skipped" if exc.status_code in {400, 409} else "failed"
                results.append(
                    {
                        "user_id": user_id,
                        "status": status,
                        "detail": exc.detail,
                    }
                )
                if status == "skipped":
                    skipped_count += 1
                else:
                    failed_count += 1
            except Exception as exc:
                logger.exception("Weekly digest batch send failed user_id=%s", user_id)
                results.append(
                    {
                        "user_id": user_id,
                        "status": "failed",
                        "detail": str(exc),
                    }
                )
                failed_count += 1

        return {
            "mode": "batch",
            "attempted": len(users),
            "sent": sent_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "results": results,
        }

    current_user = await get_authenticated_user_for_request(request)
    enforce_rate_limits(request, "digest_send", user_identifier=current_user.id)
    user_row = ensure_public_user_row(
        supabase,
        user_id=current_user.id,
        email=current_user.email,
    )
    result = await send_weekly_digest_for_user(
        supabase,
        user_row=user_row,
        now_utc=now_utc,
    )
    return {
        "mode": "single",
        "status": "sent",
        **result,
    }


@app.post("/actions/{action_id}/approve")
async def approve_action(
    action_id: UUID,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user_dependency),
) -> dict[str, Any]:
    enforce_rate_limits(request, "actions_mutation", user_identifier=current_user.id)
    supabase = get_supabase_client()
    updated_row = update_action_status(supabase, action_id, current_user.id, "approved")
    logger.info("would send email for action_id=%s user_id=%s", action_id, current_user.id)
    return updated_row


@app.post("/actions/{action_id}/dismiss")
async def dismiss_action(
    action_id: UUID,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user_dependency),
) -> dict[str, Any]:
    enforce_rate_limits(request, "actions_mutation", user_identifier=current_user.id)
    supabase = get_supabase_client()
    updated_row = update_action_status(supabase, action_id, current_user.id, "dismissed")
    return updated_row
