import { createBlankCareerProfile } from './sample-data';
import type {
  ApplicationRecord,
  CareerProfile,
  Opportunity,
  OpportunityAnalysis,
  OpportunitySkillRequirement,
  OpportunitySource,
  Organization,
  SavedOpportunity,
} from '@/types/domain';

const STORAGE_VERSION = 'careerradar_prod_v1';

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
}

const KEYS = {
  authSession: `${STORAGE_VERSION}_auth_session`,
  profile: (userId: string) => `${STORAGE_VERSION}_profile_${userId}`,
  saved: (userId: string) => `${STORAGE_VERSION}_saved_${userId}`,
  applications: (userId: string) => `${STORAGE_VERSION}_applications_${userId}`,
  customOpportunities: `${STORAGE_VERSION}_opportunities`,
  customOrganizations: `${STORAGE_VERSION}_organizations`,
  customSources: `${STORAGE_VERSION}_sources`,
  customSkills: `${STORAGE_VERSION}_skills`,
  customAnalyses: `${STORAGE_VERSION}_analyses`,
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
    return readJson<StoredAuthSession | null>(KEYS.authSession, null);
  },

  saveAuthSession(session: StoredAuthSession | null): void {
    if (typeof window === 'undefined') return;
    if (!session) {
      window.localStorage.removeItem(KEYS.authSession);
    } else {
      writeJson(KEYS.authSession, session);
    }
  },

  getProfile(): CareerProfile {
    const uid = currentUserId();
    return readJson<CareerProfile>(
      KEYS.profile(uid),
      createBlankCareerProfile(uid, currentDisplayName())
    );
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
