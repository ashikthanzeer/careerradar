import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import User


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    display_name: str
    provider: str
    avatar_url: str | None = None


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(encoded: str) -> bytes:
    padding = "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(encoded + padding)


def create_access_token(
    user_id: str,
    email: str,
    display_name: str,
    provider: str,
    expires_in_seconds: int | None = None,
) -> str:
    """Creates an RFC 7519 HMAC-SHA256 signed JWT token."""
    ttl = (
        expires_in_seconds
        if expires_in_seconds is not None
        else settings.jwt_expire_minutes * 60
    )
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": email,
        "name": display_name,
        "provider": provider,
        "iat": now,
        "exp": now + ttl,
    }
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def verify_access_token(token: str) -> dict[str, Any]:
    """Verifies an HMAC-SHA256 JWT token signature and expiration."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token.",
        )
    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    try:
        actual_sig = _b64url_decode(sig_b64)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token encoding.",
        ) from exc

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token signature.",
        )

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        ) from exc

    now = int(time.time())
    if int(payload.get("exp", 0)) < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please sign in again.",
        )
    return payload


def create_oauth_state(provider: str) -> str:
    return create_access_token(
        user_id=f"oauth_state_{provider}",
        email="state@careerradar.local",
        display_name=provider,
        provider=provider,
        expires_in_seconds=600,
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    """
    Resolves the authenticated user strictly from the Authorization Bearer JWT header.
    Rejects missing or invalid tokens with 401 Unauthorized.
    """
    if not authorization or not authorization.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with Google.",
        )

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected 'Bearer <token>'.",
        )

    token = parts[1].strip()
    claims = verify_access_token(token)
    user_id = str(claims.get("sub", ""))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user subject in token.",
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or has been deleted.",
        )

    return AuthenticatedUser(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        provider=user.authentication_provider,
        avatar_url=user.avatar_url,
    )
