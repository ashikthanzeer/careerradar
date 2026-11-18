import type {
  CareerProfile,
  Opportunity,
  OpportunityAnalysis,
  OpportunitySkillRequirement,
  RecommendationMatch,
  SkillGapAnalysis,
  SkillGapItem,
} from '@/types/domain';
import {
  ROLE_CATEGORY_LABELS,
  WORK_MODE_LABELS,
  formatCleanText,
  formatLocationWithMode,
} from './utils';

const LEARNING_SUGGESTIONS: Record<string, string> = {
  pytorch: 'Build and benchmark a small transformer or vision training pipeline with PyTorch & TorchScript.',
  kubernetes: 'Deploy a multi-service container workload locally with kind/minikube and write Helm manifests.',
  rust: 'Implement a concurrent CLI tool or network proxy in Rust focusing on ownership and async Tokio.',
  go: 'Write a fault-tolerant gRPC microservice or worker pool in Go with structured concurrency.',
  kafka: 'Set up an event-driven producer/consumer pipeline using Apache Kafka or Redpanda.',
  graphql: 'Design a strongly-typed GraphQL schema with DataLoader batching to eliminate N+1 queries.',
  docker: 'Containerize a full-stack application using multi-stage Dockerfiles and Docker Compose.',
  postgresql: 'Practice query plan inspection (EXPLAIN ANALYZE), indexing strategies, and transactional isolation.',
  typescript: 'Refactor a React or Node module to strict TypeScript using discriminated unions and generics.',
  'model deployment': 'Package a trained model behind a FastAPI inference endpoint with latency and drift metrics.',
  'ml pipelines': 'Orchestrate a reproducible data preprocessing and evaluation workflow with MLflow or DVC.',
  'distributed systems': 'Study consensus (Raft), idempotency keys, and partitioned state handling.',
  'linux kernel': 'Explore eBPF tracing tools or build and load a minimal Linux kernel module in a VM.',
  cpp: 'Implement latency-sensitive data structures in modern C++20 with RAII and sanitizers.',
  'c++': 'Implement latency-sensitive data structures in modern C++20 with RAII and sanitizers.',
};

function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Computes a transparent Skill-Gap Analysis comparing a user's CareerProfile
 * (both explicitly declared skills and project-inferred skills) against an Opportunity's requirements.
 * Complies with PRD §6.6:
 * - Distinguishes explicitly declared skills, inferred skills, and unverified/missing skills.
 * - Explicitly notes that a missing profile entry does not prove the user lacks the skill.
 */
export function analyzeSkillGap(
  opportunity: Opportunity,
  opportunitySkills: OpportunitySkillRequirement[],
  profile: CareerProfile
): SkillGapAnalysis {
  const explicitMap = new Map<string, string>();
  const inferredMap = new Map<string, string>();

  for (const s of profile.skills) {
    const key = normalizeSkillName(s.canonicalName);
    if (s.sourceType !== 'inferred_from_project') {
      explicitMap.set(key, s.canonicalName);
    } else {
      inferredMap.set(key, s.sourceReference ?? 'Profile project');
    }
  }

  for (const proj of profile.projects) {
    for (const tech of proj.technologiesUsed) {
      const key = normalizeSkillName(tech);
      if (!explicitMap.has(key) && !inferredMap.has(key)) {
        inferredMap.set(key, `Project: ${proj.title}`);
      }
    }
  }

  const explicitMatchedSkills: string[] = [];
  const inferredMatchedSkills: { skillName: string; inferredFrom: string }[] = [];
  const missingRequiredSkills: string[] = [];
  const missingPreferredSkills: string[] = [];
  const items: SkillGapItem[] = [];

  for (const req of opportunitySkills) {
    const key = normalizeSkillName(req.skillName);
    if (explicitMap.has(key)) {
      explicitMatchedSkills.push(req.skillName);
      items.push({
        skillName: req.skillName,
        requirementType: req.requirementType,
        status: 'matched_explicit',
        matchedVia: 'Explicitly listed in your Career Profile skill matrix',
      });
    } else if (inferredMap.has(key)) {
      const sourceRef = inferredMap.get(key)!;
      inferredMatchedSkills.push({ skillName: req.skillName, inferredFrom: sourceRef });
      items.push({
        skillName: req.skillName,
        requirementType: req.requirementType,
        status: 'matched_inferred',
        matchedVia: `Inferred from ${sourceRef}`,
      });
    } else {
      if (req.requirementType === 'required') {
        missingRequiredSkills.push(req.skillName);
      } else {
        missingPreferredSkills.push(req.skillName);
      }
      items.push({
        skillName: req.skillName,
        requirementType: req.requirementType,
        status: 'unverified_gap',
        learningSuggestion:
          LEARNING_SUGGESTIONS[key] ??
          `Build a focused artifact or review official documentation for ${req.skillName} before interviewing.`,
      });
    }
  }

  const requiredItems = items.filter((i) => i.requirementType === 'required');
  const matchedRequiredCount = requiredItems.filter((i) => i.status !== 'unverified_gap').length;
  const requiredCoveragePercent =
    requiredItems.length > 0
      ? Math.round((matchedRequiredCount / requiredItems.length) * 100)
      : 0;

  const totalMatchedCount = items.filter((i) => i.status !== 'unverified_gap').length;
  const overallCoveragePercent =
    items.length > 0 ? Math.round((totalMatchedCount / items.length) * 100) : 0;

  return {
    opportunityId: opportunity.id,
    overallCoveragePercent,
    requiredCoveragePercent,
    explicitMatchedSkills,
    inferredMatchedSkills,
    missingRequiredSkills,
    missingPreferredSkills,
    items,
    caveat:
      'Skill comparison reflects declared profile entries and project technologies. An unverified gap indicates the skill is not currently recorded on your profile—it does not prove you lack the skill.',
  };
}

/**
 * Explainable Weighted Recommendation Scorer.
 * Complies with PRD §6.4:
 * - Explains why the opportunity was recommended, which user attributes contributed,
 *   which skills are missing, and what requirements remain uncertain.
 * - Never presents scores as objective selection probabilities.
 */
export function computeRecommendationMatch(
  opportunity: Opportunity,
  analysis: OpportunityAnalysis,
  skillGap: SkillGapAnalysis,
  profile: CareerProfile
): RecommendationMatch {
  const whyRecommended: string[] = [];
  const contributingAttributes: string[] = [];
  const uncertainties: string[] = [];

  // 1. Required Skill Overlap (Weight: 40%)
  const reqSkillScore = skillGap.requiredCoveragePercent;
  if (reqSkillScore >= 70) {
    whyRecommended.push(
      `Covers ${reqSkillScore}% of core required technical skills (${[
        ...skillGap.explicitMatchedSkills,
        ...skillGap.inferredMatchedSkills.map((i) => i.skillName),
      ]
        .slice(0, 4)
        .join(', ')}).`
    );
  }
  if (skillGap.explicitMatchedSkills.length > 0) {
    contributingAttributes.push(
      `Declared skills: ${skillGap.explicitMatchedSkills.slice(0, 4).join(', ')}`
    );
  }
  if (skillGap.inferredMatchedSkills.length > 0) {
    contributingAttributes.push(
      `Project-inferred skills: ${skillGap.inferredMatchedSkills
        .map((s) => s.skillName)
        .slice(0, 3)
        .join(', ')}`
    );
  }

  // 2. Role Alignment (Weight: 20%)
  const roleAligned = profile.preferredRoles.includes(opportunity.roleCategory);
  const roleScore = roleAligned ? 100 : 35;
  if (roleAligned) {
    const label = ROLE_CATEGORY_LABELS[opportunity.roleCategory];
    whyRecommended.push(`Matches your target role track (${label}).`);
    contributingAttributes.push(`Preferred role: ${label}`);
  }

  // 3. Domain Alignment (Weight: 15%)
  const domainAligned = profile.preferredDomains.includes(opportunity.domain);
  const domainScore = domainAligned ? 100 : 40;
  if (domainAligned) {
    whyRecommended.push(`Direct alignment with your preferred domain (${opportunity.domain}).`);
    contributingAttributes.push(`Preferred domain: ${opportunity.domain}`);
  }

  // 4. Preferred Skill & Learning Alignment (Weight: 15%)
  const prefSkillScore = skillGap.overallCoveragePercent;

  // 5. Work Mode & Location Alignment (Weight: 10%)
  const modeAligned = profile.workModes.includes(opportunity.workMode);
  const locationAligned =
    opportunity.workMode === 'remote' ||
    profile.preferredLocations.some((loc) =>
      opportunity.location.toLowerCase().includes(loc.toLowerCase())
    );
  const logisticsScore = modeAligned && locationAligned ? 100 : modeAligned || locationAligned ? 70 : 30;
  if (modeAligned && locationAligned) {
    contributingAttributes.push(
      `Work mode & location preference (${WORK_MODE_LABELS[opportunity.workMode]} · ${opportunity.location})`
    );
  } else {
    uncertainties.push(
      `Listing work mode/location (${WORK_MODE_LABELS[opportunity.workMode]} · ${opportunity.location}) differs from your primary preference.`
    );
  }

  if (analysis.ambiguitiesOrMissingInfo.length > 0) {
    uncertainties.push(...analysis.ambiguitiesOrMissingInfo.slice(0, 2));
  }
  if (skillGap.missingRequiredSkills.length > 0) {
    uncertainties.push(
      `Required skills not yet listed on your profile: ${skillGap.missingRequiredSkills.join(', ')}.`
    );
  }

  const compositeScore = Math.round(
    reqSkillScore * 0.4 +
      roleScore * 0.2 +
      domainScore * 0.15 +
      prefSkillScore * 0.15 +
      logisticsScore * 0.1
  );

  let matchTier: RecommendationMatch['matchTier'] = 'low_alignment';
  if (compositeScore >= 80) matchTier = 'strong_alignment';
  else if (compositeScore >= 62) matchTier = 'moderate_alignment';
  else if (compositeScore >= 45) matchTier = 'partial_alignment';

  if (whyRecommended.length === 0) {
    whyRecommended.push(
      'Surfaced as an exploratory technical opportunity; review missing required skills before applying.'
    );
  }

  return {
    opportunityId: opportunity.id,
    compositeScore,
    matchTier,
    factorBreakdown: [
      {
        factor: 'Required Skill Coverage',
        weightPercent: 40,
        scorePercent: reqSkillScore,
        explanation: `${skillGap.explicitMatchedSkills.length} explicit + ${skillGap.inferredMatchedSkills.length} project-inferred matches against required stack.`,
      },
      {
        factor: 'Role Category Alignment',
        weightPercent: 20,
        scorePercent: roleScore,
        explanation: roleAligned
          ? `Role category (${ROLE_CATEGORY_LABELS[opportunity.roleCategory]}) is in your target list.`
          : `Role category (${ROLE_CATEGORY_LABELS[opportunity.roleCategory]}) is outside your primary target list.`,
      },
      {
        factor: 'Domain Relevance',
        weightPercent: 15,
        scorePercent: domainScore,
        explanation: domainAligned
          ? `Domain (${opportunity.domain}) matches your career profile.`
          : `Adjacent technical domain (${opportunity.domain}).`,
      },
      {
        factor: 'Overall Stack Breadth',
        weightPercent: 15,
        scorePercent: prefSkillScore,
        explanation: `${skillGap.overallCoveragePercent}% coverage across all required and preferred skills.`,
      },
      {
        factor: 'Work Mode & Location Fit',
        weightPercent: 10,
        scorePercent: logisticsScore,
        explanation: `${WORK_MODE_LABELS[opportunity.workMode]} in ${opportunity.location}.`,
      },
    ],
    whyRecommended,
    contributingAttributes,
    uncertainties,
  };
}

const KNOWN_TECHNICAL_SKILLS: {
  canonical: string;
  patterns: RegExp[];
  category: OpportunitySkillRequirement['category'];
}[] = [
  { canonical: 'Python', patterns: [/\bpython\b/i], category: 'language' },
  { canonical: 'TypeScript', patterns: [/\btypescript\b/i], category: 'language' },
  { canonical: 'Go', patterns: [/\bgolang\b|\bgo\s+programming\b|\bin\s+go\b/i], category: 'language' },
  { canonical: 'Rust', patterns: [/\brust\b/i], category: 'language' },
  { canonical: 'C++', patterns: [/\bc\+\+\b|\bcpp\b/i], category: 'language' },
  { canonical: 'SQL', patterns: [/\bsql\b/i], category: 'language' },
  { canonical: 'React', patterns: [/\breact\b/i], category: 'framework' },
  { canonical: 'FastAPI', patterns: [/\bfastapi\b/i], category: 'framework' },
  { canonical: 'PyTorch', patterns: [/\bpytorch\b/i], category: 'data_ml' },
  { canonical: 'PostgreSQL', patterns: [/\bpostgresql\b|\bpostgres\b/i], category: 'systems' },
  { canonical: 'Docker', patterns: [/\bdocker\b/i], category: 'tooling' },
  { canonical: 'Kubernetes', patterns: [/\bkubernetes\b|\bk8s\b/i], category: 'systems' },
  { canonical: 'Git', patterns: [/\bgit\b/i], category: 'tooling' },
  { canonical: 'Linux', patterns: [/\blinux\b/i], category: 'systems' },
  { canonical: 'Distributed Systems', patterns: [/\bdistributed\s+systems\b/i], category: 'systems' },
  { canonical: 'Machine Learning', patterns: [/\bmachine\s+learning\b/i], category: 'data_ml' },
];

/**
 * Deterministic schema-validated extractor for user-submitted opportunities in Phase 1.
 * Never invents compensation or eligibility criteria; explicitly flags missing information.
 */
export function extractStructuredIntelligence(
  opportunity: Opportunity
): { skills: OpportunitySkillRequirement[]; analysis: OpportunityAnalysis } {
  const cleanDescription = formatCleanText(opportunity.description);
  const cleanTitle = formatCleanText(opportunity.title);
  const skills: OpportunitySkillRequirement[] = [];
  for (const item of KNOWN_TECHNICAL_SKILLS) {
    if (item.patterns.some((p) => p.test(cleanDescription) || p.test(cleanTitle))) {
      skills.push({
        skillName: item.canonical,
        category: item.category,
        requirementType: skills.length < 4 ? 'required' : 'preferred',
        extractionConfidence: 0.92,
      });
    }
  }

  const sentences = cleanDescription
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const ambiguities: string[] = [];
  if (opportunity.compensationMin === null && opportunity.compensationMax === null) {
    ambiguities.push('Compensation / stipend amount is not disclosed in the listing.');
  }
  if (!opportunity.deadline) {
    ambiguities.push('Exact application closing date is not specified.');
  }
  if (sentences.length < 3) {
    ambiguities.push('Technical deliverables and mentorship structure are not detailed.');
  }

  const requiredSkills = skills
    .filter((s) => s.requirementType === 'required')
    .map((s) => s.skillName);
  const preferredSkills = skills
    .filter((s) => s.requirementType === 'preferred')
    .map((s) => s.skillName);

  const locationSummary = formatLocationWithMode(opportunity.location, opportunity.workMode);

  const analysis: OpportunityAnalysis = {
    id: `analysis_${opportunity.id}`,
    opportunityId: opportunity.id,
    analysisType: 'rule_and_schema_validated',
    shortSummary:
      sentences[0] ??
      (locationSummary !== 'Not available'
        ? `${cleanTitle} (${locationSummary}).`
        : `${cleanTitle}.`),
    responsibilities:
      sentences.slice(0, 4).length > 0
        ? sentences.slice(0, 4)
        : ['Not available'],
    requiredSkills,
    preferredSkills,
    eligibilityRequirements: ['Not available'],
    experienceRequirements: 'Not available',
    technologies: skills.map((s) => s.skillName),
    compensationSummary:
      opportunity.compensationPeriod === 'unpaid'
        ? 'Unpaid'
        : opportunity.compensationMin !== null || opportunity.compensationMax !== null
          ? `${opportunity.compensationCurrency ?? ''} ${opportunity.compensationMin ?? opportunity.compensationMax} (${opportunity.compensationPeriod})`.trim()
          : 'Not available',
    durationSummary:
      opportunity.duration &&
      !['not available', 'unknown', 'unspecified'].includes(opportunity.duration.trim().toLowerCase())
        ? opportunity.duration
        : 'Not available',
    locationSummary,
    applicationDeadlineSummary: opportunity.deadline ?? 'Not available',
    ambiguitiesOrMissingInfo: ambiguities,
    learningValueAssessment: {
      rating: sentences.length >= 3 && skills.length >= 2 ? 'high' : 'uncertain',
      rationale:
        sentences.length >= 3 && skills.length >= 2
          ? 'Listing specifies concrete technical stack and engineering deliverables.'
          : 'Insufficient technical depth in description to verify mentorship or engineering rigour.',
    },
    modelProvider: 'CareerRadar Deterministic Extractor',
    modelName: 'schema-rule-extractor-v1',
    promptVersion: 'deterministic-1.0',
    confidence: 0.9,
    createdAt: opportunity.updatedAt,
  };

  return { skills, analysis };
}

