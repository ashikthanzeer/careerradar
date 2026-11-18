# CareerRadar — Production Testing Criteria & Security Audit Report

## 1. Defined Testing Criteria

To validate CareerRadar at production readiness, the platform is audited against six mandatory testing criteria (**TC-01** through **TC-06**):

| Criterion ID | Category | Requirement | Verification Target | Status |
|---|---|---|---|---|
| **TC-01** | **Zero Dummy Data & Clean State** | A fresh database and newly authenticated user account must start with 0 fake opportunities, 0 fake saved items, and 0 fake applications. | `test_zero_dummy_data_on_fresh_database` (`apps/api`), `TC-01` (`apps/web`) | **PASS** |
| **TC-02** | **OAuth 2.0 & JWT Security** | Users can sign in with **Google**; sessions are backed by HMAC-SHA256 signed JWTs; unauthenticated/invalid tokens receive `401 Unauthorized`; User B cannot modify or delete User A's applications (`403 Forbidden`); users can export or delete their account (`204 No Content`). | `test_oauth_providers_login_export_and_account_deletion`, `test_authorization_and_resource_ownership_protection` (`apps/api`), `TC-02` (`apps/web`) | **PASS** |
| **TC-03** | **Scam & Prompt-Injection Protection** | Upfront registration/training fees (`FEE_REQUIRED`), credential harvesting (`CREDENTIAL_HARVESTING`), free-webmail brand impersonation (`BRAND_IMPERSONATION_RISK`), and embedded LLM prompt-injection attacks (`PROMPT_INJECTION_ATTEMPT`) are deterministically flagged as `elevated_risk`. | `test_prompt_injection_and_fee_scam_detection` (`apps/api`), `trust-engine.test.ts` & `TC-03` (`apps/web`) | **PASS** |
| **TC-04** | **Skill-Gap & Match Personalization** | Updating a user's Career Profile skills immediately recomputes required skill coverage, separates explicit vs. project-inferred skills, and updates compatibility scores. | `test_profile_update_recomputes_skill_gap` (`apps/api`), `matching-engine.test.ts` (`apps/web`) | **PASS** |
| **TC-05** | **Data Normalization, Deduplication & Freshness** | Legal suffixes (`Pvt. Ltd.`, `Inc.`) and UTM tracking parameters (`utm_*`) are normalized; cross-source duplicates merge into a single canonical opportunity; repeated runs are 100% idempotent; failed HTTP checks mark a listing `unverified_status` rather than closed. | `test_phase4_ingestion_idempotency_and_deduplication`, `test_phase4_similar_title_different_organization_not_merged` (`apps/api`) | **PASS** |
| **TC-06** | **UI Simplicity, Dark Mode & Build Integrity** | Jobseeker-friendly plain-English UI, responsive Dark/Light mode toggle, strict TypeScript (`tsc --noEmit`), Vitest suite (`vitest run`), and production Vite bundle (`vite build`) pass with 0 errors. | `TC-04` & `TC-05` (`apps/web`), `scripts/verify.sh` | **PASS** |

---

## 2. Security & Privacy Audit Summary

1. **No Secrets in Codebase**: Verified `.env` is ignored via `.gitignore` and `.env.example` contains only placeholder keys.
2. **Server-Side Ownership Enforcement**: `PATCH /api/v1/applications/{id}` and `DELETE /api/v1/applications/{id}` verify `row.user_id == current_user.id` before mutation.
3. **Untrusted Listing Sanitization**: `app/modules/intelligence/sanitizer.py` strips instruction-override payloads before extraction and emits a high-severity `PROMPT_INJECTION_ATTEMPT` indicator.
4. **Evidence-Grounded Verdicts**: Neither deterministic rules nor ML classifiers ever label an unverified opportunity as "100% Guaranteed Safe."
5. **Account Data Export & Deletion**: `GET /api/v1/auth/export` and `DELETE /api/v1/auth/account` allow users to download all personal records as JSON or permanently erase their account.

