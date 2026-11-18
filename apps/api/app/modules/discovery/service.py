import math
import time
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import (
    Application,
    Opportunity,
    OpportunityAnalysis,
    OpportunitySkill,
    OpportunitySource,
    Organization,
    SavedOpportunity,
    Skill,
    TrustAssessment,
    TrustEvidence,
    utc_now_iso,
)
from app.modules.intelligence.extractor import extract_opportunity_intelligence
from app.modules.intelligence.matching_engine import (
    analyze_skill_gap,
    compute_recommendation_match,
)
from app.modules.intelligence.trust_engine import evaluate_opportunity_trust
from app.modules.profile.service import get_or_create_profile
from app.schemas.api_schemas import (
    ApplicationRecordSchema,
    CareerProfileSchema,
    CreateOpportunityInputSchema,
    EnrichedOpportunitySchema,
    OpportunityAnalysisSchema,
    OpportunitySkillRequirementSchema,
    OpportunitySourceSchema,
    OrganizationSchema,
    PaginatedResponseSchema,
    TrustAssessmentSchema,
    TrustEvidenceSchema,
    VerificationMetadataSchema,
)


def _persist_trust_and_analysis(
    db: Session,
    opportunity: Opportunity,
    organization: Organization,
    force_refresh: bool = False,
) -> tuple[
    list[OpportunitySkillRequirementSchema],
    OpportunityAnalysisSchema,
    TrustAssessmentSchema,
]:
    # 1. Skills & Analysis
    existing_analysis = db.scalar(
        select(OpportunityAnalysis).where(
            OpportunityAnalysis.opportunity_id == opportunity.id
        )
    )
    opp_skill_rows = db.scalars(
        select(OpportunitySkill).where(
            OpportunitySkill.opportunity_id == opportunity.id
        )
    ).all()

    if existing_analysis is None or force_refresh or not opp_skill_rows:
        extracted_skills, analysis_schema = extract_opportunity_intelligence(
            opportunity
        )
        if existing_analysis is None:
            existing_analysis = OpportunityAnalysis(
                id=analysis_schema.id,
                opportunity_id=opportunity.id,
            )
            db.add(existing_analysis)

        existing_analysis.analysis_type = analysis_schema.analysisType
        existing_analysis.structured_result = analysis_schema.model_dump()
        existing_analysis.model_provider = analysis_schema.modelProvider
        existing_analysis.model_name = analysis_schema.modelName
        existing_analysis.prompt_version = analysis_schema.promptVersion
        existing_analysis.confidence = analysis_schema.confidence
        existing_analysis.created_at = analysis_schema.createdAt

        if not opp_skill_rows or force_refresh:
            for old_row in opp_skill_rows:
                db.delete(old_row)
            db.flush()
            for idx, req in enumerate(extracted_skills):
                skill_entity = db.scalar(
                    select(Skill).where(Skill.canonical_name.ilike(req.skillName))
                )
                if skill_entity is None:
                    skill_entity = Skill(
                        id=f"skill_{req.skillName.lower().replace(' ', '_').replace('+', 'p')}",
                        canonical_name=req.skillName,
                        category=req.category,
                    )
                    db.add(skill_entity)
                    db.flush()
                db.add(
                    OpportunitySkill(
                        id=f"oppskill_{opportunity.id}_{idx}",
                        opportunity_id=opportunity.id,
                        skill_id=skill_entity.id,
                        requirement_type=req.requirementType,
                        extraction_confidence=req.extractionConfidence,
                    )
                )
        db.flush()
        skills_schema = extracted_skills
    else:
        analysis_schema = OpportunityAnalysisSchema(**existing_analysis.structured_result)
        skills_schema = []
        for os_row in opp_skill_rows:
            sk = db.scalar(select(Skill).where(Skill.id == os_row.skill_id))
            if sk:
                skills_schema.append(
                    OpportunitySkillRequirementSchema(
                        skillName=sk.canonical_name,
                        category=sk.category,  # type: ignore[arg-type]
                        requirementType=os_row.requirement_type,  # type: ignore[arg-type]
                        extractionConfidence=os_row.extraction_confidence,
                    )
                )

    # 2. Trust Assessment
    existing_trust = db.scalar(
        select(TrustAssessment).where(
            TrustAssessment.opportunity_id == opportunity.id
        )
    )
    if existing_trust is None or force_refresh:
        trust_schema = evaluate_opportunity_trust(opportunity, organization)
        if existing_trust is not None:
            db.delete(existing_trust)
            db.flush()

        trust_entity = TrustAssessment(
            id=trust_schema.id,
            opportunity_id=opportunity.id,
            overall_label=trust_schema.overallLabel,
            assessment_summary=trust_schema.assessmentSummary,
            limitations=trust_schema.limitations,
            recommended_verification_steps=trust_schema.recommendedVerificationSteps,
            ruleset_version=trust_schema.rulesetVersion,
            created_at=trust_schema.createdAt,
        )
        db.add(trust_entity)
        db.flush()

        for ev in trust_schema.evidence:
            db.add(
                TrustEvidence(
                    id=ev.id,
                    trust_assessment_id=trust_entity.id,
                    indicator_code=ev.indicatorCode,
                    severity=ev.severity,
                    description=ev.description,
                    evidence_type=ev.evidenceType,
                    evidence_reference=ev.evidenceReference,
                    confidence=ev.confidence,
                )
            )
        db.flush()
    else:
        ev_rows = db.scalars(
            select(TrustEvidence).where(
                TrustEvidence.trust_assessment_id == existing_trust.id
            )
        ).all()
        trust_schema = TrustAssessmentSchema(
            id=existing_trust.id,
            opportunityId=opportunity.id,
            overallLabel=existing_trust.overall_label,  # type: ignore[arg-type]
            assessmentSummary=existing_trust.assessment_summary,
            limitations=existing_trust.limitations,
            recommendedVerificationSteps=existing_trust.recommended_verification_steps,
            rulesetVersion=existing_trust.ruleset_version,
            createdAt=existing_trust.created_at,
            evidence=[
                TrustEvidenceSchema(
                    id=e.id,
                    trustAssessmentId=e.trust_assessment_id,
                    indicatorCode=e.indicator_code,
                    severity=e.severity,  # type: ignore[arg-type]
                    description=e.description,
                    evidenceType=e.evidence_type,  # type: ignore[arg-type]
                    evidenceReference=e.evidence_reference,
                    confidence=e.confidence,
                )
                for e in ev_rows
            ],
        )

    return skills_schema, analysis_schema, trust_schema


def enrich_opportunity_for_user(
    db: Session,
    opportunity: Opportunity,
    profile: CareerProfileSchema,
    saved_ids: set[str],
    apps_by_opp_id: dict[str, Application],
    force_refresh_analysis: bool = False,
) -> EnrichedOpportunitySchema:
    org = db.scalar(
        select(Organization).where(Organization.id == opportunity.organization_id)
    )
    if org is None:
        org = Organization(
            id=opportunity.organization_id,
            name="Unverified Organization",
            normalized_name="unverified organization",
            official_website=None,
            description="",
            recruiter_email_domain=None,
            verification_metadata={
                "domainVerified": False,
                "hasPublicEngineeringFootprint": False,
                "knownEntity": False,
                "notes": "Placeholder organization.",
            },
        )
        db.add(org)
        db.flush()

    sources_rows = db.scalars(
        select(OpportunitySource).where(
            OpportunitySource.opportunity_id == opportunity.id
        )
    ).all()

    skills_schema, analysis_schema, trust_schema = _persist_trust_and_analysis(
        db, opportunity, org, force_refresh=force_refresh_analysis
    )

    skill_gap = analyze_skill_gap(opportunity, skills_schema, profile)
    recommendation = compute_recommendation_match(
        opportunity, analysis_schema, skill_gap, profile
    )

    app_row = apps_by_opp_id.get(opportunity.id)
    app_schema = (
        ApplicationRecordSchema(
            id=app_row.id,
            userId=app_row.user_id,
            opportunityId=app_row.opportunity_id,
            status=app_row.status,  # type: ignore[arg-type]
            appliedAt=app_row.applied_at,
            deadline=app_row.deadline,
            nextAction=app_row.next_action,
            privateNotes=app_row.private_notes,
            createdAt=app_row.created_at,
            updatedAt=app_row.updated_at,
        )
        if app_row
        else None
    )

    ver_meta = org.verification_metadata or {}
    org_schema = OrganizationSchema(
        id=org.id,
        name=org.name,
        normalizedName=org.normalized_name,
        officialWebsite=org.official_website,
        description=org.description,
        recruiterEmailDomain=org.recruiter_email_domain,
        verificationMetadata=VerificationMetadataSchema(
            domainVerified=bool(ver_meta.get("domainVerified", False)),
            hasPublicEngineeringFootprint=bool(
                ver_meta.get("hasPublicEngineeringFootprint", False)
            ),
            knownEntity=bool(ver_meta.get("knownEntity", False)),
            notes=str(ver_meta.get("notes", "")),
        ),
    )

    return EnrichedOpportunitySchema(
        id=opportunity.id,
        organizationId=opportunity.organization_id,
        title=opportunity.title,
        normalizedTitle=opportunity.normalized_title,
        description=opportunity.description,
        opportunityType=opportunity.opportunity_type,  # type: ignore[arg-type]
        roleCategory=opportunity.role_category,  # type: ignore[arg-type]
        domain=opportunity.domain,
        location=opportunity.location,
        workMode=opportunity.work_mode,  # type: ignore[arg-type]
        compensationMin=opportunity.compensation_min,
        compensationMax=opportunity.compensation_max,
        compensationCurrency=opportunity.compensation_currency,  # type: ignore[arg-type]
        compensationPeriod=opportunity.compensation_period,  # type: ignore[arg-type]
        duration=opportunity.duration,
        postedAt=opportunity.posted_at,
        deadline=opportunity.deadline,
        applicationUrl=opportunity.application_url,
        recruiterContactEmail=opportunity.recruiter_contact_email,
        status=opportunity.status,
        firstSeenAt=opportunity.first_seen_at,
        lastSeenAt=opportunity.last_seen_at,
        createdAt=opportunity.created_at,
        updatedAt=opportunity.updated_at,
        isSampleData=opportunity.is_sample_data,
        organization=org_schema,
        sources=[
            OpportunitySourceSchema(
                id=s.id,
                opportunityId=s.opportunity_id,
                sourceName=s.source_name,
                sourceUrl=s.source_url,
                externalId=s.external_id,
                sourcePublishedAt=s.source_published_at,
                lastCheckedAt=s.last_checked_at,
                sourceStatus=s.source_status,  # type: ignore[arg-type]
            )
            for s in sources_rows
        ],
        skills=skills_schema,
        analysis=analysis_schema,
        trustAssessment=trust_schema,
        skillGap=skill_gap,
        recommendation=recommendation,
        isSaved=opportunity.id in saved_ids,
        applicationRecord=app_schema,
    )


def list_opportunities_for_user(
    db: Session,
    user_id: str,
    q: str | None = None,
    opportunity_type: str | None = None,
    role_category: str | None = None,
    domain: str | None = None,
    work_mode: str | None = None,
    trust_filter: str | None = None,
    paid_only: bool = False,
    skill: str | None = None,
    source: str | None = None,
    sort_by: str = "relevance",
    page: int = 1,
    page_size: int = 6,
) -> PaginatedResponseSchema[EnrichedOpportunitySchema]:
    profile = get_or_create_profile(db, user_id)
    saved_ids = {
        r.opportunity_id
        for r in db.scalars(
            select(SavedOpportunity).where(SavedOpportunity.user_id == user_id)
        ).all()
    }
    apps_by_opp_id = {
        r.opportunity_id: r
        for r in db.scalars(
            select(Application).where(Application.user_id == user_id)
        ).all()
    }

    all_opps = db.scalars(select(Opportunity)).all()
    enriched = [
        enrich_opportunity_for_user(db, opp, profile, saved_ids, apps_by_opp_id)
        for opp in all_opps
    ]
    db.commit()

    filtered: list[EnrichedOpportunitySchema] = []
    for item in enriched:
        if q and q.strip():
            query_lower = q.strip().lower()
            searchable = " ".join(
                [
                    item.title,
                    item.organization.name,
                    item.description,
                    item.location,
                    item.domain,
                    *[s.skillName for s in item.skills],
                ]
            ).lower()
            if query_lower not in searchable:
                continue

        if opportunity_type and opportunity_type != "all":
            if item.opportunityType != opportunity_type:
                continue

        if role_category and role_category != "all":
            if item.roleCategory != role_category:
                continue

        if domain and domain != "all":
            if item.domain != domain:
                continue

        if work_mode and work_mode != "all":
            if item.workMode != work_mode:
                continue

        if trust_filter == "no_major_warnings_only" or trust_filter == "low_risk_only":
            if item.trustAssessment.overallLabel != "no_major_warnings":
                continue
        elif trust_filter == "hide_elevated_risk":
            if item.trustAssessment.overallLabel == "elevated_risk":
                continue

        if paid_only:
            has_stipend = item.compensationPeriod != "unpaid" and (
                item.compensationMin is not None or item.compensationMax is not None
            )
            if not has_stipend:
                continue

        if skill and skill.strip():
            target_skill = skill.strip().lower()
            if not any(s.skillName.lower() == target_skill for s in item.skills):
                continue

        if source and source.strip():
            target_source = source.strip().lower()
            if not any(target_source in src.sourceName.lower() for src in item.sources):
                continue

        filtered.append(item)

    if sort_by == "deadline_asc":
        filtered.sort(key=lambda x: x.deadline or "9999-12-31T23:59:59Z")
    elif sort_by == "posted_desc":
        filtered.sort(key=lambda x: x.postedAt or "", reverse=True)
    elif sort_by == "stipend_desc":
        filtered.sort(
            key=lambda x: x.compensationMax or x.compensationMin or 0, reverse=True
        )
    else:
        # Default relevance: compositeScore with elevated_risk penalty
        filtered.sort(
            key=lambda x: x.recommendation.compositeScore
            + (-50 if x.trustAssessment.overallLabel == "elevated_risk" else 0),
            reverse=True,
        )

    safe_page_size = max(1, min(100, page_size))
    total = len(filtered)
    total_pages = max(1, math.ceil(total / safe_page_size))
    safe_page = max(1, min(page, total_pages))
    start = (safe_page - 1) * safe_page_size
    items = filtered[start : start + safe_page_size]

    return PaginatedResponseSchema(
        items=items,
        total=total,
        page=safe_page,
        pageSize=safe_page_size,
        totalPages=total_pages,
    )


def get_opportunity_for_user(
    db: Session,
    user_id: str,
    opportunity_id: str,
    force_refresh_analysis: bool = False,
) -> EnrichedOpportunitySchema:
    opp = db.scalar(select(Opportunity).where(Opportunity.id == opportunity_id))
    if opp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Opportunity '{opportunity_id}' was not found.",
        )

    profile = get_or_create_profile(db, user_id)
    saved_ids = {
        r.opportunity_id
        for r in db.scalars(
            select(SavedOpportunity).where(SavedOpportunity.user_id == user_id)
        ).all()
    }
    apps_by_opp_id = {
        r.opportunity_id: r
        for r in db.scalars(
            select(Application).where(Application.user_id == user_id)
        ).all()
    }

    result = enrich_opportunity_for_user(
        db,
        opp,
        profile,
        saved_ids,
        apps_by_opp_id,
        force_refresh_analysis=force_refresh_analysis,
    )
    db.commit()
    return result


def create_and_evaluate_opportunity(
    db: Session, user_id: str, payload: CreateOpportunityInputSchema
) -> EnrichedOpportunitySchema:
    now = utc_now_iso()
    suffix = f"{int(time.time() * 1000)}"
    org_id = f"org_custom_{suffix}"
    opp_id = f"opp_custom_{suffix}"

    email_domain: str | None = None
    if payload.recruiterContactEmail and "@" in payload.recruiterContactEmail:
        email_domain = payload.recruiterContactEmail.split("@", 1)[1].lower()

    org = Organization(
        id=org_id,
        name=payload.organizationName.strip(),
        normalized_name=payload.organizationName.strip().lower(),
        official_website=payload.officialWebsite.strip()
        if payload.officialWebsite and payload.officialWebsite.strip()
        else None,
        description=f"User-submitted organization record for {payload.organizationName.strip()}.",
        recruiter_email_domain=email_domain,
        verification_metadata={
            "domainVerified": bool(
                payload.officialWebsite and payload.officialWebsite.strip()
            ),
            "hasPublicEngineeringFootprint": False,
            "knownEntity": False,
            "notes": "Submitted via Opportunity Evaluator API.",
        },
    )
    db.add(org)

    opp = Opportunity(
        id=opp_id,
        organization_id=org_id,
        title=payload.title.strip(),
        normalized_title=payload.title.strip().lower(),
        description=payload.description.strip(),
        opportunity_type=payload.opportunityType,
        role_category=payload.roleCategory,
        domain=payload.domain,
        location=payload.location.strip(),
        work_mode=payload.workMode,
        compensation_min=payload.compensationMin,
        compensation_max=payload.compensationMax
        if payload.compensationMax is not None
        else payload.compensationMin,
        compensation_currency=payload.compensationCurrency,
        compensation_period=payload.compensationPeriod,
        duration=payload.duration.strip(),
        posted_at=now,
        deadline=payload.deadline,
        application_url=payload.applicationUrl.strip(),
        recruiter_contact_email=payload.recruiterContactEmail.strip()
        if payload.recruiterContactEmail and payload.recruiterContactEmail.strip()
        else None,
        status="open",
        first_seen_at=now,
        last_seen_at=now,
        created_at=now,
        updated_at=now,
        is_sample_data=False,
    )
    db.add(opp)

    src = OpportunitySource(
        id=f"src_custom_{suffix}",
        opportunity_id=opp_id,
        source_name=payload.sourceName.strip(),
        source_url=payload.applicationUrl.strip(),
        external_id=f"ext_{suffix}",
        source_published_at=now,
        last_checked_at=now,
        source_status="active",
    )
    db.add(src)
    db.flush()

    return get_opportunity_for_user(db, user_id, opp_id, force_refresh_analysis=True)

