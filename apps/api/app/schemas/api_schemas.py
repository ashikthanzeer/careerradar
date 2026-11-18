from typing import Generic, Literal, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

WorkMode = Literal["remote", "hybrid", "onsite", "unknown"]
OpportunityType = Literal[
    "internship", "research", "fellowship", "open_source", "hackathon", "graduate"
]
RoleCategory = Literal[
    "software_engineering",
    "machine_learning",
    "data_science",
    "systems_infrastructure",
    "security",
    "research",
]
TrustLabel = Literal[
    "no_major_warnings",
    "verification_required",
    "elevated_risk",
    "insufficient_information",
]
ApplicationStatus = Literal[
    "interested",
    "saved",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
    "closed",
]


class VerificationMetadataSchema(BaseModel):
    domainVerified: bool = False
    hasPublicEngineeringFootprint: bool = False
    knownEntity: bool = False
    notes: str = ""


class OrganizationSchema(BaseModel):
    id: str
    name: str
    normalizedName: str
    officialWebsite: str | None = None
    description: str
    recruiterEmailDomain: str | None = None
    verificationMetadata: VerificationMetadataSchema


class OpportunitySourceSchema(BaseModel):
    id: str
    opportunityId: str
    sourceName: str
    sourceUrl: str
    externalId: str
    sourcePublishedAt: str | None = None
    lastCheckedAt: str
    sourceStatus: Literal["active", "stale", "unreachable"] = "active"


class OpportunitySkillRequirementSchema(BaseModel):
    skillName: str
    category: Literal["language", "framework", "systems", "data_ml", "tooling", "fundamentals"]
    requirementType: Literal["required", "preferred"]
    extractionConfidence: float


class LearningValueSchema(BaseModel):
    rating: Literal["high", "moderate", "low", "uncertain"]
    rationale: str


class OpportunityAnalysisSchema(BaseModel):
    id: str
    opportunityId: str
    analysisType: str = "rule_and_schema_validated"
    shortSummary: str
    responsibilities: list[str]
    requiredSkills: list[str]
    preferredSkills: list[str]
    eligibilityRequirements: list[str]
    experienceRequirements: str
    technologies: list[str]
    compensationSummary: str
    durationSummary: str
    locationSummary: str
    applicationDeadlineSummary: str
    ambiguitiesOrMissingInfo: list[str]
    learningValueAssessment: LearningValueSchema
    modelProvider: str
    modelName: str
    promptVersion: str
    confidence: float
    createdAt: str


class TrustEvidenceSchema(BaseModel):
    id: str
    trustAssessmentId: str
    indicatorCode: str
    severity: Literal["high", "medium", "low", "positive"]
    description: str
    evidenceType: Literal[
        "verified_fact",
        "deterministic_rule",
        "heuristic_indicator",
        "unverified_claim",
        "model_interpretation",
    ]
    evidenceReference: str
    confidence: float


class TrustAssessmentSchema(BaseModel):
    id: str
    opportunityId: str
    overallLabel: TrustLabel
    assessmentSummary: str
    limitations: str
    recommendedVerificationSteps: list[str]
    rulesetVersion: str
    createdAt: str
    evidence: list[TrustEvidenceSchema]


class SkillGapItemSchema(BaseModel):
    skillName: str
    requirementType: Literal["required", "preferred"]
    status: Literal["matched_explicit", "matched_inferred", "unverified_gap"]
    matchedVia: str | None = None
    learningSuggestion: str | None = None


class InferredMatchSchema(BaseModel):
    skillName: str
    inferredFrom: str


class SkillGapAnalysisSchema(BaseModel):
    opportunityId: str
    overallCoveragePercent: int
    requiredCoveragePercent: int
    explicitMatchedSkills: list[str]
    inferredMatchedSkills: list[InferredMatchSchema]
    missingRequiredSkills: list[str]
    missingPreferredSkills: list[str]
    items: list[SkillGapItemSchema]
    caveat: str


class FactorBreakdownSchema(BaseModel):
    factor: str
    weightPercent: int
    scorePercent: int
    explanation: str


class RecommendationMatchSchema(BaseModel):
    opportunityId: str
    compositeScore: int
    matchTier: Literal[
        "strong_alignment", "moderate_alignment", "partial_alignment", "low_alignment"
    ]
    factorBreakdown: list[FactorBreakdownSchema]
    whyRecommended: list[str]
    contributingAttributes: list[str]
    uncertainties: list[str]


class SavedOpportunitySchema(BaseModel):
    id: str
    userId: str
    opportunityId: str
    savedAt: str


class ApplicationRecordSchema(BaseModel):
    id: str
    userId: str
    opportunityId: str
    status: ApplicationStatus
    appliedAt: str | None = None
    deadline: str | None = None
    nextAction: str
    privateNotes: str
    createdAt: str
    updatedAt: str


class EnrichedOpportunitySchema(BaseModel):
    id: str
    organizationId: str
    title: str
    normalizedTitle: str
    description: str
    opportunityType: OpportunityType
    roleCategory: RoleCategory
    domain: str
    location: str
    workMode: WorkMode
    compensationMin: int | None = None
    compensationMax: int | None = None
    compensationCurrency: Literal["INR", "USD", "EUR"] | None = None
    compensationPeriod: Literal["monthly", "total_stipend", "hourly", "unpaid", "unknown"]
    duration: str
    postedAt: str | None = None
    deadline: str | None = None
    applicationUrl: str
    recruiterContactEmail: str | None = None
    status: str
    firstSeenAt: str
    lastSeenAt: str
    createdAt: str
    updatedAt: str
    isSampleData: bool
    organization: OrganizationSchema
    sources: list[OpportunitySourceSchema]
    skills: list[OpportunitySkillRequirementSchema]
    analysis: OpportunityAnalysisSchema
    trustAssessment: TrustAssessmentSchema
    skillGap: SkillGapAnalysisSchema
    recommendation: RecommendationMatchSchema
    isSaved: bool
    applicationRecord: ApplicationRecordSchema | None = None


class PaginatedResponseSchema(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    pageSize: int
    totalPages: int


class CreateOpportunityInputSchema(BaseModel):
    title: str = Field(min_length=4, max_length=255)
    organizationName: str = Field(min_length=2, max_length=200)
    officialWebsite: str | None = None
    recruiterContactEmail: str | None = None
    opportunityType: OpportunityType = "internship"
    roleCategory: RoleCategory = "software_engineering"
    domain: str = "Developer Tools & Cloud"
    location: str = Field(min_length=2, max_length=160)
    workMode: WorkMode = "remote"
    compensationMin: int | None = None
    compensationMax: int | None = None
    compensationCurrency: Literal["INR", "USD", "EUR"] | None = "INR"
    compensationPeriod: Literal[
        "monthly", "total_stipend", "hourly", "unpaid", "unknown"
    ] = "monthly"
    duration: str = Field(min_length=2, max_length=64)
    deadline: str | None = None
    applicationUrl: str = Field(min_length=8, max_length=1000)
    sourceName: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=20, max_length=15000)


class UserSkillSchema(BaseModel):
    id: str
    canonicalName: str = Field(min_length=1, max_length=120)
    category: Literal[
        "language", "framework", "systems", "data_ml", "tooling", "fundamentals"
    ] = "language"
    proficiency: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    yearsExperience: float = 1.0
    sourceType: Literal["explicit", "inferred_from_project"] = "explicit"
    sourceReference: str | None = None


class ProfileProjectSchema(BaseModel):
    id: str
    title: str
    description: str
    technologiesUsed: list[str]


class CareerProfileSchema(BaseModel):
    id: str
    userId: str
    displayName: str = Field(min_length=2, max_length=120)
    educationLevel: Literal["undergraduate", "masters", "phd", "recent_graduate"]
    fieldOfStudy: str = Field(min_length=2, max_length=160)
    institution: str = Field(min_length=2, max_length=200)
    graduationYear: int = Field(ge=2020, le=2035)
    preferredRoles: list[RoleCategory]
    preferredDomains: list[str]
    preferredLocations: list[str]
    workModes: list[WorkMode]
    preferredDuration: str
    minimumMonthlyStipendINR: int = Field(ge=0)
    careerInterestsSummary: str
    projects: list[ProfileProjectSchema]
    skills: list[UserSkillSchema]
    updatedAt: str


class CreateApplicationInputSchema(BaseModel):
    opportunityId: str
    status: ApplicationStatus = "interested"
    appliedAt: str | None = None
    deadline: str | None = None
    nextAction: str = "Review requirements and prepare tailored application"
    privateNotes: str = ""


class PatchApplicationInputSchema(BaseModel):
    status: ApplicationStatus | None = None
    appliedAt: str | None = None
    deadline: str | None = None
    nextAction: str | None = None
    privateNotes: str | None = None

