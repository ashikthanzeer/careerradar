# CareerRadar — Production Testing Criteria & Security Audit Report

## 1. Defined Testing Criteria

To validate CareerRadar at production readiness, the platform is audited against six mandatory testing criteria (**TC-01** through **TC-06**):

| Criterion ID | Category | Requirement | Verification Target | Status |
|---|---|---|---|---|
| **TC-01** | **Zero Dummy Data & Clean State** | A fresh database and newly authenticated user account must start with 0 fake opportunities, 0 fake saved items, and 0 fake applications. | `test_zero_dummy_data_on_fresh_database` (`apps/api`), `TC-01` (`apps/web`) | **PASS** |
| **TC-02** | **Better Auth Google OAuth, Login-First Entry & Persistent Sessions** | Root `/` renders Google login when signed out and protects `/discover`; Better Auth routes (`/api/auth/sign-in/social`, `/api/auth/get-session`, `/api/auth/sign-out`) + `/api/v1/auth/*` issue 30-day HMAC-SHA256 JWTs persisted via `better-auth.session_token` cookies and `localStorage`; sessions survive browser refreshes and DB resets while deleted/invalid accounts return `401 Unauthorized`; cross-user mutations return `403 Forbidden`. | `test_oauth_providers_login_export_and_account_deletion`, `test_authorization_and_resource_ownership_protection`, `test_better_auth_social_sign_in_and_session_cookie_lifecycle`, `test_jwt_session_survives_database_reset_without_logging_user_out` (`apps/api`), `TC-02`, `TC-02b`, `TC-02c` (`apps/web`) | **PASS** |
| **TC-03** | **Scam & Prompt-Injection Protection** | Upfront registration/training fees (`FEE_REQUIRED`), credential harvesting (`CREDENTIAL_HARVESTING`), free-webmail brand impersonation (`BRAND_IMPERSONATION_RISK`), and embedded LLM prompt-injection attacks (`PROMPT_INJECTION_ATTEMPT`) are deterministically flagged as `elevated_risk`. | `test_prompt_injection_and_fee_scam_detection` (`apps/api`), `trust-engine.test.ts` & `TC-03` (`apps/web`) | **PASS** |
| **TC-04** | **Skill-Gap & Match Personalization** | Updating a user's Career Profile skills immediately recomputes required skill coverage, separates explicit vs. project-inferred skills, and updates compatibility scores. | `test_profile_update_recomputes_skill_gap` (`apps/api`), `matching-engine.test.ts` (`apps/web`) | **PASS** |
| **TC-05** | **URL Extraction, Deduplication & Freshness** | Legal suffixes (`Pvt. Ltd.`, `Inc.`) and UTM tracking parameters (`utm_*`) are normalized; job links from LinkedIn, Internshala, Indeed, and Schema.org `JobPosting` pages extract structured job fields (with URL-slug fallbacks when auth-walled); cross-source duplicates merge idempotently; failed HTTP checks mark listings `unverified_status`. | `test_phase4_ingestion_idempotency_and_deduplication`, `test_phase4_similar_title_different_organization_not_merged`, `test_url_extractor_parses_json_ld_and_platform_specific_dom`, `test_url_extractor_linkedin_and_internshala_slug_fallbacks_when_walled`, `test_extract_url_endpoint_with_indeed_dom_html` (`apps/api`), `TC-06` (`apps/web`) | **PASS** |
| **TC-06** | **UI Simplicity, Dark Mode & Build Integrity** | Jobseeker-friendly plain-English UI, responsive Dark/Light mode toggle, strict TypeScript (`tsc --noEmit`), Vitest suite (14 tests across 3 files), Pytest suite (16 tests across 5 files), and production Vite bundle (`vite build`) pass with 0 errors. | `TC-04`, `TC-05`, `TC-06` (`apps/web`), `scripts/verify.sh` | **PASS** |

---

## 2. Security & Privacy Audit Summary

1. **No Secrets in Codebase**: Verified `.env` is ignored via `.gitignore` and `.env.example` contains only placeholder keys.
2. **Server-Side Ownership Enforcement**: `PATCH /api/v1/applications/{id}` and `DELETE /api/v1/applications/{id}` verify `row.user_id == current_user.id` before mutation.
3. **Untrusted Listing Sanitization**: `app/modules/intelligence/sanitizer.py` strips instruction-override payloads before extraction and emits a high-severity `PROMPT_INJECTION_ATTEMPT` indicator.
4. **Evidence-Grounded Verdicts**: Neither deterministic rules nor ML classifiers ever label an unverified opportunity as "100% Guaranteed Safe."
5. **Account Data Export & Deletion**: `GET /api/v1/auth/export` and `DELETE /api/v1/auth/account` allow users to download all personal records as JSON or permanently erase their account.

