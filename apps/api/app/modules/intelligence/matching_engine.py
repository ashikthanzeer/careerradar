from app.models.entities import Opportunity, Organization
from app.schemas.api_schemas import (
    CareerProfileSchema,
    FactorBreakdownSchema,
    InferredMatchSchema,
    OpportunityAnalysisSchema,
    OpportunitySkillRequirementSchema,
    RecommendationMatchSchema,
    SkillGapAnalysisSchema,
    SkillGapItemSchema,
)

ROLE_CATEGORY_LABELS: dict[str, str] = {
    "software_engineering": "Software Engineering",
    "machine_learning": "Machine Learning & AI",
    "data_science": "Data Science & Analytics",
    "systems_infrastructure": "Systems & Cloud Infrastructure",
    "security": "Security Engineering",
    "research": "Computer Science Research",
}

WORK_MODE_LABELS: dict[str, str] = {
    "remote": "Remote",
    "hybrid": "Hybrid",
    "onsite": "On-site",
    "unknown": "Unspecified",
}

LEARNING_SUGGESTIONS: dict[str, str] = {
    "pytorch": "Build and benchmark a small transformer or vision training pipeline with PyTorch & TorchScript.",
    "kubernetes": "Deploy a multi-service container workload locally with kind/minikube and write Helm manifests.",
    "rust": "Implement a concurrent CLI tool or network proxy in Rust focusing on ownership and async Tokio.",
    "go": "Write a fault-tolerant gRPC microservice or worker pool in Go with structured concurrency.",
    "docker": "Containerize a full-stack application using multi-stage Dockerfiles and Docker Compose.",
    "postgresql": "Practice query plan inspection (EXPLAIN ANALYZE), indexing strategies, and transactional isolation.",
    "typescript": "Refactor a React or Node module to strict TypeScript using discriminated unions and generics.",
    "c++": "Implement latency-sensitive data structures in modern C++20 with RAII and sanitizers.",
}


def analyze_skill_gap(
    opportunity: Opportunity,
    opportunity_skills: list[OpportunitySkillRequirementSchema],
    profile: CareerProfileSchema,
) -> SkillGapAnalysisSchema:
    """
    Compares user profile skills (explicit vs. project-inferred) against opportunity requirements (PRD §6.6).
    Explicitly states that an unverified gap does not prove the user lacks the skill.
    """
    explicit_map: dict[str, str] = {}
    inferred_map: dict[str, str] = {}

    for s in profile.skills:
        key = s.canonicalName.strip().lower()
        if s.sourceType != "inferred_from_project":
            explicit_map[key] = s.canonicalName
        else:
            inferred_map[key] = s.sourceReference or "Profile project"

    for proj in profile.projects:
        for tech in proj.technologiesUsed:
            key = tech.strip().lower()
            if key not in explicit_map and key not in inferred_map:
                inferred_map[key] = f"Project: {proj.title}"

    explicit_matched: list[str] = []
    inferred_matched: list[InferredMatchSchema] = []
    missing_required: list[str] = []
    missing_preferred: list[str] = []
    items: list[SkillGapItemSchema] = []

    for req in opportunity_skills:
        key = req.skillName.strip().lower()
        if key in explicit_map:
            explicit_matched.append(req.skillName)
            items.append(
                SkillGapItemSchema(
                    skillName=req.skillName,
                    requirementType=req.requirementType,
                    status="matched_explicit",
                    matchedVia="Explicitly listed in your Career Profile skill matrix",
                )
            )
        elif key in inferred_map:
            source_ref = inferred_map[key]
            inferred_matched.append(
                InferredMatchSchema(skillName=req.skillName, inferredFrom=source_ref)
            )
            items.append(
                SkillGapItemSchema(
                    skillName=req.skillName,
                    requirementType=req.requirementType,
                    status="matched_inferred",
                    matchedVia=f"Inferred from {source_ref}",
                )
            )
        else:
            if req.requirementType == "required":
                missing_required.append(req.skillName)
            else:
                missing_preferred.append(req.skillName)
            items.append(
                SkillGapItemSchema(
                    skillName=req.skillName,
                    requirementType=req.requirementType,
                    status="unverified_gap",
                    learningSuggestion=LEARNING_SUGGESTIONS.get(
                        key,
                        f"Build a focused artifact or review official documentation for {req.skillName} before interviewing.",
                    ),
                )
            )

    req_items = [i for i in items if i.requirementType == "required"]
    matched_req_count = sum(1 for i in req_items if i.status != "unverified_gap")
    req_coverage = (
        round((matched_req_count / len(req_items)) * 100) if req_items else 0
    )

    total_matched = sum(1 for i in items if i.status != "unverified_gap")
    overall_coverage = round((total_matched / len(items)) * 100) if items else 0

    return SkillGapAnalysisSchema(
        opportunityId=opportunity.id,
        overallCoveragePercent=overall_coverage,
        requiredCoveragePercent=req_coverage,
        explicitMatchedSkills=explicit_matched,
        inferredMatchedSkills=inferred_matched,
        missingRequiredSkills=missing_required,
        missingPreferredSkills=missing_preferred,
        items=items,
        caveat="Skill comparison reflects declared profile entries and project technologies. An unverified gap indicates the skill is not currently recorded on your profile—it does not prove you lack the skill.",
    )


def compute_recommendation_match(
    opportunity: Opportunity,
    analysis: OpportunityAnalysisSchema,
    skill_gap: SkillGapAnalysisSchema,
    profile: CareerProfileSchema,
    organization: Organization | None = None,
) -> RecommendationMatchSchema:
    """
    Explainable Weighted Recommendation Scorer (PRD §6.4).
    """
    why_recommended: list[str] = []
    contributing: list[str] = []
    uncertainties: list[str] = []

    req_skill_score = skill_gap.requiredCoveragePercent
    all_matched_names = [
        *skill_gap.explicitMatchedSkills,
        *[i.skillName for i in skill_gap.inferredMatchedSkills],
    ]
    if req_skill_score >= 70 and all_matched_names:
        why_recommended.append(
            f"Covers {req_skill_score}% of core required technical skills ({', '.join(all_matched_names[:4])})."
        )
    if skill_gap.explicitMatchedSkills:
        contributing.append(
            f"Declared skills: {', '.join(skill_gap.explicitMatchedSkills[:4])}"
        )
    if skill_gap.inferredMatchedSkills:
        contributing.append(
            f"Project-inferred skills: {', '.join(i.skillName for i in skill_gap.inferredMatchedSkills[:3])}"
        )

    role_aligned = opportunity.role_category in profile.preferredRoles
    role_score = 100 if role_aligned else 35
    role_label = ROLE_CATEGORY_LABELS.get(
        opportunity.role_category, opportunity.role_category
    )
    if role_aligned:
        why_recommended.append(f"Matches your target role track ({role_label}).")
        contributing.append(f"Preferred role: {role_label}")

    domain_aligned = opportunity.domain in profile.preferredDomains
    domain_score = 100 if domain_aligned else 40
    if domain_aligned:
        why_recommended.append(
            f"Direct alignment with your preferred domain ({opportunity.domain})."
        )
        contributing.append(f"Preferred domain: {opportunity.domain}")

    pref_skill_score = skill_gap.overallCoveragePercent

    mode_aligned = opportunity.work_mode in profile.workModes
    loc_aligned = opportunity.work_mode == "remote" or any(
        loc.lower() in opportunity.location.lower()
        for loc in profile.preferredLocations
    )
    logistics_score = (
        100 if (mode_aligned and loc_aligned) else 70 if (mode_aligned or loc_aligned) else 30
    )
    mode_label = WORK_MODE_LABELS.get(opportunity.work_mode, opportunity.work_mode)
    if mode_aligned and loc_aligned:
        contributing.append(
            f"Work mode & location preference ({mode_label} · {opportunity.location})"
        )
    else:
        uncertainties.append(
            f"Listing work mode/location ({mode_label} · {opportunity.location}) differs from your primary preference."
        )

    if analysis.ambiguitiesOrMissingInfo:
        uncertainties.extend(analysis.ambiguitiesOrMissingInfo[:2])
    if skill_gap.missingRequiredSkills:
        uncertainties.append(
            f"Required skills not yet listed on your profile: {', '.join(skill_gap.missingRequiredSkills)}."
        )

    ver_meta = (organization.verification_metadata or {}) if organization else {}
    is_tier1_verified = bool(
        ver_meta.get("knownEntity") and ver_meta.get("domainVerified")
    )
    if is_tier1_verified and domain_aligned:
        why_recommended.append(
            f"Tier-1 verified employer ({organization.name}) in {opportunity.domain}."
        )
        contributing.append(f"Tier-1 domain preference: {organization.name}")

    composite = round(
        req_skill_score * 0.40
        + role_score * 0.20
        + domain_score * 0.15
        + pref_skill_score * 0.15
        + logistics_score * 0.10
    )
    if is_tier1_verified:
        composite = min(100, composite + (5 if domain_aligned else 2))

    if composite >= 80:
        tier = "strong_alignment"
    elif composite >= 62:
        tier = "moderate_alignment"
    elif composite >= 45:
        tier = "partial_alignment"
    else:
        tier = "low_alignment"

    if not why_recommended:
        why_recommended.append(
            "Surfaced as an exploratory technical opportunity; review missing required skills before applying."
        )

    return RecommendationMatchSchema(
        opportunityId=opportunity.id,
        compositeScore=composite,
        matchTier=tier,  # type: ignore[arg-type]
        factorBreakdown=[
            FactorBreakdownSchema(
                factor="Required Skill Coverage",
                weightPercent=40,
                scorePercent=req_skill_score,
                explanation=f"{len(skill_gap.explicitMatchedSkills)} explicit + {len(skill_gap.inferredMatchedSkills)} project-inferred matches against required stack.",
            ),
            FactorBreakdownSchema(
                factor="Role Category Alignment",
                weightPercent=20,
                scorePercent=role_score,
                explanation=(
                    f"Role category ({role_label}) is in your target list."
                    if role_aligned
                    else f"Role category ({role_label}) is outside your primary target list."
                ),
            ),
            FactorBreakdownSchema(
                factor="Domain Relevance",
                weightPercent=15,
                scorePercent=domain_score,
                explanation=(
                    f"Domain ({opportunity.domain}) matches your career profile."
                    if domain_aligned
                    else f"Adjacent technical domain ({opportunity.domain})."
                ),
            ),
            FactorBreakdownSchema(
                factor="Overall Stack Breadth",
                weightPercent=15,
                scorePercent=pref_skill_score,
                explanation=f"{skill_gap.overallCoveragePercent}% coverage across all required and preferred skills.",
            ),
            FactorBreakdownSchema(
                factor="Work Mode & Location Fit",
                weightPercent=10,
                scorePercent=logistics_score,
                explanation=f"{mode_label} in {opportunity.location}.",
            ),
        ],
        whyRecommended=why_recommended,
        contributingAttributes=contributing,
        uncertainties=uncertainties,
    )

