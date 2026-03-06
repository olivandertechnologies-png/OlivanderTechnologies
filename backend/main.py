import base64
import json
import logging
import os
import time
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from supabase import Client, create_client

from backend.security import (
    MAX_ACTION_DRAFT_LENGTH,
    MAX_ACTION_LABEL_LENGTH,
    MAX_ACTION_REASONING_LENGTH,
    AuthenticatedUser,
    GenerateActionRequest,
    GmailNotificationPayload,
    GmailWebhookEnvelope,
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
    },
    "required": ["reasoning", "action", "draft"],
}
ACTION_SYSTEM_PROMPT = (
    "You are Olivander, an AI business agent for a New Zealand sole trader. "
    "Given a business situation and user context, respond with exactly one JSON object "
    'containing keys "reasoning", "action", and "draft". '
    '"reasoning" should be one sentence that explains why the action is needed. '
    '"action" should be a short action label. '
    '"draft" should be the full prepared message or email in a natural professional tone.'
)


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


def parse_generated_action(response_json: dict[str, Any]) -> dict[str, str]:
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
    }


async def call_gemini_for_action(
    situation: str, user_context: dict[str, Any]
) -> dict[str, str]:
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


def insert_action(
    supabase: Client, user_id: str, generated_action: dict[str, str]
) -> dict[str, Any]:
    payload = {
        "user_id": user_id,
        "status": "pending",
        "reasoning": generated_action["reasoning"],
        "action_label": generated_action["action_label"],
        "draft": generated_action["draft"],
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
