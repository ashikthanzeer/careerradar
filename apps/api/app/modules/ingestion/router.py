from typing import Any
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.ingestion.service import (
    IngestionRunReportSchema,
    RawFeedItemSchema,
    get_ingestion_and_freshness_status,
    run_ingestion_batch,
)

router = APIRouter(prefix="/ingestion", tags=["Phase 4: Data Ingestion & Freshness"])


@router.post("/run", response_model=IngestionRunReportSchema)
def trigger_ingestion_run(
    items: list[RawFeedItemSchema] | None = Body(default=None),
    db: Session = Depends(get_db),
) -> IngestionRunReportSchema:
    return run_ingestion_batch(db, items=items)


@router.get("/status")
def read_ingestion_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_ingestion_and_freshness_status(db)

