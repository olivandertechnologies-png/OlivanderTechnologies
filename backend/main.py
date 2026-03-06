import base64
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client

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
        "reasoning": {"type": "STRING"},
        "action": {"type": "STRING"},
        "draft": {"type": "STRING"},
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


class GenerateActionRequest(BaseModel):
    user_id: str
    situation: str
    user_context: dict[str, Any] = Field(default_factory=dict)


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        logger.error("Missing required environment variable: %s", name)
        raise HTTPException(status_code=500, detail="Server configuration is incomplete.")
    return value


def get_supabase_client() -> Client:
    url = get_env("SUPABASE_URL")
    key = get_env("SUPABASE_SERVICE_KEY")
    logger.info("Creating Supabase client for %s", url)
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
        "reasoning": reasoning.strip(),
        "title": action.strip(),
        "draft": draft.strip(),
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
        logger.error("Gemini error body=%s", response.text)
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
        "process_new_email stub user_id=%s history_id=%s payload=%s",
        user_id,
        history_id,
        payload,
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
        "title": generated_action["title"],
        "draft": generated_action["draft"],
    }
    logger.info("Supabase insert action payload=%s", payload)
    response = supabase.table("actions").insert(payload).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create action.")
    logger.info("Supabase insert action created_id=%s", rows[0].get("id"))
    return rows[0]


def update_action_status(
    supabase: Client, action_id: str, status: str
) -> dict[str, Any]:
    logger.info("Supabase update action_id=%s status=%s", action_id, status)
    supabase.table("actions").update({"status": status}).eq("id", action_id).execute()
    response = supabase.table("actions").select("*").eq("id", action_id).limit(1).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Action not found.")
    logger.info("Supabase fetched updated action_id=%s", action_id)
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
    return response


@app.get("/")
async def health_check() -> dict[str, str]:
    return {"status": "Olivander API running"}


@app.post("/webhook/gmail")
async def gmail_webhook(
    request: Request, background_tasks: BackgroundTasks
) -> dict[str, bool]:
    try:
        body = await request.json()
        logger.info("Received Gmail webhook body=%s", body)

        message = body.get("message", {})
        encoded_data = message.get("data")
        if not encoded_data:
            logger.warning("Gmail webhook missing message.data")
            return {"ok": True}

        payload = decode_base64_json(encoded_data)
        email_address = payload.get("emailAddress")
        history_id = payload.get("historyId")
        logger.info(
            "Decoded Gmail webhook email=%s history_id=%s",
            email_address,
            history_id,
        )
        background_tasks.add_task(handle_gmail_notification, payload)
    except Exception:
        logger.exception("Failed to handle Gmail webhook")

    return {"ok": True}


@app.post("/actions/generate")
async def generate_action(request_body: GenerateActionRequest) -> dict[str, Any]:
    supabase = get_supabase_client()
    generated_action = await call_gemini_for_action(
        request_body.situation,
        request_body.user_context,
    )
    created_row = insert_action(supabase, request_body.user_id, generated_action)
    return created_row


@app.post("/actions/{action_id}/approve")
async def approve_action(action_id: str) -> dict[str, Any]:
    supabase = get_supabase_client()
    updated_row = update_action_status(supabase, action_id, "approved")
    logger.info("would send email for action_id=%s", action_id)
    return updated_row


@app.post("/actions/{action_id}/dismiss")
async def dismiss_action(action_id: str) -> dict[str, Any]:
    supabase = get_supabase_client()
    updated_row = update_action_status(supabase, action_id, "dismissed")
    return updated_row
