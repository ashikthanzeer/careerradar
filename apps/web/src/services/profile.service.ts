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
  // Hardware, Embedded & Core Engineering
  { name: 'Verilog', category: 'language', pattern: /\bverilog\b/i },
  { name: 'VLSI', category: 'systems', pattern: /\bvlsi\b/i },
  { name: 'FPGA', category: 'systems', pattern: /\bfpga\b|\bvivado\b/i },
  { name: 'Embedded Systems', category: 'systems', pattern: /\bembedded\s+systems?\b|\bfirmware\b/i },
  { name: 'MATLAB', category: 'data_ml', pattern: /\bmatlab\b/i },
  { name: 'SolidWorks', category: 'tooling', pattern: /\bsolidworks\b|\bautocad\b|\bansys\b/i },
  { name: 'Robotics', category: 'fundamentals', pattern: /\brobotics\b|\bros2?\b/i },
  // Product Management & UI/UX Design
  { name: 'Figma', category: 'tooling', pattern: /\bfigma\b/i },
  { name: 'UI/UX Design', category: 'fundamentals', pattern: /\bui\/ux\b|\bux\s+design\b|\bproduct\s+design\b/i },
  { name: 'User Research', category: 'fundamentals', pattern: /\buser\s+research\b|\bprototyping\b/i },
  { name: 'Product Management', category: 'fundamentals', pattern: /\bproduct\s+management\b|\bproduct\s+strategy\b/i },
  // Finance, Analytics, Marketing & Science
  { name: 'Financial Modeling', category: 'fundamentals', pattern: /\bfinancial\s+modeling\b|\bvaluation\b|\bdcf\b/i },
  { name: 'Quantitative Analysis', category: 'data_ml', pattern: /\bquantitative\s+analysis\b|\bequity\s+research\b/i },
  { name: 'Tableau', category: 'tooling', pattern: /\btableau\b|\bpower\s*bi\b|\bexcel\b/i },
  { name: 'Digital Marketing', category: 'fundamentals', pattern: /\bdigital\s+marketing\b|\bseo\b|\bgrowth\s+analytics\b/i },
  { name: 'Bioinformatics', category: 'data_ml', pattern: /\bbioinformatics\b|\bbiotechnology\b/i },
];

function decodeOfflinePdfText(rawDecoded: string): string {
  if (!rawDecoded.startsWith('%PDF')) return rawDecoded;
  // Extract literal runs and TJ kerning arrays in client fallback when backend is offline
  const pieces: string[] = [];
  const tjMatches = rawDecoded.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const m of tjMatches) {
    const inner = m[1] || '';
    const joined = Array.from(
      inner.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)|(-?\d+(?:\.\d+)?)/g)
    )
      .map((tok) => {
        if (tok[1] !== undefined) {
          return tok[1].replace(/\\([()\\])/g, '$1');
        }
        if (tok[2] !== undefined && Number(tok[2]) <= -180) {
          return ' ';
        }
        return '';
      })
      .join('');
    if (joined.trim()) pieces.push(joined.trim());
  }
  const litMatches = rawDecoded.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g);
  for (const m of litMatches) {
    if (m[1]?.trim()) pieces.push(m[1].replace(/\\([()\\])/g, '$1').trim());
  }
  return pieces.length > 0 ? pieces.join('\n') : rawDecoded;
}

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
  if (/\b(?:verilog|vlsi|fpga|embedded|firmware|solidworks|autocad|robotics)\b/i.test(lower)) {
    preferredRoles.push('core_engineering');
    preferredDomains.push(
      /\b(?:vlsi|verilog|fpga|embedded|robotics)\b/i.test(lower)
        ? 'Embedded, Robotics & VLSI'
        : 'Mechanical, Civil & Core Engineering'
    );
  }
  if (/\b(?:figma|ui\/ux|ux\s+design|product\s+design|prototyping)\b/i.test(lower)) {
    preferredRoles.push('ui_ux_design');
    preferredDomains.push('UI/UX & Product Design');
  }
  if (/\b(?:product\s+management|product\s+manager|product\s+strategy|roadmapping)\b/i.test(lower)) {
    preferredRoles.push('product_management');
    preferredDomains.push('Product & Strategy');
  }
  if (/\b(?:financial\s+modeling|valuation|quantitative\s+analysis|corporate\s+finance)\b/i.test(lower)) {
    preferredRoles.push('finance_business');
    preferredDomains.push('Quantitative Finance & Consulting');
  }
  if (/\b(?:digital\s+marketing|seo|growth\s+analytics|supply\s+chain)\b/i.test(lower)) {
    preferredRoles.push('marketing_operations');
    preferredDomains.push('Growth, Marketing & Operations');
  }
  if (/\b(?:pytorch|machine learning|ai|llm|rag)\b/i.test(lower)) {
    preferredRoles.push('machine_learning');
    preferredDomains.push('AI & Machine Learning');
  }
  if (/\b(?:sql|pandas|data engineer|analytics|tableau|power\s*bi)\b/i.test(lower)) {
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
  if (/\b(?:bioinformatics|biotechnology)\b/i.test(lower)) {
    preferredRoles.push('research');
    preferredDomains.push('Biotech & Healthcare Tech');
  }
  if (preferredRoles.length === 0) preferredRoles.push('software_engineering');
  if (preferredDomains.length === 0) preferredDomains.push('Developer Tools & Cloud');

  const fieldOfStudy = /\b(?:vlsi|embedded|electrical|electronics)\b/i.test(lower)
    ? 'Electrical & Electronics Engineering'
    : /\b(?:mechanical|robotics|solidworks)\b/i.test(lower)
      ? 'Mechanical & Robotics Engineering'
      : /\b(?:figma|ui\/ux|design)\b/i.test(lower)
        ? 'Design & Human-Computer Interaction'
        : /\b(?:finance|valuation|economics)\b/i.test(lower)
          ? 'Finance & Business Administration'
          : /\b(?:ai|machine learning|data science)\b/i.test(lower)
            ? 'AI & Data Science'
            : 'Computer Science & Engineering';

  return {
    educationLevel: /\b(?:master|m\.sc|m\.tech|mba|ms )\b/i.test(lower) ? 'masters' : 'undergraduate',
    fieldOfStudy,
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
              description: rawText.slice(0, 220) || 'Imported background experience.',
              technologiesUsed: skills.slice(0, 6).map((s) => s.canonicalName),
            },
          ]
        : [],
    careerInterestsSummary: `Targeting ${preferredDomains[0]} opportunities using ${
      skills.slice(0, 4).map((s) => s.canonicalName).join(', ') || fieldOfStudy
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
        decoded = decodeOfflinePdfText(atob(rawB64));
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
