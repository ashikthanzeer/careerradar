import { describe, expect, it } from 'vitest';
import { evaluateOpportunityTrust } from '@/lib/trust-engine';
import type { Opportunity, Organization } from '@/types/domain';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org_test',
    name: 'Cloudflare',
    normalizedName: 'cloudflare',
    officialWebsite: 'https://cloudflare.com',
    description: 'Cloud infrastructure provider.',
    recruiterEmailDomain: 'cloudflare.com',
    verificationMetadata: {
      domainVerified: true,
      hasPublicEngineeringFootprint: true,
      knownEntity: true,
      notes: 'Verified domain.',
    },
    ...overrides,
  };
}

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp_test',
    organizationId: 'org_test',
    title: 'Software Engineering Intern',
    normalizedTitle: 'software engineering intern',
    description:
      'Join our distributed systems engineering team to build reliable backend services in Rust, Python, and Go. Write integration tests in Docker and PostgreSQL on Linux and collaborate via Git.',
    opportunityType: 'internship',
    roleCategory: 'software_engineering',
    domain: 'Developer Tools & Cloud',
    location: 'Remote',
    workMode: 'remote',
    compensationMin: 70000,
    compensationMax: 80000,
    compensationCurrency: 'INR',
    compensationPeriod: 'monthly',
    duration: '6 months',
    postedAt: '2026-11-15T10:00:00Z',
    deadline: '2026-12-20T23:59:59Z',
    applicationUrl: 'https://boards.greenhouse.io/cloudflare/jobs/101',
    recruiterContactEmail: 'internships@cloudflare.com',
    status: 'open',
    firstSeenAt: '2026-11-15T10:00:00Z',
    lastSeenAt: '2026-11-17T10:00:00Z',
    createdAt: '2026-11-15T10:00:00Z',
    updatedAt: '2026-11-17T10:00:00Z',
    isSampleData: false,
    ...overrides,
  };
}

describe('Trust & Verification Engine (evaluateOpportunityTrust)', () => {
  it('evaluates verified engineering listing as no_major_warnings with positive domain evidence', () => {
    const opp = makeOpp();
    const org = makeOrg();

    const result = evaluateOpportunityTrust(opp, org);

    expect(result.overallLabel).toBe('no_major_warnings');
    expect(
      result.evidence.some((e) => e.indicatorCode === 'OFFICIAL_DOMAIN_ALIGNED')
    ).toBe(true);
    expect(result.limitations).toContain('not a guarantee of legitimacy');
  });

  it('flags upfront registration/training fee listings as elevated_risk with FEE_REQUIRED evidence', () => {
    const scamOpp = makeOpp({
      description:
        'Direct selection with no interview required! Selected students must pay a mandatory registration fee of ₹1,999 for training and certificate.',
      applicationUrl: 'https://forms.gle/scam-intake',
      recruiterContactEmail: 'hr.desk@gmail.com',
    });
    const scamOrg = makeOrg({
      name: 'Unverified Portal',
      officialWebsite: null,
      recruiterEmailDomain: 'gmail.com',
      verificationMetadata: {
        domainVerified: false,
        hasPublicEngineeringFootprint: false,
        knownEntity: false,
        notes: '',
      },
    });

    const result = evaluateOpportunityTrust(scamOpp, scamOrg);

    expect(result.overallLabel).toBe('elevated_risk');
    const feeEvidence = result.evidence.find(
      (e) => e.indicatorCode === 'FEE_REQUIRED'
    );
    expect(feeEvidence).toBeDefined();
    expect(feeEvidence?.severity).toBe('high');
  });

  it('flags brand impersonation when a known company name is paired with free webmail', () => {
    const impOpp = makeOpp({
      description:
        'Urgent campus drive with direct selection! Complete the refundable security deposit fee of ₹3,500 via Telegram.',
      applicationUrl: 'https://t.me/fake_campus_bot',
      recruiterContactEmail: 'cloudflare.campus.hr@outlook.com',
    });
    const impOrg = makeOrg({
      recruiterEmailDomain: 'outlook.com',
    });

    const result = evaluateOpportunityTrust(impOpp, impOrg);

    expect(result.overallLabel).toBe('elevated_risk');
    expect(
      result.evidence.some((e) => e.indicatorCode === 'BRAND_IMPERSONATION_RISK')
    ).toBe(true);
    expect(
      result.evidence.some((e) => e.indicatorCode === 'FEE_REQUIRED')
    ).toBe(true);
  });

  it('flags early-stage startup using Google Forms and Gmail as verification_required', () => {
    const startupOpp = makeOpp({
      applicationUrl: 'https://docs.google.com/forms/d/e/startup-intake',
      recruiterContactEmail: 'seedstartup.hiring@gmail.com',
    });
    const startupOrg = makeOrg({
      name: 'SeedStartup Labs',
      officialWebsite: 'https://seedstartup.io',
      recruiterEmailDomain: 'gmail.com',
      verificationMetadata: {
        domainVerified: true,
        hasPublicEngineeringFootprint: false,
        knownEntity: false,
        notes: '',
      },
    });

    const result = evaluateOpportunityTrust(startupOpp, startupOrg);

    expect(result.overallLabel).toBe('verification_required');
    expect(
      result.evidence.some((e) => e.indicatorCode === 'UNRELATED_APPLICATION_URL')
    ).toBe(true);
    expect(
      result.evidence.some((e) => e.indicatorCode === 'SUSPICIOUS_RECRUITER_EMAIL')
    ).toBe(true);
  });
});
