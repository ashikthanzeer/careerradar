import time
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import Application, Opportunity, SavedOpportunity, utc_now_iso
from app.schemas.api_schemas import (
    ApplicationRecordSchema,
    CreateApplicationInputSchema,
    PatchApplicationInputSchema,
    SavedOpportunitySchema,
)


def list_saved_opportunities(
    db: Session, user_id: str
) -> list[SavedOpportunitySchema]:
    rows = db.scalars(
        select(SavedOpportunity)
        .where(SavedOpportunity.user_id == user_id)
        .order_by(SavedOpportunity.saved_at.desc())
    ).all()
    return [
        SavedOpportunitySchema(
            id=r.id,
            userId=r.user_id,
            opportunityId=r.opportunity_id,
            savedAt=r.saved_at,
        )
        for r in rows
    ]


def save_opportunity(
    db: Session, user_id: str, opportunity_id: str
) -> SavedOpportunitySchema:
    opp = db.scalar(select(Opportunity).where(Opportunity.id == opportunity_id))
    if opp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Opportunity '{opportunity_id}' was not found.",
        )

    existing = db.scalar(
        select(SavedOpportunity).where(
            SavedOpportunity.user_id == user_id,
            SavedOpportunity.opportunity_id == opportunity_id,
        )
    )
    if existing:
        return SavedOpportunitySchema(
            id=existing.id,
            userId=existing.user_id,
            opportunityId=existing.opportunity_id,
            savedAt=existing.saved_at,
        )

    now = utc_now_iso()
    record = SavedOpportunity(
        id=f"saved_{user_id}_{opportunity_id}",
        user_id=user_id,
        opportunity_id=opportunity_id,
        saved_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return SavedOpportunitySchema(
        id=record.id,
        userId=record.user_id,
        opportunityId=record.opportunity_id,
        savedAt=record.saved_at,
    )


def unsave_opportunity(db: Session, user_id: str, opportunity_id: str) -> None:
    existing = db.scalar(
        select(SavedOpportunity).where(
            SavedOpportunity.user_id == user_id,
            SavedOpportunity.opportunity_id == opportunity_id,
        )
    )
    if existing:
        db.delete(existing)
        db.commit()


def _to_app_schema(row: Application) -> ApplicationRecordSchema:
    return ApplicationRecordSchema(
        id=row.id,
        userId=row.user_id,
        opportunityId=row.opportunity_id,
        status=row.status,  # type: ignore[arg-type]
        appliedAt=row.applied_at,
        deadline=row.deadline,
        nextAction=row.next_action,
        privateNotes=row.private_notes,
        createdAt=row.created_at,
        updatedAt=row.updated_at,
    )


def list_user_applications(
    db: Session, user_id: str
) -> list[ApplicationRecordSchema]:
    rows = db.scalars(
        select(Application)
        .where(Application.user_id == user_id)
        .order_by(Application.updated_at.desc())
    ).all()
    return [_to_app_schema(r) for r in rows]


def upsert_user_application(
    db: Session, user_id: str, payload: CreateApplicationInputSchema
) -> ApplicationRecordSchema:
    opp = db.scalar(
        select(Opportunity).where(Opportunity.id == payload.opportunityId)
    )
    if opp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Opportunity '{payload.opportunityId}' was not found.",
        )

    now = utc_now_iso()
    existing = db.scalar(
        select(Application).where(
            Application.user_id == user_id,
            Application.opportunity_id == payload.opportunityId,
        )
    )
    if existing:
        existing.status = payload.status
        if payload.appliedAt is not None:
            existing.applied_at = payload.appliedAt
        elif payload.status == "applied" and not existing.applied_at:
            existing.applied_at = now
        if payload.deadline is not None:
            existing.deadline = payload.deadline
        if payload.nextAction:
            existing.next_action = payload.nextAction
        if payload.privateNotes != "":
            existing.private_notes = payload.privateNotes
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return _to_app_schema(existing)

    created = Application(
        id=f"app_{int(time.time() * 1000)}_{user_id[-2:]}",
        user_id=user_id,
        opportunity_id=payload.opportunityId,
        status=payload.status,
        applied_at=payload.appliedAt or (now if payload.status == "applied" else None),
        deadline=payload.deadline or opp.deadline,
        next_action=payload.nextAction,
        private_notes=payload.privateNotes,
        created_at=now,
        updated_at=now,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return _to_app_schema(created)


def update_user_application(
    db: Session,
    user_id: str,
    application_id: str,
    patch: PatchApplicationInputSchema,
) -> ApplicationRecordSchema:
    row = db.scalar(select(Application).where(Application.id == application_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' was not found.",
        )

    # Enforce strict server-side resource ownership (AGENTS.md §6.5)
    if row.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify another user's application record.",
        )

    now = utc_now_iso()
    if patch.status is not None:
        row.status = patch.status
        if patch.status == "applied" and not row.applied_at and patch.appliedAt is None:
            row.applied_at = now
    if "appliedAt" in patch.model_fields_set:
        row.applied_at = patch.appliedAt
    if "deadline" in patch.model_fields_set:
        row.deadline = patch.deadline
    if patch.nextAction is not None:
        row.next_action = patch.nextAction
    if patch.privateNotes is not None:
        row.private_notes = patch.privateNotes

    row.updated_at = now
    db.commit()
    db.refresh(row)
    return _to_app_schema(row)


def delete_user_application(
    db: Session, user_id: str, application_id: str
) -> None:
    row = db.scalar(select(Application).where(Application.id == application_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' was not found.",
        )
    if row.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete another user's application record.",
        )
    db.delete(row)
    db.commit()

