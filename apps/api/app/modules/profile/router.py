from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.modules.profile.extractor import (
    extract_profile_from_resume,
    extract_profile_from_sources,
)
from app.modules.profile.service import get_or_create_profile, update_user_profile
from app.schemas.api_schemas import CareerProfileSchema

router = APIRouter(tags=["Profile"])


class ResumeExtractInputSchema(BaseModel):
    text: str | None = None
    filename: str | None = None
    fileBase64: str | None = None


class SourcesExtractInputSchema(BaseModel):
    linkedinUrl: str | None = None
    portfolioUrl: str | None = None
    githubUrl: str | None = None
    pastedText: str | None = None


@router.get("/profile", response_model=CareerProfileSchema)
def read_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CareerProfileSchema:
    return get_or_create_profile(db, current_user.id)


@router.put("/profile", response_model=CareerProfileSchema)
def save_profile(
    payload: CareerProfileSchema,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CareerProfileSchema:
    return update_user_profile(db, current_user.id, payload)


@router.post("/profile/extract-resume")
def extract_profile_resume(
    payload: ResumeExtractInputSchema,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    return extract_profile_from_resume(
        text=payload.text,
        filename=payload.filename,
        file_base64=payload.fileBase64,
    )


@router.post("/profile/extract-sources")
def extract_profile_sources(
    payload: SourcesExtractInputSchema,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    return extract_profile_from_sources(
        linkedin_url=payload.linkedinUrl,
        portfolio_url=payload.portfolioUrl,
        github_url=payload.githubUrl,
        pasted_text=payload.pastedText,
    )

