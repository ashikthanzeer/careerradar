# ADR 002: Evidence-Based Trust Assessment and Explainable Compatibility Scoring

- **Status**: Accepted
- **Date**: 2026-11-17

## Context
A core differentiator of CareerRadar is helping students avoid fraudulent or low-value internship listings while identifying high-alignment technical opportunities (`CAREER_INTELLIGENCE_PRD.md` §2.2, §6.3, §6.4, §6.6). However:
1. An LLM must never independently declare an organization legitimate or fraudulent without observable evidence.
2. Absence of information does not prove fraud, and absence of red flags does not guarantee legitimacy.
3. Arbitrary match percentages presented as "selection probability" mislead users.

## Decision
1. **Deterministic Rule Engine First (`src/lib/trust-engine.ts`)**:
   - Evaluate every opportunity against explicit, auditable rules:
     - `FEE_REQUIRED` (High risk: registration, training, security deposit, or certificate fees)
     - `CREDENTIAL_HARVESTING` (High risk: requests for banking passwords, SSN/Aadhaar/PAN upfront, or crypto wallets)
     - `BRAND_IMPERSONATION_RISK` (High risk: well-known company name paired with free webmail or mismatched application domain)
     - `SUSPICIOUS_RECRUITER_EMAIL` (Medium risk: `@gmail.com`, `@yahoo.com`, `@outlook.com` recruiter contact for a purported corporate organization)
     - `UNREALISTIC_COMPENSATION` (Medium risk: extreme stipend paired with minimal requirements or zero technical screening)
     - `UNRELATED_APPLICATION_URL` (Medium risk: Google Docs/Forms or messaging link instead of a verifiable domain/ATS)
     - `VAGUE_RESPONSIBILITIES` (Medium risk: generic buzzwords without concrete deliverables or technologies)
     - `MISSING_ORGANIZATION_WEB_PRESENCE` (Low–Medium risk: missing official website)
     - `VERIFIED_OFFICIAL_DOMAIN` (Positive evidence: application URL domain matches organization's official domain or recognized ATS)
   - Every triggered rule emits a `TrustEvidence` record containing `indicatorCode`, `severity`, `description`, `evidenceType` (`deterministic_rule` | `verified_fact` | `heuristic_indicator`), and a direct quote or field reference (`evidenceReference`).
   - Every `TrustAssessment` includes an explicit `limitations` statement and actionable `recommendedVerificationSteps`.

2. **Explainable Weighted Compatibility & Skill-Gap Engine (`src/lib/matching-engine.ts`)**:
   - Computes compatibility across weighted, transparent dimensions:
     - Required Skill Coverage (40%)
     - Preferred Skill Coverage (15%)
     - Role Category Alignment (20%)
     - Domain Alignment (15%)
     - Work Mode & Location Alignment (10%)
   - Distinguishes between **Explicitly Declared Skills** (entered in the user's skill matrix), **Inferred Skills** (derived from user projects/coursework), and **Unverified/Missing Skills** (explicitly noting that a missing profile entry does not prove the user lacks the skill).

## Consequences
- Zero hallucinated trust claims; every warning or positive signal cites observable fields from the listing.
- Updating the user's Career Profile immediately recalculates explainable match reasons and skill gaps across all opportunities.

