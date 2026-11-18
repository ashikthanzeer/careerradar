import { describe, expect, it } from 'vitest';
import {
  analyzeSkillGap,
  computeRecommendationMatch,
  extractStructuredIntelligence,
} from '@/lib/matching-engine';
import { createBlankCareerProfile } from '@/lib/sample-data';
import type { Opportunity, OpportunitySkillRequirement } from '@/types/domain';

const TEST_OPPORTUNITY: Opportunity = {
  id: 'opp_ml_test',
  organizationId: 'org_test',
  title: 'Machine Learning Engineering Intern',
  normalizedTitle: 'machine learning engineering intern',
  description:
    'Build retrieval and evaluation pipelines in Python, PyTorch, FastAPI, PostgreSQL, and Docker with Git workflows.',
  opportunityType: 'internship',
  roleCategory: 'machine_learning',
  domain: 'AI & Machine Learning',
  location: 'Bengaluru, India',
  workMode: 'hybrid',
  compensationMin: 70000,
  compensationMax: 80000,
  compensationCurrency: 'INR',
  compensationPeriod: 'monthly',
  duration: '6 months',
  postedAt: '2026-11-15T10:00:00Z',
  deadline: '2026-12-10T23:59:59Z',
  applicationUrl: 'https://jobs.ashbyhq.com/example/ml-intern',
  recruiterContactEmail: 'careers@example.org',
  status: 'open',
  firstSeenAt: '2026-11-15T10:00:00Z',
  lastSeenAt: '2026-11-17T10:00:00Z',
  createdAt: '2026-11-15T10:00:00Z',
  updatedAt: '2026-11-17T10:00:00Z',
  isSampleData: false,
};

const TEST_SKILLS: OpportunitySkillRequirement[] = [
  { skillName: 'Python', category: 'language', requirementType: 'required', extractionConfidence: 0.99 },
  { skillName: 'FastAPI', category: 'framework', requirementType: 'required', extractionConfidence: 0.95 },
  { skillName: 'PostgreSQL', category: 'systems', requirementType: 'required', extractionConfidence: 0.93 },
  { skillName: 'PyTorch', category: 'data_ml', requirementType: 'required', extractionConfidence: 0.97 },
  { skillName: 'Docker', category: 'tooling', requirementType: 'preferred', extractionConfidence: 0.92 },
];

describe('Explainable Compatibility & Skill-Gap Engine', () => {
  it('distinguishes explicit skills, project-inferred skills, and unverified gaps', () => {
    const baseProfile = {
      ...createBlankCareerProfile('usr_1', 'Test Student'),
      preferredRoles: ['machine_learning' as const],
      preferredDomains: ['AI & Machine Learning' as const],
      skills: [
        {
          id: 's1',
          canonicalName: 'Python',
          category: 'language' as const,
          proficiency: 'advanced' as const,
          yearsExperience: 2,
          sourceType: 'explicit' as const,
        },
        {
          id: 's2',
          canonicalName: 'FastAPI',
          category: 'framework' as const,
          proficiency: 'intermediate' as const,
          yearsExperience: 1,
          sourceType: 'explicit' as const,
        },
      ],
      projects: [
        {
          id: 'p1',
          title: 'Telemetry Queue',
          description: 'Containerized PostgreSQL worker service',
          technologiesUsed: ['PostgreSQL', 'Docker'],
        },
      ],
    };

    const gap = analyzeSkillGap(TEST_OPPORTUNITY, TEST_SKILLS, baseProfile);

    expect(gap.explicitMatchedSkills).toContain('Python');
    expect(gap.explicitMatchedSkills).toContain('FastAPI');

    const inferredNames = gap.inferredMatchedSkills.map((s) => s.skillName);
    expect(inferredNames).toContain('PostgreSQL');
    expect(inferredNames).toContain('Docker');

    expect(gap.missingRequiredSkills).toContain('PyTorch');
    expect(gap.caveat).toContain('does not prove you lack the skill');
  });

  it('produces an explainable weighted factor breakdown and updates score when missing skill is added', () => {
    const profile = {
      ...createBlankCareerProfile('usr_1', 'Test Student'),
      preferredRoles: ['machine_learning' as const],
      preferredDomains: ['AI & Machine Learning' as const],
      skills: [
        {
          id: 's1',
          canonicalName: 'Python',
          category: 'language' as const,
          proficiency: 'advanced' as const,
          yearsExperience: 2,
          sourceType: 'explicit' as const,
        },
      ],
    };

    const { analysis } = extractStructuredIntelligence(TEST_OPPORTUNITY);
    const initialGap = analyzeSkillGap(TEST_OPPORTUNITY, TEST_SKILLS, profile);
    const initialMatch = computeRecommendationMatch(
      TEST_OPPORTUNITY,
      analysis,
      initialGap,
      profile
    );

    expect(initialMatch.factorBreakdown).toHaveLength(5);

    const updatedProfile = {
      ...profile,
      skills: [
        ...profile.skills,
        {
          id: 's2',
          canonicalName: 'FastAPI',
          category: 'framework' as const,
          proficiency: 'intermediate' as const,
          yearsExperience: 1,
          sourceType: 'explicit' as const,
        },
        {
          id: 's3',
          canonicalName: 'PostgreSQL',
          category: 'systems' as const,
          proficiency: 'intermediate' as const,
          yearsExperience: 1,
          sourceType: 'explicit' as const,
        },
        {
          id: 's4',
          canonicalName: 'PyTorch',
          category: 'data_ml' as const,
          proficiency: 'intermediate' as const,
          yearsExperience: 1,
          sourceType: 'explicit' as const,
        },
      ],
    };

    const updatedGap = analyzeSkillGap(TEST_OPPORTUNITY, TEST_SKILLS, updatedProfile);
    const updatedMatch = computeRecommendationMatch(
      TEST_OPPORTUNITY,
      analysis,
      updatedGap,
      updatedProfile
    );

    expect(updatedGap.requiredCoveragePercent).toBe(100);
    expect(updatedMatch.compositeScore).toBeGreaterThan(initialMatch.compositeScore);
  });
});
