from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.entities import (
    CareerProfile,
    Opportunity,
    Skill,
    User,
    UserSkill,
    utc_now_iso,
)
from app.schemas.api_schemas import (
    CareerProfileSchema,
    ProfileProjectSchema,
    UserSkillSchema,
)


def get_or_create_profile(db: Session, user_id: str) -> CareerProfileSchema:
    profile = db.scalar(select(CareerProfile).where(CareerProfile.user_id == user_id))
    if profile is None:
        user = db.scalar(select(User).where(User.id == user_id))
        display_name = user.display_name if user and user.display_name else "Jobseeker"
        profile = CareerProfile(
            id=f"profile_{user_id}",
            user_id=user_id,
            display_name=display_name,
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
            updated_at=utc_now_iso(),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    user_skills = db.scalars(
        select(UserSkill).where(UserSkill.user_id == user_id)
    ).all()

    skills_schema: list[UserSkillSchema] = []
    for us in user_skills:
        skill_entity = db.scalar(select(Skill).where(Skill.id == us.skill_id))
        if skill_entity:
            skills_schema.append(
                UserSkillSchema(
                    id=us.id,
                    canonicalName=skill_entity.canonical_name,
                    category=skill_entity.category,  # type: ignore[arg-type]
                    proficiency=us.proficiency,  # type: ignore[arg-type]
                    yearsExperience=us.years_experience,
                    sourceType=us.source_type,  # type: ignore[arg-type]
                    sourceReference=us.source_reference,
                )
            )

    projects_schema = [
        ProfileProjectSchema(**proj) for proj in (profile.projects or [])
    ]
    from app.modules.ingestion.live_fetcher import get_user_fetch_quota

    quota = get_user_fetch_quota(db, user_id)

    return CareerProfileSchema(
        id=profile.id,
        userId=profile.user_id,
        displayName=profile.display_name,
        educationLevel=profile.education_level,  # type: ignore[arg-type]
        fieldOfStudy=profile.field_of_study,
        institution=profile.institution,
        graduationYear=profile.graduation_year,
        preferredRoles=profile.preferred_roles,  # type: ignore[arg-type]
        preferredDomains=profile.preferred_domains,
        preferredLocations=profile.preferred_locations,
        workModes=profile.work_modes,  # type: ignore[arg-type]
        preferredDuration=profile.preferred_duration,
        minimumMonthlyStipendINR=profile.compensation_preference,
        careerInterestsSummary=profile.career_interests_summary,
        projects=projects_schema,
        skills=skills_schema,
        updatedAt=profile.updated_at,
        onboardingCompleted=quota["onboardingCompleted"],
        nativeCountry=quota["nativeCountry"],
        portfolioUrl=quota["portfolioUrl"],
        linkedinUrl=quota["linkedinUrl"],
        lastJobFetchAt=quota["lastJobFetchAt"],
        triggersUsedToday=quota["triggersUsedToday"],
        triggersRemainingToday=quota["triggersRemainingToday"],
        maxTriggersPerDay=quota["maxTriggersPerDay"],
        isStaleForLoginTrigger=quota["isStaleForLoginTrigger"],
    )


def update_user_profile(
    db: Session, user_id: str, payload: CareerProfileSchema, auto_fetch: bool = True
) -> CareerProfileSchema:
    """
    Updates the authenticated user's CareerProfile and UserSkills.
    Enforces server-side user_id ownership.
    """
    profile = db.scalar(select(CareerProfile).where(CareerProfile.user_id == user_id))
    now = utc_now_iso()

    if profile is None:
        profile = CareerProfile(id=f"profile_{user_id}", user_id=user_id)
        db.add(profile)

    profile.display_name = payload.displayName
    profile.education_level = payload.educationLevel
    profile.field_of_study = payload.fieldOfStudy
    profile.institution = payload.institution
    profile.graduation_year = payload.graduationYear
    profile.preferred_roles = list(payload.preferredRoles)
    profile.preferred_domains = list(payload.preferredDomains)
    profile.preferred_locations = list(payload.preferredLocations)
    profile.work_modes = list(payload.workModes)
    profile.preferred_duration = payload.preferredDuration
    profile.compensation_preference = payload.minimumMonthlyStipendINR
    profile.career_interests_summary = payload.careerInterestsSummary
    profile.projects = [p.model_dump() for p in payload.projects]
    profile.updated_at = now

    existing_us = db.scalars(
        select(UserSkill).where(UserSkill.user_id == user_id)
    ).all()
    for item in existing_us:
        db.delete(item)
    db.flush()

    seen_skill_ids: set[str] = set()
    for s_idx, s in enumerate(payload.skills):
        canonical = s.canonicalName.strip()
        skill_entity = db.scalar(
            select(Skill).where(Skill.canonical_name.ilike(canonical))
        )
        if skill_entity is None:
            skill_entity = Skill(
                id=f"skill_{canonical.lower().replace(' ', '_').replace('+', 'p')}",
                canonical_name=canonical,
                category=s.category,
            )
            db.add(skill_entity)
            db.flush()

        if skill_entity.id in seen_skill_ids:
            continue
        seen_skill_ids.add(skill_entity.id)

        db.add(
            UserSkill(
                id=f"uskill_{user_id}_{skill_entity.id}",
                user_id=user_id,
                skill_id=skill_entity.id,
                proficiency=s.proficiency,
                years_experience=s.yearsExperience,
                source_type=s.sourceType,
                source_reference=s.sourceReference,
            )
        )

    from app.modules.ingestion.live_fetcher import (
        get_or_init_fetch_state,
        realign_stored_catalog_to_preferences,
        trigger_profile_job_fetch_for_user,
    )

    state = get_or_init_fetch_state(db, user_id)
    was_onboarded = bool(state.onboarding_completed)
    existing_opp_count = db.scalar(select(func.count()).select_from(Opportunity)) or 0
    state.onboarding_completed = True
    state.native_country = (payload.nativeCountry or "India").strip() or "India"
    state.portfolio_url = payload.portfolioUrl
    state.linkedin_url = payload.linkedinUrl

    db.commit()

    if auto_fetch:
        try:
            if not was_onboarded or existing_opp_count == 0:
                trigger_profile_job_fetch_for_user(
                    db, user_id, trigger_source="profile_save", limit=50
                )
            else:
                realign_stored_catalog_to_preferences(db, user_id)
        except Exception:
            pass

    return get_or_create_profile(db, user_id)
