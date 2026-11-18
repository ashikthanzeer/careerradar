import re
from urllib.parse import urlparse
from app.models.entities import Opportunity, Organization, utc_now_iso
from app.modules.intelligence.sanitizer import sanitize_untrusted_listing_text
from app.schemas.api_schemas import TrustAssessmentSchema, TrustEvidenceSchema

FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "proton.me",
    "protonmail.com",
    "rediffmail.com",
    "aol.com",
}

RECOGNIZED_ATS_DOMAINS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workday.com",
    "myworkdayjobs.com",
    "smartrecruiters.com",
    "workatastartup.com",
    "summerofcode.withgoogle.com",
    "lfx.linuxfoundation.org",
)

EXTERNAL_FORM_DOMAINS = (
    "docs.google.com",
    "forms.gle",
    "bit.ly",
    "tinyurl.com",
    "t.me",
    "wa.me",
    "airtable.com",
)

FEE_PATTERNS = [
    re.compile(
        r"\b(registration|training|onboarding|security|certificate|processing|admin|enrollment)\s+(fee|deposit|charge|payment|amount)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bpay\s+(?:₹|rs\.?|inr|\$)?\s*\d+", re.IGNORECASE),
    re.compile(r"\brefundable\s+(deposit|fee)\b", re.IGNORECASE),
    re.compile(r"\bmandatory\s+(training|certification)\s+cost\b", re.IGNORECASE),
]

CREDENTIAL_PATTERNS = [
    re.compile(
        r"\b(bank\s+account\s+password|netbanking\s+login|upi\s+pin|seed\s+phrase|private\s+key|credit\s+card\s+cvv|ssn)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(aadhaar\s+otp|submit\s+original\s+passport|login\s+credentials)\b",
        re.IGNORECASE,
    ),
]


def _extract_hostname(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    try:
        parsed = urlparse(raw_url)
        host = (parsed.hostname or "").lower()
        return host[4:] if host.startswith("www.") else host or None
    except Exception:
        return None


def evaluate_opportunity_trust(
    opportunity: Opportunity, organization: Organization
) -> TrustAssessmentSchema:
    """
    Server-side deterministic Trust & Scam Detection Engine (PRD §6.3, AGENTS.md §7.4).
    - Never allows an LLM to independently declare an organization legitimate or fraudulent.
    - Distinguishes deterministic rules, verified facts, and heuristic indicators.
    - Explicitly states limitations and verification steps.
    """
    assessment_id = f"trust_{opportunity.id}"
    evidence: list[TrustEvidenceSchema] = []
    corpus = f"{opportunity.title}\n{opportunity.description}"

    # 0. Check for adversarial prompt-injection directives embedded in the listing
    sanitization = sanitize_untrusted_listing_text(corpus)
    if sanitization.injection_detected:
        evidence.append(
            TrustEvidenceSchema(
                id=f"{assessment_id}_ev_injection",
                trustAssessmentId=assessment_id,
                indicatorCode="PROMPT_INJECTION_ATTEMPT",
                severity="high",
                description="Listing contains adversarial instructions attempting to override automated evaluation or spoof trust status.",
                evidenceType="deterministic_rule",
                evidenceReference="; ".join(sanitization.matched_patterns),
                confidence=0.99,
            )
        )

    # 1. Upfront fee / deposit checks (High Risk)
    for pattern in FEE_PATTERNS:
        match = pattern.search(corpus)
        if match:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_fee",
                    trustAssessmentId=assessment_id,
                    indicatorCode="FEE_REQUIRED",
                    severity="high",
                    description="Listing text references a registration, training, certificate, or security deposit fee.",
                    evidenceType="deterministic_rule",
                    evidenceReference=f'Matched phrase in description: "{match.group(0)}"',
                    confidence=0.96,
                )
            )
            break

    # 2. Sensitive credential harvesting checks (High Risk)
    for pattern in CREDENTIAL_PATTERNS:
        match = pattern.search(corpus)
        if match:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_cred",
                    trustAssessmentId=assessment_id,
                    indicatorCode="CREDENTIAL_HARVESTING",
                    severity="high",
                    description="Listing requests sensitive authentication credentials, banking PINs, or identity OTPs.",
                    evidenceType="deterministic_rule",
                    evidenceReference=f'Matched phrase in description: "{match.group(0)}"',
                    confidence=0.98,
                )
            )
            break

    # 3. Domain & Recruiter Email Checks
    official_host = _extract_hostname(organization.official_website)
    app_host = _extract_hostname(opportunity.application_url)
    recruiter_domain: str | None = None
    if opportunity.recruiter_contact_email and "@" in opportunity.recruiter_contact_email:
        recruiter_domain = opportunity.recruiter_contact_email.split("@", 1)[1].lower()
    elif organization.recruiter_email_domain:
        recruiter_domain = organization.recruiter_email_domain.lower()

    ver_meta = organization.verification_metadata or {}
    known_entity = bool(ver_meta.get("knownEntity", False))

    if recruiter_domain and recruiter_domain in FREE_EMAIL_DOMAINS:
        is_impersonating = (
            known_entity
            and official_host is not None
            and official_host not in recruiter_domain
        )
        if is_impersonating:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_impersonation",
                    trustAssessmentId=assessment_id,
                    indicatorCode="BRAND_IMPERSONATION_RISK",
                    severity="high",
                    description=f"Listing claims affiliation with {organization.name} ({official_host}) but uses a free personal email domain ({recruiter_domain}).",
                    evidenceType="deterministic_rule",
                    evidenceReference=f"Recruiter contact: {opportunity.recruiter_contact_email or recruiter_domain} vs. official domain {official_host}",
                    confidence=0.94,
                )
            )
        else:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_email",
                    trustAssessmentId=assessment_id,
                    indicatorCode="SUSPICIOUS_RECRUITER_EMAIL",
                    severity="medium",
                    description=f"Recruiter contact uses a free consumer webmail domain (@{recruiter_domain}) rather than an organizational domain.",
                    evidenceType="deterministic_rule",
                    evidenceReference=f"Contact domain: @{recruiter_domain}",
                    confidence=0.90,
                )
            )

    # 4. Application URL Inspection
    if app_host:
        is_external_form = any(
            app_host == d or app_host.endswith(f".{d}") for d in EXTERNAL_FORM_DOMAINS
        )
        is_recognized_ats = any(
            app_host == d or app_host.endswith(f".{d}") for d in RECOGNIZED_ATS_DOMAINS
        )
        matches_official = official_host is not None and (
            app_host == official_host or app_host.endswith(f".{official_host}")
        )

        if is_external_form:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_url",
                    trustAssessmentId=assessment_id,
                    indicatorCode="UNRELATED_APPLICATION_URL",
                    severity="medium",
                    description="Application links to a generic form or messaging platform rather than an organizational domain or established ATS.",
                    evidenceType="deterministic_rule",
                    evidenceReference=f"Application hostname: {app_host}",
                    confidence=0.92,
                )
            )
        elif matches_official or is_recognized_ats:
            evidence.append(
                TrustEvidenceSchema(
                    id=f"{assessment_id}_ev_domain_ok",
                    trustAssessmentId=assessment_id,
                    indicatorCode="OFFICIAL_DOMAIN_ALIGNED",
                    severity="positive",
                    description=(
                        f"Application URL resolves directly to the organization's domain ({app_host})."
                        if matches_official
                        else f"Application is hosted on a recognized applicant tracking or programme platform ({app_host})."
                    ),
                    evidenceType="verified_fact",
                    evidenceReference=f"Application URL host: {app_host}",
                    confidence=0.95,
                )
            )

    # 5. Missing Organization Website
    if not organization.official_website:
        evidence.append(
            TrustEvidenceSchema(
                id=f"{assessment_id}_ev_missing_org",
                trustAssessmentId=assessment_id,
                indicatorCode="MISSING_COMPANY_INFO",
                severity="medium",
                description="No official organization website is recorded for independent verification.",
                evidenceType="deterministic_rule",
                evidenceReference="Organization.officialWebsite is null",
                confidence=1.0,
            )
        )

    # 6. Unrealistic Compensation vs. Requirements Heuristic
    monthly_inr = (
        (opportunity.compensation_max or opportunity.compensation_min or 0)
        if opportunity.compensation_currency == "INR"
        and opportunity.compensation_period == "monthly"
        else 0
    )
    no_interview_claim = bool(
        re.search(
            r"\b(no\s+interview|direct\s+selection|instant\s+offer\s+letter|100%\s+placement\s+guarantee)\b",
            corpus,
            re.IGNORECASE,
        )
    )
    if no_interview_claim or (monthly_inr >= 150000 and len(corpus) < 320):
        evidence.append(
            TrustEvidenceSchema(
                id=f"{assessment_id}_ev_comp",
                trustAssessmentId=assessment_id,
                indicatorCode="UNREALISTIC_COMPENSATION",
                severity="medium",
                description=(
                    "Listing promises instant selection or guaranteed placement without technical evaluation."
                    if no_interview_claim
                    else "Unusually high stipend paired with minimal technical role specification."
                ),
                evidenceType="heuristic_indicator",
                evidenceReference=(
                    'Matched "instant offer / no interview / placement guarantee" pattern in listing'
                    if no_interview_claim
                    else f"Reported stipend ₹{monthly_inr:,}/mo with brief description ({len(corpus)} chars)"
                ),
                confidence=0.84,
            )
        )

    # 7. Technical Scope Depth
    word_count = len(opportunity.description.strip().split())
    if word_count < 15:
        evidence.append(
            TrustEvidenceSchema(
                id=f"{assessment_id}_ev_vague",
                trustAssessmentId=assessment_id,
                indicatorCode="VAGUE_RESPONSIBILITIES",
                severity="medium",
                description="Role description is unusually brief and lacks concrete engineering deliverables or technical stack details.",
                evidenceType="heuristic_indicator",
                evidenceReference=f"Description length: {word_count} words",
                confidence=0.85,
            )
        )
    else:
        evidence.append(
            TrustEvidenceSchema(
                id=f"{assessment_id}_ev_scope_ok",
                trustAssessmentId=assessment_id,
                indicatorCode="CLEAR_TECHNICAL_SCOPE",
                severity="positive",
                description="Listing specifies concrete engineering responsibilities, tools, and evaluation expectations.",
                evidenceType="heuristic_indicator",
                evidenceReference=f"Structured description ({word_count} words)",
                confidence=0.85,
            )
        )

    has_high_risk = any(e.severity == "high" for e in evidence)
    medium_risk_count = sum(1 for e in evidence if e.severity == "medium")

    overall_label = "no_major_warnings"
    summary = "No high- or medium-severity warning signs were triggered by deterministic checks. Domain and technical scope appear consistent."

    if has_high_risk:
        overall_label = "elevated_risk"
        summary = "Elevated risk indicators detected. This listing exhibits patterns strongly associated with pay-to-work schemes, credential harvesting, brand impersonation, or adversarial manipulation."
    elif medium_risk_count >= 2 and not organization.official_website:
        overall_label = "insufficient_information"
        summary = "Insufficient verifiable organizational metadata. Multiple details (such as official domain and application channel) could not be independently corroborated."
    elif medium_risk_count >= 1:
        overall_label = "verification_required"
        summary = "No definitive scam indicators were found, but one or more attributes (such as an external form link, personal email contact, or unverified company footprint) require manual verification before sharing personal data."

    if has_high_risk:
        steps = [
            "Do not pay any registration, training, certificate, or security deposit fee under any circumstances.",
            "Do not share banking credentials, government ID numbers, or OTPs.",
            "Cross-check the posting directly on the organization’s official careers page.",
        ]
    elif overall_label in ("verification_required", "insufficient_information"):
        steps = [
            "Verify on LinkedIn that current engineers at the organization recognize this internship programme.",
            "Confirm the recruiter email domain matches the company’s primary website domain before submitting identity documents.",
            "Ask for a written breakdown of mentorship structure and stipend disbursement terms during the first interview.",
        ]
    else:
        steps = [
            "Confirm the URL in your browser matches the official domain or ATS before uploading your resume.",
            "Review recent intern feedback or public repositories to gauge team engineering culture.",
        ]

    return TrustAssessmentSchema(
        id=assessment_id,
        opportunityId=opportunity.id,
        overallLabel=overall_label,  # type: ignore[arg-type]
        assessmentSummary=summary,
        limitations="Automated trust checks inspect observable listing text, domain alignment, and recruiter metadata. Absence of warning signs is not a guarantee of legitimacy, and flagged heuristics do not constitute legal proof of fraud.",
        recommendedVerificationSteps=steps,
        rulesetVersion="v1.3.0-server-deterministic",
        createdAt=opportunity.updated_at or utc_now_iso(),
        evidence=evidence,
    )

