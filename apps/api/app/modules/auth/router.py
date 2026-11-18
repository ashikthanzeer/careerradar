import hashlib
from typing import Any, Literal
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import (
    BETTER_AUTH_COOKIE_NAME,
    AuthenticatedUser,
    create_access_token,
    create_oauth_state,
    extract_session_token,
    get_current_user,
    mark_user_deleted,
    resolve_user_from_token,
    unmark_user_deleted,
    verify_access_token,
)
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import CareerProfile, User, UserSkill, utc_now_iso
from app.modules.applications.service import (
    list_saved_opportunities,
    list_user_applications,
)
from app.modules.ingestion.live_fetcher import (
    get_user_fetch_quota,
    trigger_profile_job_fetch_for_user,
)
from app.modules.profile.service import get_or_create_profile

router = APIRouter(prefix="/auth", tags=["Authentication (Google OAuth)"])
better_auth_router = APIRouter(prefix="/api/auth", tags=["Better Auth"])

OAuthProvider = Literal["google"]

# Idempotency cache for single-use OAuth authorization codes (protects against React StrictMode double calls)
_EXCHANGED_CODES: dict[str, "AuthSessionResponseSchema"] = {}


class UserResponseSchema(BaseModel):
    id: str
    email: str
    displayName: str
    provider: str
    avatarUrl: str | None = None
    createdAt: str


class BetterAuthSessionMetaSchema(BaseModel):
    token: str
    userId: str


class AuthSessionResponseSchema(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserResponseSchema
    session: BetterAuthSessionMetaSchema
    onboardingRequired: bool = False
    staleLoginFetchTriggered: bool = False


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
    redirectUri: str | None = None


class SocialSignInInputSchema(BaseModel):
    provider: OAuthProvider = "google"
    callbackURL: str | None = "/discover"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=BETTER_AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        path="/",
    )


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

    unmark_user_deleted(user.id)
    db.commit()
    db.refresh(user)
    return user


def _build_google_authorize_url(state: str, redirect_uri: str | None = None) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri or settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def _exchange_google_code_for_profile(
    code: str, redirect_uri: str | None = None
) -> tuple[str, str, str | None, str | None]:
    """Exchanges an OAuth 2.0 authorization code with Google."""
    effective_redirect = redirect_uri or settings.google_redirect_uri
    with httpx.Client(timeout=10.0) as http:
        token_res = http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": effective_redirect,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google token exchange failed: {token_res.text}",
            )
        access_token = token_res.json()["access_token"]
        userinfo_res = http.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_res.raise_for_status()
        userinfo = userinfo_res.json()
        return (
            userinfo["email"],
            userinfo.get("name") or userinfo["email"].split("@")[0],
            userinfo.get("sub"),
            userinfo.get("picture"),
        )


def _issue_session_response(
    db: Session,
    response: Response,
    provider: OAuthProvider,
    email: str,
    display_name: str,
    account_id: str | None,
    avatar_url: str | None,
) -> AuthSessionResponseSchema:
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
    _set_session_cookie(response, jwt_token)

    quota = get_user_fetch_quota(db, user.id)
    skill_count = len(db.scalars(select(UserSkill).where(UserSkill.user_id == user.id)).all())
    onboarding_required = (not quota["onboardingCompleted"]) and skill_count == 0
    stale_triggered = False
    if quota["isStaleForLoginTrigger"]:
        try:
            fetch_res = trigger_profile_job_fetch_for_user(
                db, user.id, trigger_source="stale_login", limit=50
            )
            stale_triggered = bool(fetch_res.get("triggered"))
        except Exception:
            stale_triggered = False

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
        session=BetterAuthSessionMetaSchema(
            token=jwt_token,
            userId=user.id,
        ),
        onboardingRequired=onboarding_required,
        staleLoginFetchTriggered=stale_triggered,
    )


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
def get_oauth_authorize_url(
    provider: OAuthProvider,
    redirect_uri: str | None = Query(default=None),
) -> OAuthAuthorizeResponseSchema:
    state = create_oauth_state(provider)

    if not settings.google_client_id or not settings.google_client_secret:
        return OAuthAuthorizeResponseSchema(
            provider="google",
            configuredClientCredentials=False,
            authorizationUrl=None,
            state=state,
        )
    return OAuthAuthorizeResponseSchema(
        provider="google",
        configuredClientCredentials=True,
        authorizationUrl=_build_google_authorize_url(state, redirect_uri=redirect_uri),
        state=state,
    )


@router.post(
    "/oauth/{provider}/callback",
    response_model=AuthSessionResponseSchema,
)
def complete_oauth_callback(
    provider: OAuthProvider,
    payload: OAuthCallbackInputSchema,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthSessionResponseSchema:
    if payload.code and payload.code in _EXCHANGED_CODES:
        cached = _EXCHANGED_CODES[payload.code]
        _set_session_cookie(response, cached.accessToken)
        return cached

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
        email, display_name, account_id, avatar_url = (
            _exchange_google_code_for_profile(
                payload.code, redirect_uri=payload.redirectUri
            )
        )
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

    session_res = _issue_session_response(
        db=db,
        response=response,
        provider=provider,
        email=email,
        display_name=display_name,
        account_id=account_id,
        avatar_url=avatar_url,
    )
    if payload.code:
        _EXCHANGED_CODES[payload.code] = session_res
    return session_res


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
    response: Response,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Permanently deletes the user's account and all associated data (PRD §15)."""
    mark_user_deleted(current_user.id)
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is not None:
        db.delete(user)
        db.commit()
    response.delete_cookie(key=BETTER_AUTH_COOKIE_NAME, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# Better Auth Compatible Protocol Endpoints (/api/auth/*)
# ==============================================================================


@better_auth_router.post("/sign-in/social")
def better_auth_social_sign_in(
    payload: SocialSignInInputSchema,
) -> dict[str, Any]:
    state = create_oauth_state(payload.provider)
    configured = bool(settings.google_client_id and settings.google_client_secret)
    if not configured:
        return {
            "redirect": False,
            "configuredClientCredentials": False,
            "url": None,
            "state": state,
        }
    auth_url = _build_google_authorize_url(state)
    return {
        "redirect": True,
        "configuredClientCredentials": True,
        "url": auth_url,
        "state": state,
    }


@better_auth_router.get("/callback/google")
def better_auth_google_callback(
    code: str = Query(...),
    state: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if state:
        state_claims = verify_access_token(state)
        if state_claims.get("provider") != "google":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state provider mismatch.",
            )

    if code in _EXCHANGED_CODES:
        session_res = _EXCHANGED_CODES[code]
    else:
        email, display_name, account_id, avatar_url = (
            _exchange_google_code_for_profile(code)
        )
        dummy_response = Response()
        session_res = _issue_session_response(
            db=db,
            response=dummy_response,
            provider="google",
            email=email,
            display_name=display_name,
            account_id=account_id,
            avatar_url=avatar_url,
        )
        _EXCHANGED_CODES[code] = session_res

    target_path = "/onboarding" if session_res.onboardingRequired else "/discover"
    redirect_target = f"{settings.frontend_url.rstrip('/')}{target_path}"
    redirect_res = RedirectResponse(url=redirect_target, status_code=302)
    _set_session_cookie(redirect_res, session_res.accessToken)
    return redirect_res


@better_auth_router.get("/get-session")
def better_auth_get_session(
    token: str | None = Depends(extract_session_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not token:
        return {"session": None, "user": None}
    try:
        auth_user = resolve_user_from_token(db, token)
    except HTTPException:
        return {"session": None, "user": None}

    user_row = db.scalar(select(User).where(User.id == auth_user.id))
    return {
        "session": {
            "token": token,
            "userId": auth_user.id,
        },
        "user": {
            "id": auth_user.id,
            "email": auth_user.email,
            "displayName": auth_user.display_name,
            "provider": auth_user.provider,
            "avatarUrl": auth_user.avatar_url,
            "createdAt": user_row.created_at if user_row else utc_now_iso(),
        },
    }


@better_auth_router.post("/sign-out")
def better_auth_sign_out(response: Response) -> dict[str, bool]:
    response.delete_cookie(key=BETTER_AUTH_COOKIE_NAME, path="/")
    return {"success": True}
