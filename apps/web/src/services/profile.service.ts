import { API_CONFIG, apiRequest } from './api-client';
import { opportunitiesService } from './opportunities.service';
import { localStore } from '@/lib/storage';
import type {
  CareerProfile,
  DomainCategory,
  ProfileExtractionResult,
  RoleCategory,
  SkillSourceType,
  UserSkill,
} from '@/types/domain';

const LOCAL_SKILL_CATALOG: {
  name: string;
  category: UserSkill['category'];
  pattern: RegExp;
}[] = [
  { name: 'Python', category: 'language', pattern: /\bpython\b/i },
  { name: 'TypeScript', category: 'language', pattern: /\btypescript\b/i },
  { name: 'JavaScript', category: 'language', pattern: /\bjavascript\b/i },
  { name: 'Go', category: 'language', pattern: /\bgolang\b|\bin go\b/i },
  { name: 'Rust', category: 'language', pattern: /\brust\b/i },
  { name: 'C++', category: 'language', pattern: /\bc\+\+\b|\bcpp\b/i },
  { name: 'Java', category: 'language', pattern: /\bjava\b(?!script)/i },
  { name: 'SQL', category: 'language', pattern: /\bsql\b/i },
  { name: 'React', category: 'framework', pattern: /\breact(?:\.js|js)?\b/i },
  { name: 'FastAPI', category: 'framework', pattern: /\bfastapi\b/i },
  { name: 'PostgreSQL', category: 'systems', pattern: /\bpostgresql\b|\bpostgres\b/i },
  { name: 'Docker', category: 'tooling', pattern: /\bdocker\b/i },
  { name: 'Kubernetes', category: 'systems', pattern: /\bkubernetes\b|\bk8s\b/i },
  { name: 'PyTorch', category: 'data_ml', pattern: /\bpytorch\b/i },
  { name: 'Machine Learning', category: 'data_ml', pattern: /\bmachine\s+learning\b/i },
  { name: 'Distributed Systems', category: 'systems', pattern: /\bdistributed\s+systems\b/i },
  { name: 'Git', category: 'tooling', pattern: /\bgit\b/i },
];

function extractLocally(
  rawText: string,
  sourceType: SkillSourceType,
  sourceReference: string,
  links?: { linkedinUrl?: string; portfolioUrl?: string }
): ProfileExtractionResult {
  const skills: UserSkill[] = [];
  for (let i = 0; i < LOCAL_SKILL_CATALOG.length; i += 1) {
    const entry = LOCAL_SKILL_CATALOG[i];
    if (entry.pattern.test(rawText)) {
      skills.push({
        id: `sk_${sourceType}_${i}_${entry.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        canonicalName: entry.name,
        category: entry.category,
        proficiency: 'intermediate',
        yearsExperience: 1,
        sourceType,
        sourceReference,
      });
    }
  }

  const lower = rawText.toLowerCase();
  const preferredRoles: RoleCategory[] = [];
  const preferredDomains: DomainCategory[] = [];
  if (/\b(?:pytorch|machine learning|ai|llm|rag)\b/i.test(lower)) {
    preferredRoles.push('machine_learning');
    preferredDomains.push('AI & Machine Learning');
  }
  if (/\b(?:sql|pandas|data engineer|analytics)\b/i.test(lower)) {
    preferredRoles.push('data_science');
    preferredDomains.push('Data Engineering');
  }
  if (/\b(?:kubernetes|docker|distributed systems|rust|golang|linux)\b/i.test(lower)) {
    preferredRoles.push('systems_infrastructure');
    preferredDomains.push('Developer Tools & Cloud');
  }
  if (/\b(?:security|appsec|cybersecurity)\b/i.test(lower)) {
    preferredRoles.push('security');
    preferredDomains.push('Cybersecurity');
  }
  if (preferredRoles.length === 0) preferredRoles.push('software_engineering');
  if (preferredDomains.length === 0) preferredDomains.push('Developer Tools & Cloud');

  return {
    educationLevel: /\b(?:master|m\.sc|m\.tech|ms )\b/i.test(lower) ? 'masters' : 'undergraduate',
    fieldOfStudy: /\b(?:ai|machine learning|data science)\b/i.test(lower)
      ? 'AI & Data Science'
      : 'Computer Science & Engineering',
    institution: 'University',
    graduationYear: 2027,
    preferredRoles,
    preferredDomains,
    linkedinUrl: links?.linkedinUrl || null,
    portfolioUrl: links?.portfolioUrl || null,
    skills,
    projects:
      skills.length > 0
        ? [
            {
              id: `proj_${sourceType}_1`,
              title: `${sourceReference} Highlights`,
              description: rawText.slice(0, 220) || 'Imported technical experience.',
              technologiesUsed: skills.slice(0, 6).map((s) => s.canonicalName),
            },
          ]
        : [],
    careerInterestsSummary: `Targeting ${preferredDomains[0]} opportunities using ${
      skills.slice(0, 4).map((s) => s.canonicalName).join(', ') || 'Computer Science fundamentals'
    }.`,
    extractionNotice: `Extracted ${skills.length} skill(s) from ${sourceReference}.`,
  };
}

export const profileService = {
  async getProfile(): Promise<CareerProfile> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const serverProfile = await apiRequest<CareerProfile>('/profile');
        localStore.saveProfile(serverProfile);
        return serverProfile;
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    return localStore.getProfile();
  },

  async updateProfile(profile: CareerProfile): Promise<CareerProfile> {
    const previousLocal = localStore.getProfile();
    const needsInitialCatalogSync =
      !previousLocal.onboardingCompleted || localStore.getCachedOpportunities().length === 0;

    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const saved = await apiRequest<CareerProfile>('/profile', {
          method: 'PUT',
          body: JSON.stringify(profile),
        });
        localStore.saveProfile(saved);
        if (needsInitialCatalogSync) {
          try {
            await opportunitiesService.syncOpportunitiesToLocalCache();
          } catch {
            // Keep UI functional even if sync fails
          }
        }
        return saved;
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    if (localStore.getFetchQuotaState().triggersRemainingToday > 0) {
      localStore.consumeFetchQuota();
    }
    localStore.saveProfile({
      ...profile,
      onboardingCompleted: true,
    });
    const session = localStore.getAuthSession();
    if (session) {
      localStore.saveAuthSession({ ...session, onboardingRequired: false });
    }
    return localStore.getProfile();
  },

  async extractFromResume(input: {
    text?: string;
    filename?: string;
    fileBase64?: string;
  }): Promise<ProfileExtractionResult> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<ProfileExtractionResult>('/profile/extract-resume', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    let decoded = input.text || '';
    if (!decoded && input.fileBase64) {
      try {
        const rawB64 = input.fileBase64.split(',').pop() || '';
        decoded = atob(rawB64);
      } catch {
        decoded = '';
      }
    }
    return extractLocally(
      decoded,
      'resume',
      input.filename ? `Resume (${input.filename})` : 'Resume Text'
    );
  },

  async extractFromSources(input: {
    linkedinUrl?: string;
    portfolioUrl?: string;
    githubUrl?: string;
    pastedText?: string;
  }): Promise<ProfileExtractionResult> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<ProfileExtractionResult>('/profile/extract-sources', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    const blob = [input.pastedText || '', input.linkedinUrl || '', input.portfolioUrl || '']
      .join(' ')
      .trim();
    const srcType: SkillSourceType = input.linkedinUrl ? 'linkedin' : 'portfolio';
    const srcLabel = input.linkedinUrl && input.portfolioUrl
      ? 'LinkedIn & Portfolio'
      : input.linkedinUrl
        ? 'LinkedIn Profile'
        : 'Portfolio Website';
    return extractLocally(blob, srcType, srcLabel, {
      linkedinUrl: input.linkedinUrl,
      portfolioUrl: input.portfolioUrl,
    });
  },
};
