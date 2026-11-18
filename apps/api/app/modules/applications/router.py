from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.modules.applications.service import (
    delete_user_application,
    list_saved_opportunities,
    list_user_applications,
    save_opportunity,
    unsave_opportunity,
    update_user_application,
    upsert_user_application,
)
from app.schemas.api_schemas import (
    ApplicationRecordSchema,
    CreateApplicationInputSchema,
    PatchApplicationInputSchema,
    SavedOpportunitySchema,
)

router = APIRouter(tags=["Saved Opportunities & Applications"])


@router.get("/saved-opportunities", response_model=list[SavedOpportunitySchema])
def get_saved(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SavedOpportunitySchema]:
    return list_saved_opportunities(db, current_user.id)


@router.post(
    "/opportunities/{opportunity_id}/save",
    response_model=SavedOpportunitySchema,
    status_code=status.HTTP_201_CREATED,
)
def add_saved(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedOpportunitySchema:
    return save_opportunity(db, current_user.id, opportunity_id)


@router.delete(
    "/opportunities/{opportunity_id}/save",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_saved(
    opportunity_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    unsave_opportunity(db, current_user.id, opportunity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/applications", response_model=list[ApplicationRecordSchema])
def get_applications(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ApplicationRecordSchema]:
    return list_user_applications(db, current_user.id)


@router.post(
    "/applications",
    response_model=ApplicationRecordSchema,
    status_code=status.HTTP_201_CREATED,
)
def create_or_update_application(
    payload: CreateApplicationInputSchema,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRecordSchema:
    return upsert_user_application(db, current_user.id, payload)


@router.patch(
    "/applications/{application_id}",
    response_model=ApplicationRecordSchema,
)
def patch_application(
    application_id: str,
    payload: PatchApplicationInputSchema,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRecordSchema:
    return update_user_application(db, current_user.id, application_id, payload)


@router.delete(
    "/applications/{application_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_application(
    application_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_user_application(db, current_user.id, application_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

