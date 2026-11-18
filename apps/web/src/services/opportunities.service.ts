import { API_CONFIG, ApiClientError, apiRequest } from './api-client';
import { localStore } from '@/lib/storage';
import { evaluateOpportunityTrust } from '@/lib/trust-engine';
import {
  analyzeSkillGap,
  computeRecommendationMatch,
  extractStructuredIntelligence,
} from '@/lib/matching-engine';
import type {
  CreateOpportunityInput,
  EnrichedOpportunity,
  Opportunity,
  OpportunityFilterParams,
  OpportunitySource,
  Organization,
  PaginatedResponse,
} from '@/types/domain';

function buildEnrichedOpportunity(opportunity: Opportunity): EnrichedOpportunity {
  const organizations = localStore.getAllOrganizations();
  const sourcesMap = localStore.getAllSources();
  const skillsMap = localStore.getAllOpportunitySkills();
  const analysesMap = localStore.getAllAnalyses();
  const profile = localStore.getProfile();
  const savedList = localStore.getSavedOpportunities();
  const applicationsList = localStore.getApplications();

  const organization: Organization = organizations[opportunity.organizationId] ?? {
    id: opportunity.organizationId,
    name: 'Unverified Organization',
    normalizedName: 'unverified organization',
    officialWebsite: null,
    description: 'No organization metadata available.',
    recruiterEmailDomain: null,
    verificationMetadata: {
      domainVerified: false,
      hasPublicEngineeringFootprint: false,
      knownEntity: false,
      notes: 'Automatically created organization placeholder.',
    },
  };

  const sources = sourcesMap[opportunity.id] ?? [];
  const extractedFallback = extractStructuredIntelligence(opportunity);
  const skills = skillsMap[opportunity.id] ?? extractedFallback.skills;
  const analysis = analysesMap[opportunity.id] ?? extractedFallback.analysis;

  const trustAssessment = evaluateOpportunityTrust(opportunity, organization);
  const skillGap = analyzeSkillGap(opportunity, skills, profile);
  const recommendation = computeRecommendationMatch(
    opportunity,
    analysis,
    skillGap,
    profile
  );

  const isSaved = savedList.some((s) => s.opportunityId === opportunity.id);
  const applicationRecord =
    applicationsList.find((a) => a.opportunityId === opportunity.id) ?? null;

  return {
    ...opportunity,
    organization,
    sources,
    skills,
    analysis,
    trustAssessment,
    skillGap,
    recommendation,
    isSaved,
    applicationRecord,
  };
}

export const opportunitiesService = {
  async listOpportunities(
    params: OpportunityFilterParams = {}
  ): Promise<PaginatedResponse<EnrichedOpportunity>> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '' && v !== 'all') {
            searchParams.set(k, String(v));
          }
        });
        return await apiRequest<PaginatedResponse<EnrichedOpportunity>>(
          `/opportunities?${searchParams.toString()}`
        );
      } catch {
        if (API_CONFIG.dataMode === 'api') throw new Error('Backend API unreachable');
      }
    }

    const all = localStore.getAllOpportunities().map(buildEnrichedOpportunity);

    const filtered = all.filter((item) => {
      if (params.q && params.q.trim() !== '') {
        const q = params.q.trim().toLowerCase();
        const searchable = [
          item.title,
          item.organization.name,
          item.description,
          item.location,
          item.domain,
          ...item.skills.map((s) => s.skillName),
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      if (params.opportunityType && params.opportunityType !== 'all') {
        if (item.opportunityType !== params.opportunityType) return false;
      }

      if (params.roleCategory && params.roleCategory !== 'all') {
        if (item.roleCategory !== params.roleCategory) return false;
      }

      if (params.domain && params.domain !== 'all') {
        if (item.domain !== params.domain) return false;
      }

      if (params.workMode && params.workMode !== 'all') {
        if (item.workMode !== params.workMode) return false;
      }

      if (params.trustFilter === 'no_major_warnings_only') {
        if (item.trustAssessment.overallLabel !== 'no_major_warnings') return false;
      } else if (params.trustFilter === 'hide_elevated_risk') {
        if (item.trustAssessment.overallLabel === 'elevated_risk') return false;
      }

      if (params.paidOnly) {
        const hasStipend =
          item.compensationPeriod !== 'unpaid' &&
          (item.compensationMin !== null || item.compensationMax !== null);
        if (!hasStipend) return false;
      }

      if (params.skill && params.skill.trim() !== '') {
        const targetSkill = params.skill.trim().toLowerCase();
        const hasSkill = item.skills.some(
          (s) => s.skillName.toLowerCase() === targetSkill
        );
        if (!hasSkill) return false;
      }

      if (params.source && params.source.trim() !== '') {
        const targetSource = params.source.trim().toLowerCase();
        const hasSource = item.sources.some((src) =>
          src.sourceName.toLowerCase().includes(targetSource)
        );
        if (!hasSource) return false;
      }

      return true;
    });

    const sortBy = params.sortBy ?? 'relevance';
    filtered.sort((a, b) => {
      if (sortBy === 'relevance') {
        // Demote elevated_risk listings in default relevance ordering
        const aRiskPenalty = a.trustAssessment.overallLabel === 'elevated_risk' ? -50 : 0;
        const bRiskPenalty = b.trustAssessment.overallLabel === 'elevated_risk' ? -50 : 0;
        return (
          b.recommendation.compositeScore +
          bRiskPenalty -
          (a.recommendation.compositeScore + aRiskPenalty)
        );
      }
      if (sortBy === 'deadline_asc') {
        const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      if (sortBy === 'posted_desc') {
        const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
        const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'stipend_desc') {
        const aVal = a.compensationMax ?? a.compensationMin ?? 0;
        const bVal = b.compensationMax ?? b.compensationMin ?? 0;
        return bVal - aVal;
      }
      return 0;
    });

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 6);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  },

  async getAllEnrichedOpportunities(): Promise<EnrichedOpportunity[]> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const res = await apiRequest<PaginatedResponse<EnrichedOpportunity>>(
          '/opportunities?pageSize=100'
        );
        return res.items;
      } catch {
        if (API_CONFIG.dataMode === 'api') throw new Error('Backend API unreachable');
      }
    }
    return localStore.getAllOpportunities().map(buildEnrichedOpportunity);
  },

  async getOpportunityById(opportunityId: string): Promise<EnrichedOpportunity> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<EnrichedOpportunity>(`/opportunities/${opportunityId}`);
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    const found = localStore
      .getAllOpportunities()
      .find((item) => item.id === opportunityId);
    if (!found) {
      throw new ApiClientError(
        `Opportunity "${opportunityId}" was not found.`,
        404,
        'RESOURCE_NOT_FOUND'
      );
    }
    return buildEnrichedOpportunity(found);
  },

  async createAndEvaluateOpportunity(
    input: CreateOpportunityInput
  ): Promise<EnrichedOpportunity> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<EnrichedOpportunity>('/opportunities', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    const now = new Date().toISOString();
    const idSuffix = Date.now().toString(36);
    const orgId = `org_custom_${idSuffix}`;
    const oppId = `opp_custom_${idSuffix}`;

    const emailDomain = input.recruiterContactEmail?.includes('@')
      ? input.recruiterContactEmail.split('@')[1]?.toLowerCase() ?? null
      : null;

    const organization: Organization = {
      id: orgId,
      name: input.organizationName.trim(),
      normalizedName: input.organizationName.trim().toLowerCase(),
      officialWebsite: input.officialWebsite?.trim() || null,
      description: `User-submitted organization record for ${input.organizationName.trim()}.`,
      recruiterEmailDomain: emailDomain,
      verificationMetadata: {
        domainVerified: Boolean(input.officialWebsite?.trim()),
        hasPublicEngineeringFootprint: false,
        knownEntity: false,
        notes: 'Submitted via Live Opportunity Evaluator in Phase 1 workspace.',
      },
    };

    const opportunity: Opportunity = {
      id: oppId,
      organizationId: orgId,
      title: input.title.trim(),
      normalizedTitle: input.title.trim().toLowerCase(),
      description: input.description.trim(),
      opportunityType: input.opportunityType,
      roleCategory: input.roleCategory,
      domain: input.domain,
      location: input.location.trim(),
      workMode: input.workMode,
      compensationMin: input.compensationMin ?? null,
      compensationMax: input.compensationMax ?? input.compensationMin ?? null,
      compensationCurrency: input.compensationCurrency ?? 'INR',
      compensationPeriod: input.compensationPeriod,
      duration: input.duration.trim(),
      postedAt: now,
      deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
      applicationUrl: input.applicationUrl.trim(),
      recruiterContactEmail: input.recruiterContactEmail?.trim() || null,
      status: 'open',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      isSampleData: false,
    };

    const source: OpportunitySource = {
      id: `src_custom_${idSuffix}`,
      opportunityId: oppId,
      sourceName: input.sourceName.trim() || 'User Submitted Listing',
      sourceUrl: input.applicationUrl.trim(),
      externalId: `usr_${idSuffix}`,
      sourcePublishedAt: now,
      lastCheckedAt: now,
      sourceStatus: 'active',
    };

    const { skills, analysis } = extractStructuredIntelligence(opportunity);

    localStore.addCustomOpportunityBundle({
      opportunity,
      organization,
      source,
      skills,
      analysis,
    });

    return buildEnrichedOpportunity(opportunity);
  },
};

