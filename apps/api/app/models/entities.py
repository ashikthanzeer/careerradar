from datetime import datetime, timezone
from typing import Any
from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), default="Jobseeker")
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    authentication_provider: Mapped[str] = mapped_column(String(64), default="google")
    provider_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso, onupdate=utc_now_iso)

    profile: Mapped["CareerProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    user_skills: Mapped[list["UserSkill"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    saved_opportunities: Mapped[list["SavedOpportunity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    applications: Mapped[list["Application"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    fetch_state: Mapped["UserFetchState | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class CareerProfile(Base):
    __tablename__ = "career_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    education_level: Mapped[str] = mapped_column(String(64), nullable=False)
    field_of_study: Mapped[str] = mapped_column(String(160), nullable=False)
    institution: Mapped[str] = mapped_column(String(200), nullable=False)
    graduation_year: Mapped[int] = mapped_column(Integer, nullable=False)
    preferred_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    preferred_domains: Mapped[list[str]] = mapped_column(JSON, default=list)
    preferred_locations: Mapped[list[str]] = mapped_column(JSON, default=list)
    work_modes: Mapped[list[str]] = mapped_column(JSON, default=list)
    preferred_duration: Mapped[str] = mapped_column(String(120), default="3 to 6 months")
    compensation_preference: Mapped[int] = mapped_column(Integer, default=0)
    career_interests_summary: Mapped[str] = mapped_column(Text, default="")
    projects: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    updated_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)

    user: Mapped["User"] = relationship(back_populates="profile")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="language")


class UserSkill(Base):
    __tablename__ = "user_skills"
    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", name="uq_user_skill_pair"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("skills.id", ondelete="CASCADE"), index=True
    )
    proficiency: Mapped[str] = mapped_column(String(32), default="intermediate")
    years_experience: Mapped[float] = mapped_column(Float, default=1.0)
    source_type: Mapped[str] = mapped_column(String(32), default="explicit")
    source_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship(back_populates="user_skills")
    skill: Mapped["Skill"] = relationship()


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    official_website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    recruiter_email_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="organization")


class Opportunity(Base):
    __tablename__ = "opportunities"
    __table_args__ = (
        Index("ix_opportunities_role_work_mode", "role_category", "work_mode"),
        Index("ix_opportunities_deadline", "deadline"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    opportunity_type: Mapped[str] = mapped_column(String(64), index=True, default="internship")
    role_category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    work_mode: Mapped[str] = mapped_column(String(32), index=True, default="remote")
    compensation_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    compensation_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    compensation_currency: Mapped[str | None] = mapped_column(String(16), nullable=True)
    compensation_period: Mapped[str] = mapped_column(String(32), default="monthly")
    duration: Mapped[str] = mapped_column(String(64), default="3 months")
    posted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    deadline: Mapped[str | None] = mapped_column(String(40), nullable=True)
    application_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    recruiter_contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open")
    first_seen_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    last_seen_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    is_sample_data: Mapped[bool] = mapped_column(Boolean, default=False)

    organization: Mapped["Organization"] = relationship(back_populates="opportunities")
    sources: Mapped[list["OpportunitySource"]] = relationship(
        back_populates="opportunity", cascade="all, delete-orphan"
    )
    opportunity_skills: Mapped[list["OpportunitySkill"]] = relationship(
        back_populates="opportunity", cascade="all, delete-orphan"
    )
    analysis: Mapped["OpportunityAnalysis | None"] = relationship(
        back_populates="opportunity", uselist=False, cascade="all, delete-orphan"
    )
    trust_assessment: Mapped["TrustAssessment | None"] = relationship(
        back_populates="opportunity", uselist=False, cascade="all, delete-orphan"
    )


class OpportunitySource(Base):
    __tablename__ = "opportunity_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), index=True
    )
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    external_id: Mapped[str] = mapped_column(String(160), nullable=False)
    source_published_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_checked_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    source_status: Mapped[str] = mapped_column(String(32), default="active")

    opportunity: Mapped["Opportunity"] = relationship(back_populates="sources")


class OpportunitySkill(Base):
    __tablename__ = "opportunity_skills"
    __table_args__ = (
        UniqueConstraint("opportunity_id", "skill_id", name="uq_opportunity_skill_pair"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("skills.id", ondelete="CASCADE"), index=True
    )
    requirement_type: Mapped[str] = mapped_column(String(32), default="required")
    extraction_confidence: Mapped[float] = mapped_column(Float, default=0.9)

    opportunity: Mapped["Opportunity"] = relationship(back_populates="opportunity_skills")
    skill: Mapped["Skill"] = relationship()


class OpportunityAnalysis(Base):
    __tablename__ = "opportunity_analyses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), unique=True, index=True
    )
    analysis_type: Mapped[str] = mapped_column(String(64), default="rule_and_schema_validated")
    structured_result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    model_provider: Mapped[str] = mapped_column(String(120), nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.9)
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)

    opportunity: Mapped["Opportunity"] = relationship(back_populates="analysis")


class TrustAssessment(Base):
    __tablename__ = "trust_assessments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), unique=True, index=True
    )
    overall_label: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    assessment_summary: Mapped[str] = mapped_column(Text, nullable=False)
    limitations: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_verification_steps: Mapped[list[str]] = mapped_column(JSON, default=list)
    ruleset_version: Mapped[str] = mapped_column(String(64), default="v1.3.0-server")
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)

    opportunity: Mapped["Opportunity"] = relationship(back_populates="trust_assessment")
    evidence: Mapped[list["TrustEvidence"]] = relationship(
        back_populates="trust_assessment", cascade="all, delete-orphan"
    )


class TrustEvidence(Base):
    __tablename__ = "trust_evidences"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trust_assessment_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("trust_assessments.id", ondelete="CASCADE"), index=True
    )
    indicator_code: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_reference: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.95)

    trust_assessment: Mapped["TrustAssessment"] = relationship(back_populates="evidence")


class SavedOpportunity(Base):
    __tablename__ = "saved_opportunities"
    __table_args__ = (
        UniqueConstraint("user_id", "opportunity_id", name="uq_user_saved_opportunity"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), index=True
    )
    saved_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)

    user: Mapped["User"] = relationship(back_populates="saved_opportunities")


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "opportunity_id", name="uq_user_opportunity_application"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    opportunity_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("opportunities.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(32), index=True, default="interested")
    applied_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    deadline: Mapped[str | None] = mapped_column(String(40), nullable=True)
    next_action: Mapped[str] = mapped_column(String(500), default="")
    private_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utc_now_iso)

    user: Mapped["User"] = relationship(back_populates="applications")


class UserFetchState(Base):
    __tablename__ = "user_fetch_states"

    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    last_job_fetch_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fetch_date_utc: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fetch_count_today: Mapped[int] = mapped_column(Integer, default=0)
    native_country: Mapped[str] = mapped_column(String(80), default="India")
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped["User"] = relationship(back_populates="fetch_state")

