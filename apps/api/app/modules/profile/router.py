from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.modules.profile.service import get_or_create_profile, update_user_profile
from app.schemas.api_schemas import CareerProfileSchema

router = APIRouter(tags=["Profile"])


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

