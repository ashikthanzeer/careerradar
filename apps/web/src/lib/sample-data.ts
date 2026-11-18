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

/**
 * Production baseline: Zero hardcoded dummy opportunities, fake companies, or fake personas.
 * Users sign in with Google, LinkedIn, or GitHub and add or sync real job opportunities.
 */
export function createBlankCareerProfile(
  userId = 'usr_local',
  displayName = 'Jobseeker'
): CareerProfile {
  return {
    id: `profile_${userId}`,
    userId,
    displayName,
    educationLevel: 'undergraduate',
    fieldOfStudy: 'Computer Science',
    institution: 'University',
    graduationYear: 2027,
    preferredRoles: ['software_engineering'],
    preferredDomains: ['Developer Tools & Cloud'],
    preferredLocations: ['Remote'],
    nativeCountry: 'India',
    workModes: ['remote', 'hybrid', 'onsite'],
    preferredDuration: '3 to 6 months',
    minimumMonthlyStipendINR: 0,
    careerInterestsSummary: '',
    projects: [],
    skills: [],
    updatedAt: new Date().toISOString(),
  };
}

export const DEFAULT_CAREER_PROFILE: CareerProfile = createBlankCareerProfile();
export const SAMPLE_ORGANIZATIONS: Record<string, Organization> = {};
export const SAMPLE_OPPORTUNITIES: Opportunity[] = [];
export const SAMPLE_SOURCES: Record<string, OpportunitySource[]> = {};
export const SAMPLE_OPPORTUNITY_SKILLS: Record<string, OpportunitySkillRequirement[]> = {};
export const SAMPLE_ANALYSES: Record<string, OpportunityAnalysis> = {};
export const INITIAL_SAVED_OPPORTUNITIES: SavedOpportunity[] = [];
export const INITIAL_APPLICATIONS: ApplicationRecord[] = [];
