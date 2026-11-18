import hashlib
from typing import Any, Literal
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import (
    AuthenticatedUser,
    create_access_token,
    create_oauth_state,
    get_current_user,
    verify_access_token,
)
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import CareerProfile, User, utc_now_iso
from app.modules.applications.service import (
    list_saved_opportunities,
    list_user_applications,
)
from app.modules.profile.service import get_or_create_profile

router = APIRouter(prefix="/auth", tags=["Authentication (Google OAuth)"])

OAuthProvider = Literal["google"]


class UserResponseSchema(BaseModel):
    id: str
    email: str
    displayName: str
    provider: str
    avatarUrl: str | None = None
    createdAt: str


class AuthSessionResponseSchema(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserResponseSchema


class OAuthAuthorizeResponseSchema(BaseModel):
    provider: OAuthProvider
    configuredClientCredentials: bool
    authorizationUrl: str | None
    state: str


class OAuthCallbackInputSchema(BaseModel):
    code: str | None = None
    state: str | None = None
    email: str | None = None
    displayName: str | None = None
    avatarUrl: str | None = None


def _upsert_oauth_user(
    db: Session,
    provider: OAuthProvider,
    email: str,
    display_name: str,
    provider_account_id: str | None = None,
    avatar_url: str | None = None,
) -> User:
    clean_email = email.strip().lower()
    if "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid email address is required.",
        )

    now = utc_now_iso()
    user = db.scalar(select(User).where(User.email == clean_email))
    if user is None:
        digest = hashlib.sha256(clean_email.encode("utf-8")).hexdigest()[:12]
        user = User(
            id=f"usr_{digest}",
            email=clean_email,
            display_name=display_name.strip() or clean_email.split("@")[0],
            authentication_provider=provider,
            provider_account_id=provider_account_id,
            avatar_url=avatar_url,
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        db.flush()

        # Ensure a clean CareerProfile is initialized for this user (no dummy data)
        profile = CareerProfile(
            id=f"profile_{user.id}",
            user_id=user.id,
            display_name=user.display_name,
            education_level="undergraduate",
            field_of_study="Computer Science",
            institution="University",
            graduation_year=2027,
            preferred_roles=["software_engineering"],
            preferred_domains=["Developer Tools & Cloud"],
            preferred_locations=["Remote"],
            work_modes=["remote", "hybrid", "onsite"],
            preferred_duration="3 to 6 months",
            compensation_preference=0,
            career_interests_summary="",
            projects=[],
            updated_at=now,
        )
        db.add(profile)
    else:
        if display_name.strip():
            user.display_name = display_name.strip()
        user.authentication_provider = provider
        if provider_account_id:
            user.provider_account_id = provider_account_id
        if avatar_url:
            user.avatar_url = avatar_url
        user.updated_at = now

    db.commit()
    db.refresh(user)
    return user


@router.get("/providers")
def list_oauth_providers() -> dict[str, Any]:
    return {
        "providers": [
            {
                "id": "google",
                "name": "Google",
                "configured": bool(
                    settings.google_client_id and settings.google_client_secret
                ),
            }
        ]
    }


@router.get(
    "/oauth/{provider}/authorize",
    response_model=OAuthAuthorizeResponseSchema,
)
def get_oauth_authorize_url(provider: OAuthProvider) -> OAuthAuthorizeResponseSchema:
    state = create_oauth_state(provider)

    if not settings.google_client_id:
        return OAuthAuthorizeResponseSchema(
            provider="google",
            configuredClientCredentials=False,
            authorizationUrl=None,
            state=state,
        )
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return OAuthAuthorizeResponseSchema(
        provider="google",
        configuredClientCredentials=True,
        authorizationUrl=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
        state=state,
    )


def _exchange_provider_code_for_profile(
    _provider: OAuthProvider, code: str
) -> tuple[str, str, str | None, str | None]:
    """Exchanges an OAuth 2.0 authorization code with Google."""
    with httpx.Client(timeout=10.0) as http:
        token_res = http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]
        userinfo = http.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        ).json()
        return (
            userinfo["email"],
            userinfo.get("name") or userinfo["email"].split("@")[0],
            userinfo.get("sub"),
            userinfo.get("picture"),
        )


@router.post(
    "/oauth/{provider}/callback",
    response_model=AuthSessionResponseSchema,
)
def complete_oauth_callback(
    provider: OAuthProvider,
    payload: OAuthCallbackInputSchema,
    db: Session = Depends(get_db),
) -> AuthSessionResponseSchema:
    if payload.state:
        state_claims = verify_access_token(payload.state)
        if state_claims.get("provider") != provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state provider mismatch.",
            )

    provider_configured = bool(
        settings.google_client_id and settings.google_client_secret
    )

    if payload.code and provider_configured:
        try:
            email, display_name, account_id, avatar_url = (
                _exchange_provider_code_for_profile(provider, payload.code)
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange {provider} authorization code: {exc}",
            ) from exc
    elif payload.email:
        email = payload.email.strip()
        display_name = (
            payload.displayName.strip()
            if payload.displayName and payload.displayName.strip()
            else email.split("@")[0]
        )
        account_id = f"{provider}_{email}"
        avatar_url = payload.avatarUrl
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing OAuth authorization code or identity email for {provider}.",
        )

    user = _upsert_oauth_user(
        db=db,
        provider=provider,
        email=email,
        display_name=display_name,
        provider_account_id=account_id,
        avatar_url=avatar_url,
    )

    jwt_token = create_access_token(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        provider=user.authentication_provider,
    )

    return AuthSessionResponseSchema(
        accessToken=jwt_token,
        tokenType="bearer",
        user=UserResponseSchema(
            id=user.id,
            email=user.email,
            displayName=user.display_name,
            provider=user.authentication_provider,
            avatarUrl=user.avatar_url,
            createdAt=user.created_at,
        ),
    )


@router.get("/me", response_model=UserResponseSchema)
def get_me(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponseSchema:
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserResponseSchema(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        provider=user.authentication_provider,
        avatarUrl=user.avatar_url,
        createdAt=user.created_at,
    )


@router.get("/export")
def export_user_data(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Exports all personal data belonging to the authenticated user (PRD §15)."""
    profile = get_or_create_profile(db, current_user.id)
    saved = list_saved_opportunities(db, current_user.id)
    applications = list_user_applications(db, current_user.id)
    return {
        "exportedAt": utc_now_iso(),
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "displayName": current_user.display_name,
            "provider": current_user.provider,
        },
        "profile": profile.model_dump(),
        "savedOpportunities": [s.model_dump() for s in saved],
        "applications": [a.model_dump() for a in applications],
    }


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_account(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Permanently deletes the user's account and all associated data (PRD §15)."""
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is not None:
        db.delete(user)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

