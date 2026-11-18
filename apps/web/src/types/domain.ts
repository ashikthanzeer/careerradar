/**
 * CareerRadar (Career Intelligence) — Normalized Domain Schema
 * Mirrors PRD §10 database design and §6 functional requirements.
 */

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type OpportunityType =
  | 'internship'
  | 'research'
  | 'fellowship'
  | 'open_source'
  | 'hackathon'
  | 'graduate';

export type RoleCategory =
  | 'software_engineering'
  | 'machine_learning'
  | 'data_science'
  | 'systems_infrastructure'
  | 'security'
  | 'research';

export type DomainCategory =
  | 'Developer Tools & Cloud'
  | 'AI & Machine Learning'
  | 'Distributed Systems'
  | 'Fintech & Payments'
  | 'Cybersecurity'
  | 'Scientific Computing'
  | 'Open Source Ecosystem'
  | 'Data Engineering';

export type OpportunityStatus = 'open' | 'closing_soon' | 'expired' | 'unverified_status';

export type SourceStatus = 'active' | 'stale' | 'unreachable';

export type TrustLabel =
  | 'no_major_warnings'
  | 'verification_required'
  | 'elevated_risk'
  | 'insufficient_information';

export type RiskSeverity = 'high' | 'medium' | 'low' | 'positive';

export type EvidenceType =
  | 'verified_fact'
  | 'deterministic_rule'
  | 'heuristic_indicator'
  | 'unverified_claim'
  | 'model_interpretation';

export type SkillProficiency = 'beginner' | 'intermediate' | 'advanced';

export type SkillSourceType = 'explicit' | 'inferred_from_project';

export type ApplicationStatus =
  | 'interested'
  | 'saved'
  | 'applied'
  | 'assessment'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

export interface Organization {
  id: string;
  name: string;
  normalizedName: string;
  officialWebsite: string | null;
  description: string;
  recruiterEmailDomain: string | null;
  verificationMetadata: {
    domainVerified: boolean;
    hasPublicEngineeringFootprint: boolean;
    knownEntity: boolean;
    notes: string;
  };
}

export interface OpportunitySource {
  id: string;
  opportunityId: string;
  sourceName: string;
  sourceUrl: string;
  externalId: string;
  sourcePublishedAt: string | null;
  lastCheckedAt: string;
  sourceStatus: SourceStatus;
}

export interface OpportunitySkillRequirement {
  skillName: string;
  category: 'language' | 'framework' | 'systems' | 'data_ml' | 'tooling' | 'fundamentals';
  requirementType: 'required' | 'preferred';
  extractionConfidence: number;
}

export interface OpportunityAnalysis {
  id: string;
  opportunityId: string;
  analysisType: 'rule_and_schema_validated';
  shortSummary: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  eligibilityRequirements: string[];
  experienceRequirements: string;
  technologies: string[];
  compensationSummary: string;
  durationSummary: string;
  locationSummary: string;
  applicationDeadlineSummary: string;
  ambiguitiesOrMissingInfo: string[];
  learningValueAssessment: {
    rating: 'high' | 'moderate' | 'low' | 'uncertain';
    rationale: string;
  };
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  confidence: number;
  createdAt: string;
}

export interface TrustEvidence {
  id: string;
  trustAssessmentId: string;
  indicatorCode:
    | 'FEE_REQUIRED'
    | 'CREDENTIAL_HARVESTING'
    | 'BRAND_IMPERSONATION_RISK'
    | 'SUSPICIOUS_RECRUITER_EMAIL'
    | 'UNREALISTIC_COMPENSATION'
    | 'VAGUE_RESPONSIBILITIES'
    | 'UNRELATED_APPLICATION_URL'
    | 'MISSING_COMPANY_INFO'
    | 'OFFICIAL_DOMAIN_ALIGNED'
    | 'CLEAR_TECHNICAL_SCOPE';
  severity: RiskSeverity;
  description: string;
  evidenceType: EvidenceType;
  evidenceReference: string;
  confidence: number;
}

export interface TrustAssessment {
  id: string;
  opportunityId: string;
  overallLabel: TrustLabel;
  assessmentSummary: string;
  limitations: string;
  recommendedVerificationSteps: string[];
  rulesetVersion: string;
  createdAt: string;
  evidence: TrustEvidence[];
}

export interface Opportunity {
  id: string;
  organizationId: string;
  title: string;
  normalizedTitle: string;
  description: string;
  opportunityType: OpportunityType;
  roleCategory: RoleCategory;
  domain: DomainCategory;
  location: string;
  workMode: WorkMode;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: 'INR' | 'USD' | 'EUR' | null;
  compensationPeriod: 'monthly' | 'total_stipend' | 'hourly' | 'unpaid' | 'unknown';
  duration: string;
  postedAt: string | null;
  deadline: string | null;
  applicationUrl: string;
  recruiterContactEmail: string | null;
  status: OpportunityStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  isSampleData: boolean;
}

export interface UserSkill {
  id: string;
  canonicalName: string;
  category: 'language' | 'framework' | 'systems' | 'data_ml' | 'tooling' | 'fundamentals';
  proficiency: SkillProficiency;
  yearsExperience: number;
  sourceType: SkillSourceType;
  sourceReference?: string;
}

export interface CareerProfile {
  id: string;
  userId: string;
  displayName: string;
  educationLevel: 'undergraduate' | 'masters' | 'phd' | 'recent_graduate';
  fieldOfStudy: string;
  institution: string;
  graduationYear: number;
  preferredRoles: RoleCategory[];
  preferredDomains: DomainCategory[];
  preferredLocations: string[];
  workModes: WorkMode[];
  preferredDuration: string;
  minimumMonthlyStipendINR: number;
  careerInterestsSummary: string;
  projects: {
    id: string;
    title: string;
    description: string;
    technologiesUsed: string[];
  }[];
  skills: UserSkill[];
  updatedAt: string;
}

export interface SkillGapItem {
  skillName: string;
  requirementType: 'required' | 'preferred';
  status: 'matched_explicit' | 'matched_inferred' | 'unverified_gap';
  matchedVia?: string;
  learningSuggestion?: string;
}

export interface SkillGapAnalysis {
  opportunityId: string;
  overallCoveragePercent: number;
  requiredCoveragePercent: number;
  explicitMatchedSkills: string[];
  inferredMatchedSkills: { skillName: string; inferredFrom: string }[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  items: SkillGapAnalysisItem[];
  caveat: string;
}

export type SkillGapAnalysisItem = SkillGapItem;

export interface RecommendationMatch {
  opportunityId: string;
  compositeScore: number; // 0 to 100 explainable weighted index, NOT selection probability
  matchTier: 'strong_alignment' | 'moderate_alignment' | 'partial_alignment' | 'low_alignment';
  factorBreakdown: {
    factor: string;
    weightPercent: number;
    scorePercent: number;
    explanation: string;
  }[];
  whyRecommended: string[];
  contributingAttributes: string[];
  uncertainties: string[];
}

export interface EnrichedOpportunity extends Opportunity {
  organization: Organization;
  sources: OpportunitySource[];
  skills: OpportunitySkillRequirement[];
  analysis: OpportunityAnalysis;
  trustAssessment: TrustAssessment;
  skillGap: SkillGapAnalysis;
  recommendation: RecommendationMatch;
  isSaved: boolean;
  applicationRecord: ApplicationRecord | null;
}

export interface SavedOpportunity {
  id: string;
  userId: string;
  opportunityId: string;
  savedAt: string;
}

export interface ApplicationRecord {
  id: string;
  userId: string;
  opportunityId: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  deadline: string | null;
  nextAction: string;
  privateNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityFilterParams {
  q?: string;
  opportunityType?: OpportunityType | 'all';
  roleCategory?: RoleCategory | 'all';
  domain?: DomainCategory | 'all';
  workMode?: WorkMode | 'all';
  trustFilter?: 'all' | 'no_major_warnings_only' | 'hide_elevated_risk';
  paidOnly?: boolean;
  skill?: string;
  source?: string;
  sortBy?: 'relevance' | 'deadline_asc' | 'posted_desc' | 'stipend_desc';
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateOpportunityInput {
  title: string;
  organizationName: string;
  officialWebsite?: string;
  recruiterContactEmail?: string;
  opportunityType: OpportunityType;
  roleCategory: RoleCategory;
  domain: DomainCategory;
  location: string;
  workMode: WorkMode;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: 'INR' | 'USD' | 'EUR' | null;
  compensationPeriod: 'monthly' | 'total_stipend' | 'hourly' | 'unpaid' | 'unknown';
  duration: string;
  deadline?: string;
  applicationUrl: string;
  sourceName: string;
  description: string;
}

