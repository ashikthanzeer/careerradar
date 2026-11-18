from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.modules.discovery.service import (
    create_and_evaluate_opportunity,
    get_opportunity_for_user,
    list_opportunities_for_user,
)
from app.schemas.api_schemas import (
    CreateOpportunityInputSchema,
    EnrichedOpportunitySchema,
    OpportunityAnalysisSchema,
    PaginatedResponseSchema,
    TrustAssessmentSchema,
)

router = APIRouter(tags=["Opportunities, Intelligence & Recommendations"])


@router.get(
    "/opportunities",
    response_model=PaginatedResponseSchema[EnrichedOpportunitySchema],
)
def get_opportunities(
    q: str | None = Query(default=None),
    opportunityType: str | None = Query(default=None),
    roleCategory: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    workMode: str | None = Query(default=None),
    trustFilter: str | None = Query(default=None),
    paidOnly: bool = Query(default=False),
    skill: str | None = Query(default=None),
    source: str | None = Query(default=None),
    sortBy: str = Query(default="relevance"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=6, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponseSchema[EnrichedOpportunitySchema]:
    return list_opportunities_for_user(
        db=db,
        user_id=current_user.id,
        q=q,
        opportunity_type=opportunityType,
        role_category=roleCategory,
        domain=domain,
        work_mode=workMode,
        trust_filter=trustFilter,
        paid_only=paidOnly,
        skill=skill,
        source=source,
        sort_by=sortBy,
        page=page,
        page_size=pageSize,
    )


@router.get(
    "/opportunities/{opportunity_id}",
    response_model=EnrichedOpportunitySchema,
)
def get_opportunity_detail(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EnrichedOpportunitySchema:
    return get_opportunity_for_user(db, current_user.id, opportunity_id)


@router.post(
    "/opportunities",
    response_model=EnrichedOpportunitySchema,
    status_code=status.HTTP_201_CREATED,
)
def post_opportunity(
    payload: CreateOpportunityInputSchema,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EnrichedOpportunitySchema:
    return create_and_evaluate_opportunity(db, current_user.id, payload)


@router.post(
    "/opportunities/{opportunity_id}/analyze",
    response_model=OpportunityAnalysisSchema,
)
def trigger_opportunity_analysis(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OpportunityAnalysisSchema:
    enriched = get_opportunity_for_user(
        db, current_user.id, opportunity_id, force_refresh_analysis=True
    )
    return enriched.analysis


@router.get(
    "/opportunities/{opportunity_id}/analysis",
    response_model=OpportunityAnalysisSchema,
)
def get_opportunity_analysis(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OpportunityAnalysisSchema:
    enriched = get_opportunity_for_user(db, current_user.id, opportunity_id)
    return enriched.analysis


@router.get(
    "/opportunities/{opportunity_id}/trust-assessment",
    response_model=TrustAssessmentSchema,
)
def get_opportunity_trust_assessment(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrustAssessmentSchema:
    enriched = get_opportunity_for_user(db, current_user.id, opportunity_id)
    return enriched.trustAssessment


@router.get(
    "/recommendations",
    response_model=list[EnrichedOpportunitySchema],
)
def get_recommendations(
    limit: int = Query(default=6, ge=1, le=50),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EnrichedOpportunitySchema]:
    paginated = list_opportunities_for_user(
        db=db,
        user_id=current_user.id,
        trust_filter="hide_elevated_risk",
        sort_by="relevance",
        page=1,
        page_size=limit,
    )
    return paginated.items

