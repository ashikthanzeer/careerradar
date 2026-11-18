import { API_CONFIG, ApiClientError, apiRequest } from './api-client';
import { localStore } from '@/lib/storage';
import { evaluateOpportunityTrust } from '@/lib/trust-engine';
import {
  analyzeSkillGap,
  computeRecommendationMatch,
  extractStructuredIntelligence,
} from '@/lib/matching-engine';
import type {
  CareerProfile,
  CreateOpportunityInput,
  EnrichedOpportunity,
  LiveFetchResponse,
  Opportunity,
  OpportunityFilterParams,
  OpportunitySource,
  Organization,
  PaginatedResponse,
} from '@/types/domain';

const CLOSED_LISTING_REGEX =
  /\b(?:no longer accepting applications|job is no longer available|position has been filled|this position is closed|internship is closed|applications are closed|posting has been removed|404 not found|page not found|no longer open|listing has expired|role has been filled)\b/i;

function isMockListingExpired(opp: Pick<Opportunity, 'status' | 'deadline' | 'postedAt' | 'firstSeenAt' | 'title' | 'description'>): boolean {
  const nowMs = Date.now();
  if (opp.status === 'expired') return true;
  if (CLOSED_LISTING_REGEX.test(`${opp.title || ''} ${opp.description || ''}`)) {
    return true;
  }
  if (opp.deadline) {
    const dlTime = new Date(opp.deadline).getTime();
    if (!Number.isNaN(dlTime) && dlTime < nowMs) return true;
    return false;
  }
  const refPosted = opp.postedAt || opp.firstSeenAt;
  if (refPosted) {
    const postedTime = new Date(refPosted).getTime();
    if (!Number.isNaN(postedTime) && nowMs - postedTime > 90 * 86400 * 1000) {
      return true;
    }
  }
  return false;
}

function isOpportunityCompliantForProfile(
  item: EnrichedOpportunity,
  profile: CareerProfile
): boolean {
  const prefLocs = profile.preferredLocations.map((p) => p.trim().toLowerCase()).filter(Boolean);
  const prefModes = profile.workModes.map((m) => m.trim().toLowerCase()).filter(Boolean);
  const prefRoles = new Set(profile.preferredRoles.map((r) => r.trim().toLowerCase()));
  const prefDomains = new Set(profile.preferredDomains.map((d) => d.trim().toLowerCase()));

  const itemLoc = (item.location || '').toLowerCase();
  const itemMode = (item.workMode || '').toLowerCase();

  let locOk = true;
  if (prefLocs.length > 0) {
    const wantsRemote = prefLocs.some((p) => p.includes('remote'));
    const cities = prefLocs.filter((p) => !p.includes('remote'));
    const matchesRemote = wantsRemote && (itemMode === 'remote' || itemLoc.includes('remote'));
    const matchesCity = cities.some(
      (c) => itemLoc.includes(c) || (c === 'bengaluru' && itemLoc.includes('bangalore'))
    );
    if (matchesRemote) {
      locOk = true;
    } else if (matchesCity) {
      locOk = prefModes.length === 0 || prefModes.includes(itemMode);
    } else {
      locOk = false;
    }
  } else if (prefModes.length > 0) {
    locOk = prefModes.includes(itemMode);
  }

  const roleOk = prefRoles.size === 0 || prefRoles.has((item.roleCategory || '').toLowerCase());
  const domainOk = prefDomains.size === 0 || prefDomains.has((item.domain || '').toLowerCase());
  return locOk && (roleOk || domainOk);
}

function recomputeEnrichedForProfile(
  item: EnrichedOpportunity,
  profile: CareerProfile
): EnrichedOpportunity {
  const savedList = localStore.getSavedOpportunities();
  const applicationsList = localStore.getApplications();
  const skillGap = analyzeSkillGap(item, item.skills, profile);
  const recommendation = computeRecommendationMatch(
    item,
    item.analysis,
    skillGap,
    profile
  );

  return {
    ...item,
    skillGap,
    recommendation,
    isSaved: savedList.some((s) => s.opportunityId === item.id),
    applicationRecord:
      applicationsList.find((a) => a.opportunityId === item.id) ?? null,
  };
}

function filterAndPaginateLocally(
  allItems: EnrichedOpportunity[],
  params: OpportunityFilterParams,
  profile: CareerProfile
): PaginatedResponse<EnrichedOpportunity> {
  const filtered = allItems.filter((item) => {
    if (isMockListingExpired(item)) return false;

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

    if (params.region && params.region !== 'all') {
      const nativeCountry = (profile.nativeCountry || 'India').toLowerCase();
      const locLower = item.location.toLowerCase();
      const indiaKeywords = ['india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'gurugram', 'noida', 'delhi', 'chennai', 'kochi'];
      const isNative =
        nativeCountry === 'india'
          ? indiaKeywords.some((k) => locLower.includes(k))
          : locLower.includes(nativeCountry);
      if (params.region === 'native' && !isNative) return false;
      if (params.region === 'worldwide' && isNative) return false;
    }

    return true;
  });

  const sortBy = params.sortBy ?? 'relevance';
  filtered.sort((a, b) => {
    if (sortBy === 'relevance') {
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

  let finalItems = filtered;
  if (profile.onboardingCompleted) {
    const compliant = filtered.filter((it) => isOpportunityCompliantForProfile(it, profile));
    const nonCompliant = filtered.filter((it) => !isOpportunityCompliantForProfile(it, profile));
    if (compliant.length >= 8) {
      const maxNonCompliant = Math.floor(compliant.length / 3);
      const allowedIds = new Set([
        ...compliant.map((it) => it.id),
        ...nonCompliant.slice(0, maxNonCompliant).map((it) => it.id),
      ]);
      finalItems = filtered.filter((it) => allowedIds.has(it.id));
    }
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 12);
  const total = finalItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = finalItems.slice(start, start + pageSize);

  return {
    items,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

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
  async syncOpportunitiesToLocalCache(): Promise<EnrichedOpportunity[]> {
    const res = await apiRequest<PaginatedResponse<EnrichedOpportunity>>(
      '/opportunities?page=1&pageSize=100'
    );
    localStore.saveCachedOpportunities(res.items);
    return res.items;
  },

  async listOpportunities(
    params: OpportunityFilterParams = {}
  ): Promise<PaginatedResponse<EnrichedOpportunity>> {
    const profile = localStore.getProfile();
    const cached = localStore.getCachedOpportunities();
    if (cached.length > 0) {
      const recomputed = cached
        .filter((opp) => !isMockListingExpired(opp))
        .map((item) => recomputeEnrichedForProfile(item, profile));
      return filterAndPaginateLocally(recomputed, params, profile);
    }

    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const synced = await this.syncOpportunitiesToLocalCache();
        const recomputed = synced
          .filter((opp) => !isMockListingExpired(opp))
          .map((item) => recomputeEnrichedForProfile(item, profile));
        return filterAndPaginateLocally(recomputed, params, profile);
      } catch {
        if (API_CONFIG.dataMode === 'api') throw new Error('Backend API unreachable');
      }
    }

    const all = localStore
      .getAllOpportunities()
      .filter((opp) => !isMockListingExpired(opp))
      .map(buildEnrichedOpportunity);

    return filterAndPaginateLocally(all, params, profile);
  },

  async getAllEnrichedOpportunities(): Promise<EnrichedOpportunity[]> {
    const profile = localStore.getProfile();
    const cached = localStore.getCachedOpportunities();
    if (cached.length > 0) {
      return cached
        .filter((opp) => !isMockListingExpired(opp))
        .map((item) => recomputeEnrichedForProfile(item, profile));
    }

    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await this.syncOpportunitiesToLocalCache();
      } catch {
        if (API_CONFIG.dataMode === 'api') throw new Error('Backend API unreachable');
      }
    }
    return localStore
      .getAllOpportunities()
      .filter((opp) => !isMockListingExpired(opp))
      .map(buildEnrichedOpportunity);
  },

  async getOpportunityById(opportunityId: string): Promise<EnrichedOpportunity> {
    const profile = localStore.getProfile();
    const cached = localStore.getCachedOpportunities();
    const cachedItem = cached.find((item) => item.id === opportunityId);
    if (cachedItem) {
      return recomputeEnrichedForProfile(cachedItem, profile);
    }

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
        const created = await apiRequest<EnrichedOpportunity>('/opportunities', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        const existing = localStore.getCachedOpportunities();
        localStore.saveCachedOpportunities([
          created,
          ...existing.filter((o) => o.id !== created.id),
        ]);
        return created;
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

    const built = buildEnrichedOpportunity(opportunity);
    const cached = localStore.getCachedOpportunities();
    if (cached.length > 0) {
      localStore.saveCachedOpportunities([
        built,
        ...cached.filter((o) => o.id !== built.id),
      ]);
    }
    return built;
  },

  async extractJobFromUrl(url: string): Promise<{
    title: string;
    organizationName: string;
    officialWebsite: string | null;
    opportunityType: Opportunity['opportunityType'];
    roleCategory: Opportunity['roleCategory'];
    domain: Opportunity['domain'];
    location: string;
    workMode: Opportunity['workMode'];
    compensationMin: number | null;
    compensationCurrency: 'INR' | 'USD' | 'EUR';
    compensationPeriod: Opportunity['compensationPeriod'];
    duration: string;
    deadline: string | null;
    applicationUrl: string;
    sourceName: string;
    description: string;
    partialExtraction: boolean;
    extractionNotice: string;
  }> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest('/opportunities/extract-url', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    // Local URL slug parser fallback when backend is offline or in test mode
    let host = '';
    let path = '';
    try {
      const parsed = new URL(url.trim());
      host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    } catch {
      // ignore invalid URL
    }

    const sourceName = host.includes('linkedin.com')
      ? 'LinkedIn'
      : host.includes('internshala.com')
        ? 'Internshala'
        : host.includes('indeed.')
          ? 'Indeed'
          : host.includes('wellfound.com')
            ? 'Wellfound'
            : host.includes('greenhouse.io')
              ? 'Greenhouse'
              : host.includes('lever.co')
                ? 'Lever'
                : host.includes('ashbyhq.com')
                  ? 'Ashby'
                  : host || 'Company Website';

    let title = '';
    let organizationName = '';
    let location = 'Remote';

    if (sourceName === 'LinkedIn' && path.includes('jobs/view/')) {
      const slug = path.split('jobs/view/').pop()?.replace(/-\d+$/, '') ?? '';
      const m = slug.match(/^(.+?)-at-(.+)$/i);
      if (m) {
        title = m[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        organizationName = m[2]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }
    } else if (sourceName === 'Internshala' && path.includes('detail/')) {
      const slug = path.split('detail/').pop()?.replace(/\d+$/, '').replace(/-+$/, '') ?? '';
      const m = slug.match(/^(.+?)-in-(.+?)-at-(.+)$/i);
      if (m) {
        title = m[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        location = m[2].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        organizationName = m[3]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    return {
      title,
      organizationName,
      officialWebsite: null,
      opportunityType: 'internship',
      roleCategory: 'software_engineering',
      domain: 'Developer Tools & Cloud',
      location,
      workMode: location.toLowerCase().includes('remote') ? 'remote' : 'hybrid',
      compensationMin: null,
      compensationCurrency: 'INR',
      compensationPeriod: 'monthly',
      duration: '6 months',
      deadline: null,
      applicationUrl: url.trim(),
      sourceName,
      description: '',
      partialExtraction: true,
      extractionNotice: `Detected ${sourceName} link. Please review or paste the job description below to complete the scam & skill check.`,
    };
  },

  async fetchLivePublicJobs(
    query?: string,
    limit = 50,
    triggerSource: 'manual' | 'profile_save' | 'stale_login' = 'manual'
  ): Promise<LiveFetchResponse> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const res = await apiRequest<LiveFetchResponse>('/ingestion/fetch-for-profile', {
          method: 'POST',
          body: JSON.stringify({ query: query || null, limit, triggerSource }),
        });
        if (res.triggered) {
          try {
            await this.syncOpportunitiesToLocalCache();
          } catch {
            // Keep existing local cache if follow-up sync fails transiently
          }
        }
        return res;
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    const { allowed, quota } = localStore.consumeFetchQuota();
    const nativeCountry = localStore.getProfile().nativeCountry || 'India';
    if (!allowed) {
      return {
        triggered: false,
        rateLimited: true,
        triggerSource,
        nativeCountry,
        nativeCount: 0,
        worldwideCount: 0,
        reason: 'Daily limit of 2 job fetch triggers reached. Existing shared listings remain searchable.',
        triggersUsedToday: quota.triggersUsedToday,
        triggersRemainingToday: quota.triggersRemainingToday,
        maxTriggersPerDay: quota.maxTriggersPerDay,
        lastJobFetchAt: quota.lastJobFetchAt,
      };
    }
    return {
      triggered: true,
      rateLimited: false,
      triggerSource,
      query: query || 'software',
      nativeCountry,
      nativeCount: 30,
      worldwideCount: 20,
      sourcesQueried: [
        'Tier-1 India Career Portals',
        'Tier-1 Worldwide Career Portals',
        'Internshala Public Category Feed',
        'Arbeitnow Public API',
        'The Muse Public API',
        'Remotive Public API',
      ],
      warnings: ['Live outbound HTTP job fetching runs when the FastAPI backend is connected.'],
      report: {
        newOpportunitiesCreated: 0,
        crossSourceDuplicatesMerged: 0,
        skippedExpired: 0,
        totalProcessed: 0,
      },
      triggersUsedToday: quota.triggersUsedToday,
      triggersRemainingToday: quota.triggersRemainingToday,
      maxTriggersPerDay: quota.maxTriggersPerDay,
      lastJobFetchAt: quota.lastJobFetchAt,
    };
  },
};

