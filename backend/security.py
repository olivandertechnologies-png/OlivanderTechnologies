import logging
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Annotated

import httpx
from fastapi import HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

logger = logging.getLogger("olivander-api.security")

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
CONTEXT_KEY_PATTERN = r"^[a-z0-9_.:-]{1,40}$"

MAX_ACTION_REASONING_LENGTH = 240
MAX_ACTION_LABEL_LENGTH = 120
MAX_ACTION_DRAFT_LENGTH = 4000
MAX_SITUATION_LENGTH = 2000
MAX_CONTEXT_VALUE_LENGTH = 400
MAX_CONTEXT_ITEMS = 12
MAX_BASE64_DATA_LENGTH = 4096
MAX_HISTORY_ID_LENGTH = 64


def sanitize_text(
    value: str,
    *,
    field_name: str,
    max_length: int,
    multiline: bool = False,
    allow_empty: bool = False,
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string.")

    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    cleaned_chars: list[str] = []

    for char in normalized:
        if char == "\n":
            if multiline:
                cleaned_chars.append(char)
            continue

        if char == "\t":
            cleaned_chars.append(" " if multiline else "")
            continue

        if char.isprintable():
            cleaned_chars.append(char)

    cleaned = "".join(cleaned_chars).strip()

    if not allow_empty and not cleaned:
        raise ValueError(f"{field_name} must not be blank.")

    if len(cleaned) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters.")

    return cleaned


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


SafeContextKey = Annotated[
    str,
    StringConstraints(min_length=1, max_length=40, pattern=CONTEXT_KEY_PATTERN),
]


class GenerateActionRequest(StrictModel):
    situation: str = Field(min_length=1, max_length=MAX_SITUATION_LENGTH)
    user_context: dict[SafeContextKey, str] = Field(default_factory=dict)

    @field_validator("situation")
    @classmethod
    def validate_situation(cls, value: str) -> str:
        return sanitize_text(
            value,
            field_name="situation",
            max_length=MAX_SITUATION_LENGTH,
            multiline=True,
        )

    @field_validator("user_context")
    @classmethod
    def validate_user_context(cls, value: dict[SafeContextKey, str]) -> dict[str, str]:
        if len(value) > MAX_CONTEXT_ITEMS:
            raise ValueError(
                f"user_context must contain at most {MAX_CONTEXT_ITEMS} entries."
            )

        return {
            key: sanitize_text(
                item,
                field_name=f"user_context.{key}",
                max_length=MAX_CONTEXT_VALUE_LENGTH,
                multiline=True,
            )
            for key, item in value.items()
        }


class PubSubMessage(StrictModel):
    data: str = Field(min_length=1, max_length=MAX_BASE64_DATA_LENGTH)
    attributes: dict[str, str] = Field(default_factory=dict)
    messageId: str | None = Field(default=None, min_length=1, max_length=128)
    orderingKey: str | None = Field(default=None, max_length=128)
    publishTime: str | None = Field(default=None, max_length=64)


class GmailWebhookEnvelope(StrictModel):
    message: PubSubMessage
    subscription: str | None = Field(default=None, min_length=1, max_length=512)


class GmailNotificationPayload(StrictModel):
    emailAddress: str = Field(min_length=3, max_length=254)
    historyId: str = Field(min_length=1, max_length=MAX_HISTORY_ID_LENGTH)

    @field_validator("emailAddress")
    @classmethod
    def validate_email_address(cls, value: str) -> str:
        cleaned = sanitize_text(
            value,
            field_name="emailAddress",
            max_length=254,
        ).lower()

        if not re.fullmatch(EMAIL_PATTERN, cleaned):
            raise ValueError("emailAddress must be a valid email address.")

        return cleaned

    @field_validator("historyId")
    @classmethod
    def validate_history_id(cls, value: str) -> str:
        cleaned = sanitize_text(
            value,
            field_name="historyId",
            max_length=MAX_HISTORY_ID_LENGTH,
        )

        if not cleaned.isdigit():
            raise ValueError("historyId must be numeric.")

        return cleaned


class AuthenticatedUser(StrictModel):
    id: Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return None

        cleaned = sanitize_text(
            value,
            field_name="email",
            max_length=254,
        ).lower()

        if not re.fullmatch(EMAIL_PATTERN, cleaned):
            raise ValueError("email must be a valid email address.")

        return cleaned


@dataclass(frozen=True)
class RateLimitRule:
    scope: str
    limit: int
    window_seconds: int


class RateLimitExceeded(Exception):
    def __init__(self, *, detail: str, retry_after_seconds: int) -> None:
        self.detail = detail
        self.retry_after_seconds = retry_after_seconds
        super().__init__(detail)


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, limit: int, window_seconds: int) -> int | None:
        now = time.monotonic()
        window_start = now - window_seconds

        with self._lock:
            bucket = self._events[key]

            while bucket and bucket[0] <= window_start:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return retry_after

            bucket.append(now)

        return None


RATE_LIMITS: dict[str, tuple[RateLimitRule, ...]] = {
    "health_check": (
        RateLimitRule(scope="ip", limit=120, window_seconds=60),
    ),
    "gmail_webhook": (
        RateLimitRule(scope="ip", limit=30, window_seconds=60),
        RateLimitRule(scope="user", limit=20, window_seconds=300),
    ),
    "actions_generate": (
        RateLimitRule(scope="ip", limit=20, window_seconds=60),
        RateLimitRule(scope="user", limit=10, window_seconds=60),
    ),
    "actions_mutation": (
        RateLimitRule(scope="ip", limit=40, window_seconds=60),
        RateLimitRule(scope="user", limit=20, window_seconds=60),
    ),
}

rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_rate_limits(
    request: Request,
    route_name: str,
    *,
    user_identifier: str | None = None,
) -> None:
    rules = RATE_LIMITS.get(route_name, ())
    client_ip = get_client_ip(request)

    for rule in rules:
        identifier = client_ip if rule.scope == "ip" else user_identifier
        if not identifier:
            continue

        retry_after = rate_limiter.hit(
            key=f"{route_name}:{rule.scope}:{identifier}",
            limit=rule.limit,
            window_seconds=rule.window_seconds,
        )

        if retry_after is not None:
            raise RateLimitExceeded(
                detail="Rate limit exceeded. Please slow down and try again shortly.",
                retry_after_seconds=retry_after,
            )


async def get_authenticated_user(
    request: Request,
    *,
    supabase_url: str,
    service_role_key: str,
) -> AuthenticatedUser:
    authorization = request.headers.get("Authorization", "").strip()
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = token.strip()
    if len(token) > 4096:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    auth_url = f"{supabase_url.rstrip('/')}/auth/v1/user"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            auth_url,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {token}",
            },
        )

    if response.status_code in {401, 403}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
        )

    if response.status_code >= 400:
        logger.error("Supabase auth lookup failed with status=%s", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication provider is unavailable.",
        )

    return AuthenticatedUser.model_validate(response.json())
