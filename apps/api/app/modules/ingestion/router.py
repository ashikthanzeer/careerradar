from typing import Any
from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.modules.ingestion.live_fetcher import (
    get_user_fetch_quota,
    trigger_profile_job_fetch_for_user,
)
from app.modules.ingestion.service import (
    IngestionRunReportSchema,
    RawFeedItemSchema,
    get_ingestion_and_freshness_status,
    run_ingestion_batch,
)

router = APIRouter(prefix="/ingestion", tags=["Phase 4: Data Ingestion & Freshness"])


class LiveFetchInputSchema(BaseModel):
    query: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=50, ge=1, le=100)
    triggerSource: str = Field(default="manual")


@router.post("/run", response_model=IngestionRunReportSchema)
def trigger_ingestion_run(
    items: list[RawFeedItemSchema] | None = Body(default=None),
    db: Session = Depends(get_db),
) -> IngestionRunReportSchema:
    return run_ingestion_batch(db, items=items)


@router.post("/fetch-live")
def trigger_live_public_fetch(
    payload: LiveFetchInputSchema = Body(default_factory=LiveFetchInputSchema),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return trigger_profile_job_fetch_for_user(
        db,
        user_id=current_user.id,
        trigger_source=payload.triggerSource,
        custom_query=payload.query,
        limit=payload.limit,
    )


@router.post("/fetch-for-profile")
def trigger_fetch_for_profile(
    payload: LiveFetchInputSchema = Body(default_factory=LiveFetchInputSchema),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return trigger_profile_job_fetch_for_user(
        db,
        user_id=current_user.id,
        trigger_source=payload.triggerSource,
        custom_query=payload.query,
        limit=payload.limit,
    )


@router.get("/quota")
def read_user_fetch_quota(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_user_fetch_quota(db, current_user.id)


@router.get("/status")
def read_ingestion_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_ingestion_and_freshness_status(db)

