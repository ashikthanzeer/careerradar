import type {
  Opportunity,
  Organization,
  TrustAssessment,
  TrustEvidence,
  TrustLabel,
} from '@/types/domain';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'proton.me',
  'protonmail.com',
  'rediffmail.com',
  'aol.com',
]);

const RECOGNIZED_ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workday.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'workatastartup.com',
  'summerofcode.withgoogle.com',
  'lfx.linuxfoundation.org',
];

const EXTERNAL_FORM_DOMAINS = [
  'docs.google.com',
  'forms.gle',
  'bit.ly',
  'tinyurl.com',
  't.me',
  'wa.me',
  'airtable.com',
];

const FEE_PATTERNS = [
  /\b(registration|training|onboarding|security|certificate|processing|admin|enrollment)\s+(fee|deposit|charge|payment|amount)\b/i,
  /\bpay\s+(?:₹|rs\.?|inr|\$)?\s*\d+/i,
  /\brefundable\s+(deposit|fee)\b/i,
  /\bmandatory\s+(training|certification)\s+cost\b/i,
];

const CREDENTIAL_PATTERNS = [
  /\b(bank\s+account\s+password|netbanking\s+login|upi\s+pin|seed\s+phrase|private\s+key|credit\s+card\s+cvv|ssn)\b/i,
  /\b(aadhaar\s+otp|submit\s+original\s+passport|login\s+credentials)\b/i,
];

function extractHostname(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Deterministic, evidence-based Trust & Risk Assessment Engine.
 * Complies with PRD §6.3 and AGENTS.md §7.4:
 * - Never declares an organization definitively legitimate or fraudulent without observable evidence.
 * - Distinguishes between deterministic rules, verified facts, and heuristic indicators.
 * - Explicitly states assessment limitations and recommended verification steps.
 */
export function evaluateOpportunityTrust(
  opportunity: Opportunity,
  organization: Organization
): TrustAssessment {
  const assessmentId = `trust_${opportunity.id}`;
  const evidence: TrustEvidence[] = [];
  const textCorpus = `${opportunity.title}\n${opportunity.description}`;

  // 1. Check for upfront fee / payment requirements (High Severity)
  for (const pattern of FEE_PATTERNS) {
    const match = textCorpus.match(pattern);
    if (match) {
      evidence.push({
        id: `${assessmentId}_ev_fee`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'FEE_REQUIRED',
        severity: 'high',
        description:
          'Listing text references a registration, training, certificate, or security deposit fee.',
        evidenceType: 'deterministic_rule',
        evidenceReference: `Matched phrase in description: "${match[0]}"`,
        confidence: 0.96,
      });
      break;
    }
  }

  // 2. Check for sensitive credential or financial harvesting (High Severity)
  for (const pattern of CREDENTIAL_PATTERNS) {
    const match = textCorpus.match(pattern);
    if (match) {
      evidence.push({
        id: `${assessmentId}_ev_cred`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'CREDENTIAL_HARVESTING',
        severity: 'high',
        description:
          'Listing requests sensitive authentication credentials, banking PINs, or identity OTPs.',
        evidenceType: 'deterministic_rule',
        evidenceReference: `Matched phrase in description: "${match[0]}"`,
        confidence: 0.98,
      });
      break;
    }
  }

  // 3. Domain & Recruiter Email Analysis
  const officialHost = extractHostname(organization.officialWebsite);
  const appHost = extractHostname(opportunity.applicationUrl);
  const recruiterDomain = opportunity.recruiterContactEmail
    ? opportunity.recruiterContactEmail.split('@')[1]?.toLowerCase() ?? null
    : organization.recruiterEmailDomain?.toLowerCase() ?? null;

  if (recruiterDomain && FREE_EMAIL_DOMAINS.has(recruiterDomain)) {
    const isImpersonatingKnownBrand =
      organization.verificationMetadata.knownEntity &&
      officialHost &&
      !recruiterDomain.includes(officialHost);

    if (isImpersonatingKnownBrand) {
      evidence.push({
        id: `${assessmentId}_ev_impersonation`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'BRAND_IMPERSONATION_RISK',
        severity: 'high',
        description: `Listing claims affiliation with ${organization.name} (${officialHost}) but uses a free personal email domain (${recruiterDomain}).`,
        evidenceType: 'deterministic_rule',
        evidenceReference: `Recruiter contact: ${opportunity.recruiterContactEmail ?? recruiterDomain} vs. official domain ${officialHost}`,
        confidence: 0.94,
      });
    } else {
      evidence.push({
        id: `${assessmentId}_ev_email`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'SUSPICIOUS_RECRUITER_EMAIL',
        severity: 'medium',
        description: `Recruiter contact uses a free consumer webmail domain (@${recruiterDomain}) rather than an organizational domain.`,
        evidenceType: 'deterministic_rule',
        evidenceReference: `Contact domain: @${recruiterDomain}`,
        confidence: 0.9,
      });
    }
  }

  // 4. Application URL Inspection
  if (appHost) {
    const isExternalForm = EXTERNAL_FORM_DOMAINS.some(
      (d) => appHost === d || appHost.endsWith(`.${d}`)
    );
    const isRecognizedAts = RECOGNIZED_ATS_DOMAINS.some(
      (d) => appHost === d || appHost.endsWith(`.${d}`)
    );
    const matchesOfficialDomain =
      officialHost !== null &&
      (appHost === officialHost || appHost.endsWith(`.${officialHost}`));

    if (isExternalForm) {
      evidence.push({
        id: `${assessmentId}_ev_url`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'UNRELATED_APPLICATION_URL',
        severity: 'medium',
        description:
          'Application links to a generic form or messaging platform rather than an organizational domain or established ATS.',
        evidenceType: 'deterministic_rule',
        evidenceReference: `Application hostname: ${appHost}`,
        confidence: 0.92,
      });
    } else if (matchesOfficialDomain || isRecognizedAts) {
      evidence.push({
        id: `${assessmentId}_ev_domain_ok`,
        trustAssessmentId: assessmentId,
        indicatorCode: 'OFFICIAL_DOMAIN_ALIGNED',
        severity: 'positive',
        description: matchesOfficialDomain
          ? `Application URL resolves directly to the organization's domain (${appHost}).`
          : `Application is hosted on a recognized applicant tracking or programme platform (${appHost}).`,
        evidenceType: 'verified_fact',
        evidenceReference: `Application URL host: ${appHost}`,
        confidence: 0.95,
      });
    }
  }

  // 5. Missing Organizational Web Presence
  if (!organization.officialWebsite) {
    evidence.push({
      id: `${assessmentId}_ev_missing_org`,
      trustAssessmentId: assessmentId,
      indicatorCode: 'MISSING_COMPANY_INFO',
      severity: 'medium',
      description: 'No official organization website is recorded for independent verification.',
      evidenceType: 'deterministic_rule',
      evidenceReference: 'Organization.officialWebsite is null',
      confidence: 1.0,
    });
  }

  // 6. Unrealistic Compensation vs. Requirements Heuristic
  const monthlyStipendINR =
    opportunity.compensationCurrency === 'INR' && opportunity.compensationPeriod === 'monthly'
      ? opportunity.compensationMax ?? opportunity.compensationMin ?? 0
      : 0;
  const noInterviewClaim = /\b(no\s+interview|direct\s+selection|instant\s+offer\s+letter|100%\s+placement\s+guarantee)\b/i.test(
    textCorpus
  );

  if (noInterviewClaim || (monthlyStipendINR >= 150000 && textCorpus.length < 320)) {
    evidence.push({
      id: `${assessmentId}_ev_comp`,
      trustAssessmentId: assessmentId,
      indicatorCode: 'UNREALISTIC_COMPENSATION',
      severity: 'medium',
      description: noInterviewClaim
        ? 'Listing promises instant selection or guaranteed placement without technical evaluation.'
        : 'Unusually high stipend paired with minimal technical role specification.',
      evidenceType: 'heuristic_indicator',
      evidenceReference: noInterviewClaim
        ? 'Matched "instant offer / no interview / placement guarantee" pattern in listing'
        : `Reported stipend ₹${monthlyStipendINR.toLocaleString('en-IN')}/mo with brief description (${textCorpus.length} chars)`,
      confidence: 0.84,
    });
  }

  // 7. Vague Responsibilities / Technical Scope
  const wordCount = opportunity.description.trim().split(/\s+/).length;
  if (wordCount < 15) {
    evidence.push({
      id: `${assessmentId}_ev_vague`,
      trustAssessmentId: assessmentId,
      indicatorCode: 'VAGUE_RESPONSIBILITIES',
      severity: 'medium',
      description:
        'Role description is unusually brief and lacks concrete engineering deliverables or technical stack details.',
      evidenceType: 'heuristic_indicator',
      evidenceReference: `Description length: ${wordCount} words`,
      confidence: 0.85,
    });
  } else {
    evidence.push({
      id: `${assessmentId}_ev_scope_ok`,
      trustAssessmentId: assessmentId,
      indicatorCode: 'CLEAR_TECHNICAL_SCOPE',
      severity: 'positive',
      description:
        'Listing specifies concrete engineering responsibilities, tools, and evaluation expectations.',
      evidenceType: 'heuristic_indicator',
      evidenceReference: `Structured description (${wordCount} words)`,
      confidence: 0.85,
    });
  }

  // Determine overall label deterministically
  const hasHighRisk = evidence.some((e) => e.severity === 'high');
  const mediumRiskCount = evidence.filter((e) => e.severity === 'medium').length;

  let overallLabel: TrustLabel = 'no_major_warnings';
  let assessmentSummary =
    'No high- or medium-severity warning signs were triggered by deterministic checks. Domain and technical scope appear consistent.';

  if (hasHighRisk) {
    overallLabel = 'elevated_risk';
    assessmentSummary =
      'Elevated risk indicators detected. This listing exhibits patterns strongly associated with pay-to-work schemes, credential harvesting, or brand impersonation.';
  } else if (mediumRiskCount >= 2 && !organization.officialWebsite) {
    overallLabel = 'insufficient_information';
    assessmentSummary =
      'Insufficient verifiable organizational metadata. Multiple details (such as official domain and application channel) could not be independently corroborated.';
  } else if (mediumRiskCount >= 1) {
    overallLabel = 'verification_required';
    assessmentSummary =
      'No definitive scam indicators were found, but one or more attributes (such as an external form link, personal email contact, or unverified company footprint) require manual verification before sharing personal data.';
  }

  const recommendedVerificationSteps: string[] = [];
  if (hasHighRisk) {
    recommendedVerificationSteps.push(
      'Do not pay any registration, training, certificate, or security deposit fee under any circumstances.',
      'Do not share banking credentials, government ID numbers, or OTPs.',
      'Cross-check the posting directly on the organization’s official careers page.'
    );
  } else if (overallLabel === 'verification_required' || overallLabel === 'insufficient_information') {
    recommendedVerificationSteps.push(
      'Verify on LinkedIn that current engineers at the organization recognize this internship programme.',
      'Confirm the recruiter email domain matches the company’s primary website domain before submitting identity documents.',
      'Ask for a written breakdown of mentorship structure and stipend disbursement terms during the first interview.'
    );
  } else {
    recommendedVerificationSteps.push(
      'Confirm the URL in your browser matches the official domain or ATS before uploading your resume.',
      'Review recent intern feedback or public repositories to gauge team engineering culture.'
    );
  }

  return {
    id: assessmentId,
    opportunityId: opportunity.id,
    overallLabel,
    assessmentSummary,
    limitations:
      'Automated trust checks inspect observable listing text, domain alignment, and recruiter metadata. Absence of warning signs is not a guarantee of legitimacy, and flagged heuristics do not constitute legal proof of fraud.',
    recommendedVerificationSteps,
    rulesetVersion: 'v1.2.0-deterministic',
    createdAt: opportunity.updatedAt,
    evidence,
  };
}

