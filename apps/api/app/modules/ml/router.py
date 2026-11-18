from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.ml.evaluation_pipeline import run_reproducible_ml_evaluation
from app.modules.ml.hybrid_search import run_hybrid_semantic_search

router = APIRouter(prefix="/ml", tags=["Phase 5: ML Systems & Evaluation"])


@router.get("/search")
def hybrid_search(
    q: str = Query(..., min_length=1, description="Semantic and lexical search query"),
    alpha: float = Query(default=0.45, ge=0.0, le=1.0),
    excludeElevatedRisk: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return run_hybrid_semantic_search(
        db=db,
        query=q,
        alpha=alpha,
        exclude_elevated_risk=excludeElevatedRisk,
    )


@router.get("/evaluation")
def get_ml_evaluation_report() -> dict[str, Any]:
    return run_reproducible_ml_evaluation()

