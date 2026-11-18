# ADR 001: Initial Architecture, Service Abstraction, and Phase 1 MVP Scope

- **Status**: Accepted
- **Date**: 2026-11-17

## Context
CareerRadar (Career Intelligence) aims to combine software engineering, data engineering, and evidence-based AI/ML into a unified career opportunity discovery and evaluation platform. Per `CAREER_INTELLIGENCE_PRD.md` (§18, §22) and `AGENTS.md` (§3), premature infrastructure (scrapers, distributed queues, separate vector databases) must be avoided in favor of a strong product and engineering foundation first.

## Decision
1. **Monorepo Directory Structure**: Organize the repository with `apps/web` (React + TypeScript + Vite), `apps/api` (FastAPI modular monolith boundary for Phase 2), and `docs/` (`ARCHITECTURE.md`, `API.md`, `decisions/`).
2. **Service-Layer Decoupling**: All data access in `apps/web` goes through typed asynchronous services (`src/services/*.service.ts`) backed by TanStack Query hooks (`src/hooks/*.ts`). Presentation components never import mock arrays directly.
3. **URL-Driven Discovery State**: Search queries, filters, and pagination on the Discovery page are synchronized with URL search parameters (`useSearchParams`) so filtered views are bookmarkable and shareable.
4. **Local State Persistence in Phase 1**: User interactions in Phase 1 (saving opportunities, tracking applications across 9 statuses, editing the career profile, and submitting new listings for evaluation) persist in versioned `localStorage` so the application functions as a realistic, stateful workspace prior to Phase 2 PostgreSQL integration.

## Consequences
- Frontend components are 100% decoupled from mock storage and ready for FastAPI `/api/v1` endpoints.
- Users and evaluators can test complete end-to-end journeys (Onboarding/Profile -> Discovery -> Trust & Skill Evaluation -> Saving -> Application Tracking) immediately.

