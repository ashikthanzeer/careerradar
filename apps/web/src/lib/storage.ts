import { createBlankCareerProfile } from './sample-data';
import type {
  ApplicationRecord,
  CareerProfile,
  EnrichedOpportunity,
  Opportunity,
  OpportunityAnalysis,
  OpportunitySkillRequirement,
  OpportunitySource,
  Organization,
  SavedOpportunity,
} from '@/types/domain';

const STORAGE_VERSION = 'careerradar_prod_v2';
const LEGACY_STORAGE_VERSION = 'careerradar_prod_v1';

export interface StoredAuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    provider: 'google';
    avatarUrl?: string | null;
    createdAt: string;
  };
  onboardingRequired?: boolean;
  staleLoginFetchTriggered?: boolean;
}

export interface LocalFetchQuota {
  fetchDateUtc: string;
  triggersUsedToday: number;
  triggersRemainingToday: number;
  maxTriggersPerDay: number;
  lastJobFetchAt: string | null;
}

const MAX_TRIGGERS_PER_DAY = 2;

const KEYS = {
  authSession: `${STORAGE_VERSION}_auth_session`,
  profile: (userId: string) => `${STORAGE_VERSION}_profile_${userId}`,
  saved: (userId: string) => `${STORAGE_VERSION}_saved_${userId}`,
  applications: (userId: string) => `${STORAGE_VERSION}_applications_${userId}`,
  fetchQuota: (userId: string) => `${STORAGE_VERSION}_fetch_quota_${userId}`,
  customOpportunities: `${STORAGE_VERSION}_opportunities`,
  customOrganizations: `${STORAGE_VERSION}_organizations`,
  customSources: `${STORAGE_VERSION}_sources`,
  customSkills: `${STORAGE_VERSION}_skills`,
  customAnalyses: `${STORAGE_VERSION}_analyses`,
  cachedEnrichedOpportunities: `${STORAGE_VERSION}_cached_enriched_opportunities`,
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function currentUserId(): string {
  const session = readJson<StoredAuthSession | null>(KEYS.authSession, null);
  return session?.user.id ?? 'usr_local';
}

function currentDisplayName(): string {
  const session = readJson<StoredAuthSession | null>(KEYS.authSession, null);
  return session?.user.displayName ?? 'Jobseeker';
}

export const localStore = {
  getAuthSession(): StoredAuthSession | null {
    const current = readJson<StoredAuthSession | null>(KEYS.authSession, null);
    if (typeof window !== 'undefined') {
      const legacyAuthKey = `${LEGACY_STORAGE_VERSION}_auth_session`;
      const legacyCacheKey = `${LEGACY_STORAGE_VERSION}_cached_enriched_opportunities`;
      const legacyOppsKey = `${LEGACY_STORAGE_VERSION}_opportunities`;
      if (!current) {
        const legacySession = readJson<StoredAuthSession | null>(legacyAuthKey, null);
        if (legacySession) {
          writeJson(KEYS.authSession, legacySession);
          try {
            window.localStorage.removeItem(legacyAuthKey);
            window.localStorage.removeItem(legacyCacheKey);
            window.localStorage.removeItem(legacyOppsKey);
          } catch {
            // ignore storage errors
          }
          return legacySession;
        }
      } else {
        try {
          window.localStorage.removeItem(legacyCacheKey);
          window.localStorage.removeItem(legacyOppsKey);
        } catch {
          // ignore storage errors
        }
      }
    }
    return current;
  },

  saveAuthSession(session: StoredAuthSession | null): void {
    if (typeof window === 'undefined') return;
    if (!session) {
      window.localStorage.removeItem(KEYS.authSession);
    } else {
      writeJson(KEYS.authSession, session);
    }
  },

  getFetchQuotaState(): LocalFetchQuota {
    const uid = currentUserId();
    const today = new Date().toISOString().slice(0, 10);
    const stored = readJson<LocalFetchQuota | null>(KEYS.fetchQuota(uid), null);
    if (!stored || stored.fetchDateUtc !== today) {
      return {
        fetchDateUtc: today,
        triggersUsedToday: 0,
        triggersRemainingToday: MAX_TRIGGERS_PER_DAY,
        maxTriggersPerDay: MAX_TRIGGERS_PER_DAY,
        lastJobFetchAt: stored?.lastJobFetchAt ?? null,
      };
    }
    return {
      ...stored,
      triggersRemainingToday: Math.max(0, MAX_TRIGGERS_PER_DAY - stored.triggersUsedToday),
      maxTriggersPerDay: MAX_TRIGGERS_PER_DAY,
    };
  },

  consumeFetchQuota(): { allowed: boolean; quota: LocalFetchQuota } {
    const uid = currentUserId();
    const current = this.getFetchQuotaState();
    if (current.triggersRemainingToday <= 0) {
      return { allowed: false, quota: current };
    }
    const nextUsed = current.triggersUsedToday + 1;
    const updated: LocalFetchQuota = {
      fetchDateUtc: current.fetchDateUtc,
      triggersUsedToday: nextUsed,
      triggersRemainingToday: Math.max(0, MAX_TRIGGERS_PER_DAY - nextUsed),
      maxTriggersPerDay: MAX_TRIGGERS_PER_DAY,
      lastJobFetchAt: new Date().toISOString(),
    };
    writeJson(KEYS.fetchQuota(uid), updated);
    return { allowed: true, quota: updated };
  },

  getProfile(): CareerProfile {
    const uid = currentUserId();
    const profile = readJson<CareerProfile>(
      KEYS.profile(uid),
      createBlankCareerProfile(uid, currentDisplayName())
    );
    const quota = this.getFetchQuotaState();
    return {
      onboardingCompleted: false,
      ...profile,
      triggersUsedToday: quota.triggersUsedToday,
      triggersRemainingToday: quota.triggersRemainingToday,
      maxTriggersPerDay: quota.maxTriggersPerDay,
      lastJobFetchAt: quota.lastJobFetchAt,
    };
  },

  saveProfile(profile: CareerProfile): CareerProfile {
    const uid = currentUserId();
    const updated = { ...profile, userId: uid, updatedAt: new Date().toISOString() };
    writeJson(KEYS.profile(uid), updated);
    return updated;
  },

  getSavedOpportunities(): SavedOpportunity[] {
    return readJson<SavedOpportunity[]>(KEYS.saved(currentUserId()), []);
  },

  saveSavedOpportunities(items: SavedOpportunity[]): void {
    writeJson(KEYS.saved(currentUserId()), items);
  },

  getApplications(): ApplicationRecord[] {
    return readJson<ApplicationRecord[]>(KEYS.applications(currentUserId()), []);
  },

  saveApplications(items: ApplicationRecord[]): void {
    writeJson(KEYS.applications(currentUserId()), items);
  },

  getAllOpportunities(): Opportunity[] {
    return readJson<Opportunity[]>(KEYS.customOpportunities, []);
  },

  getAllOrganizations(): Record<string, Organization> {
    return readJson<Record<string, Organization>>(KEYS.customOrganizations, {});
  },

  getAllSources(): Record<string, OpportunitySource[]> {
    return readJson<Record<string, OpportunitySource[]>>(KEYS.customSources, {});
  },

  getAllOpportunitySkills(): Record<string, OpportunitySkillRequirement[]> {
    return readJson<Record<string, OpportunitySkillRequirement[]>>(
      KEYS.customSkills,
      {}
    );
  },

  getAllAnalyses(): Record<string, OpportunityAnalysis> {
    return readJson<Record<string, OpportunityAnalysis>>(KEYS.customAnalyses, {});
  },

  getCachedOpportunities(): EnrichedOpportunity[] {
    return readJson<EnrichedOpportunity[]>(KEYS.cachedEnrichedOpportunities, []);
  },

  saveCachedOpportunities(items: EnrichedOpportunity[]): void {
    writeJson(KEYS.cachedEnrichedOpportunities, items);
  },

  clearCachedOpportunities(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(KEYS.cachedEnrichedOpportunities);
    } catch {
      // ignore storage errors
    }
  },

  removeCachedOpportunity(opportunityId: string): void {
    const existing = this.getCachedOpportunities();
    const filtered = existing.filter((item) => item.id !== opportunityId);
    if (filtered.length !== existing.length) {
      this.saveCachedOpportunities(filtered);
    }
  },

  addCustomOpportunityBundle(bundle: {
    opportunity: Opportunity;
    organization: Organization;
    source: OpportunitySource;
    skills: OpportunitySkillRequirement[];
    analysis: OpportunityAnalysis;
  }): void {
    const customOpps = readJson<Opportunity[]>(KEYS.customOpportunities, []);
    writeJson(KEYS.customOpportunities, [bundle.opportunity, ...customOpps]);

    const customOrgs = readJson<Record<string, Organization>>(
      KEYS.customOrganizations,
      {}
    );
    customOrgs[bundle.organization.id] = bundle.organization;
    writeJson(KEYS.customOrganizations, customOrgs);

    const customSources = readJson<Record<string, OpportunitySource[]>>(
      KEYS.customSources,
      {}
    );
    customSources[bundle.opportunity.id] = [bundle.source];
    writeJson(KEYS.customSources, customSources);

    const customSkills = readJson<Record<string, OpportunitySkillRequirement[]>>(
      KEYS.customSkills,
      {}
    );
    customSkills[bundle.opportunity.id] = bundle.skills;
    writeJson(KEYS.customSkills, customSkills);

    const customAnalyses = readJson<Record<string, OpportunityAnalysis>>(
      KEYS.customAnalyses,
      {}
    );
    customAnalyses[bundle.opportunity.id] = bundle.analysis;
    writeJson(KEYS.customAnalyses, customAnalyses);
  },

  resetAllToDefaults(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.clear();
  },
};
