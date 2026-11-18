# CareerRadar (Career Intelligence) — Architecture & Design Specification

## 1. Architectural Overview

CareerRadar is architected as a modular, API-driven system designed to evolve cleanly from a rich client-side MVP (**Phase 1**) to a persistent FastAPI + PostgreSQL modular monolith (**Phase 2–3**) and an automated ingestion + ML retrieval platform (**Phase 4–5**) without requiring a frontend rewrite.

```text
+-----------------------------------------------------------------------------------+
|                           Frontend: React + TypeScript                            |
|                                  (apps/web)                                       |
|                                                                                   |
|  +-----------------+  +-----------------+  +-----------------+  +--------------+  |
|  |   Discovery &   |  |   Opportunity   |  |   Application   |  |    Career    |  |
|  |  Search Module  |  |  Detail & Trust |  |  Tracker Module |  |Profile Module|  |
|  +--------+--------+  +--------+--------+  +--------+--------+  +------+-------+  |
|           |                    |                    |                  |          |
|           +--------------------+--------------------+------------------+          |
|                                          |                                        |
|                          TanStack Query Server-State Layer                        |
|                                          |                                        |
|                     Typed Service Layer (src/services/*.service.ts)               |
|                                          |                                        |
|            +-----------------------------+-----------------------------+          |
|            | (VITE_DATA_MODE=mock)                                     | (live)   |
|            v                                                           v          |
|  +----------------------------------+                        +-----------------+  |
|  | Local Adapter + Deterministic    |                        |  REST API Client|  |
|  | Trust & Skill-Gap Engines        |                        |  (/api/v1/*)    |  |
|  +----------------------------------+                        +--------+--------+  |
+-----------------------------------------------------------------------|-----------+
                                                                        | HTTPS
+-----------------------------------------------------------------------v-----------+
|                     Backend: Python + FastAPI Modular Monolith                    |
|                                  (apps/api - Phase 2+)                            |
|                                                                                   |
|  +---------------+  +---------------+  +----------------+  +-------------------+  |
|  | Discovery API |  |  Profile API  |  | Applications   |  | Intelligence &    |  |
|  | & Filtering   |  |  & Skills     |  | Lifecycle API  |  | Trust Engine      |  |
|  +-------+-------+  +-------+-------+  +-------+--------+  +---------+---------+  |
|          +------------------+------------------+---------------------+            |
|                                        |                                          |
|                           SQLAlchemy 2.0 + Alembic                                |
|                                        |                                          |
|                              PostgreSQL (+ pgvector)                              |
+-----------------------------------------------------------------------------------+
```

---

## 2. Refined MVP Feature Checklist (Phase 0 & Phase 1)

| ID | Module | Feature | Priority | Status |
|---|---|---|---|---|
| F-01 | Foundation | Monorepo layout, ADRs, REST API spec, normalized TypeScript schema | P0 | Implemented |
| F-02 | Design System | High-density research UI tokens, accessible primitives, responsive shell | P0 | Implemented |
| F-03 | Landing Page | Product positioning, interactive trust/match walkthrough, direct workspace entry | P0 | Implemented |
| F-04 | Dashboard | Real aggregated metrics (saved count, pipeline breakdown, upcoming deadlines, top matches) | P0 | Implemented |
| F-05 | Discovery | Multi-faceted URL-synced search & filtering (role, domain, work mode, risk level, stipend, source, skills) + pagination | P0 | Implemented |
| F-06 | Opportunity Detail | Side-by-side original listing, structured extraction, evidence-based trust panel, skill-gap breakdown | P0 | Implemented |
| F-07 | Trust Engine | Deterministic rule evaluation across 9 risk categories with evidence references & verification steps | P0 | Implemented |
| F-08 | Matching & Skill Gaps | Explainable weighted compatibility scoring separating explicit, inferred, and unverified skills | P0 / P1 | Implemented |
| F-09 | Live Listing Evaluator | Interactive form to paste/submit any external internship listing for instant trust & skill-gap analysis | P0 | Implemented |
| F-10 | Career Profile | Zod-validated profile & skill manager with instant recomputation of recommendations | P0 | Implemented |
| F-11 | Application Tracker | Full 9-stage pipeline tracker (`interested` to `closed`) with deadlines, next actions, and private notes | P0 | Implemented |
| F-12 | Saved Opportunities | Dedicated bookmark view with deadline urgency and one-click promotion to Application Tracker | P0 | Implemented |

---

## 3. Page & Component Hierarchy (`apps/web`)

```text
src/
├── app/
│   ├── App.tsx                         # QueryClientProvider, RouterProvider, global state context
│   └── router.tsx                      # Route definitions (/, /dashboard, /discover, /opportunities/:id, /saved, /applications, /profile)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx                # Sidebar navigation, responsive header, data-mode indicator banner
│   │   └── PublicHeader.tsx            # Navigation header for Landing Page
│   ├── shared/
│   │   ├── TrustBadge.tsx              # Semantic badge for 4-tier trust labels (never "Guaranteed Safe")
│   │   ├── MatchBadge.tsx              # Explainable compatibility indicator
│   │   ├── ProvenanceTag.tsx           # Source name, external link, and freshness timestamp pill
│   │   └── DeadlineBadge.tsx           # Relative urgency badge with tabular date
│   └── ui/
│       ├── Badge.tsx                   # Semantic & neutral pill badges
│       ├── Button.tsx                  # Accessible button variants
│       ├── Card.tsx                    # Crisp 1px bordered surface containers
│       ├── EmptyState.tsx              # Actionable empty state display
│       ├── ErrorState.tsx              # Retry-capable error boundary display
│       ├── Input.tsx                   # Accessible text/search input with label & error slots
│       ├── Modal.tsx                   # Keyboard-accessible dialog modal
│       └── Select.tsx                  # Native accessible select control
├── features/
│   ├── landing/
│   │   └── LandingPage.tsx             # Product overview, architecture ethos, interactive trust/match demo
│   ├── dashboard/
│   │   └── DashboardPage.tsx           # Pipeline summary, upcoming deadlines, recommended opportunities
│   ├── discovery/
│   │   ├── DiscoveryPage.tsx           # Search, URL-synced filters, sorting, pagination, listing cards
│   │   ├── OpportunityCard.tsx         # High-density card with trust, match, compensation, and provenance
│   │   ├── FilterSidebar.tsx           # Multi-faceted filter controls
│   │   └── SubmitOpportunityModal.tsx  # React Hook Form + Zod dialog to evaluate & add an opportunity
│   ├── opportunities/
│   │   ├── OpportunityDetailPage.tsx   # Comprehensive inspection view (Overview, Intelligence, Trust, Skill Gap)
│   │   ├── TrustAssessmentPanel.tsx    # Detailed evidence table, certainty limitations, verification steps
│   │   └── SkillGapPanel.tsx           # Explicit vs. inferred skills, missing skills, learning recommendations
│   ├── saved/
│   │   └── SavedOpportunitiesPage.tsx  # Saved opportunities list with quick tracker promotion
│   ├── applications/
│   │   ├── ApplicationsPage.tsx        # 9-status filterable application tracker & status summary
│   │   └── ApplicationEditModal.tsx    # Zod-validated editor for status, dates, next actions, private notes
│   └── profile/
│       └── ProfilePage.tsx             # React Hook Form + Zod career profile & skills editor
├── hooks/
│   ├── useOpportunities.ts             # TanStack Query hooks for discovery, detail, and submission
│   ├── useProfile.ts                   # TanStack Query hooks for reading/updating CareerProfile
│   └── useApplications.ts              # TanStack Query hooks for saved items and applications
├── lib/
│   ├── sample-data.ts                  # Curated, realistic 12-opportunity dataset with explicit provenance
│   ├── trust-engine.ts                 # Deterministic rule-based scam & risk indicator evaluator
│   ├── matching-engine.ts              # Explainable profile compatibility & skill-gap analyzer
│   ├── storage.ts                      # Versioned localStorage persistence helper
│   └── utils.ts                        # Class merging, currency/date formatters
├── services/
│   ├── api-client.ts                   # Centralized HTTP client & environment configuration
│   ├── opportunities.service.ts        # Opportunity query, filter, evaluation, and creation service
│   ├── profile.service.ts              # CareerProfile retrieval and update service
│   └── applications.service.ts         # SavedOpportunity & Application CRUD service
├── styles/
│   └── index.css                       # Tailwind CSS directives & typography/surface tokens
└── types/
    └── domain.ts                       # Normalized domain interfaces matching PRD §10
```

---

## 4. Design System Specification

### 4.1 Visual Direction
CareerRadar is designed as a **technical research and decision-support workbench**, explicitly avoiding generic AI-generated dashboard tropes (no neon gradients, no decorative glowing blurs, no fake sparklines).

- **Surface Palette**: Crisp neutral slate/zinc (`bg-slate-50` canvas, `bg-white` primary cards, `border-slate-200` 1px structural hairlines).
- **Primary Accent**: Deep editorial indigo/slate (`slate-900` for primary actions, `indigo-600` for active interactive indicators and focus rings).
- **Typography**:
  - Primary UI & Prose: Inter / system sans-serif with tight tracking on headings (`tracking-tight`).
  - Technical Metadata, IDs, Compensation & Dates: Monospace (`font-mono`) and `tabular-nums` for scannable numerical alignment.
- **Semantic Trust Palette**:
  - `no_major_warnings`: Emerald (`bg-emerald-50 text-emerald-800 border-emerald-200`) — phrased strictly as *"No Major Warnings Found"*, never *"Verified Safe"*.
  - `verification_required`: Amber (`bg-amber-50 text-amber-800 border-amber-200`) — *"Some Details Require Verification"*.
  - `elevated_risk`: Rose/Red (`bg-rose-50 text-rose-800 border-rose-200`) — *"Elevated Risk Indicators"*.
  - `insufficient_information`: Slate (`bg-slate-100 text-slate-700 border-slate-300`) — *"Insufficient Information"*.

---

## 5. Normalized Domain Schema

The frontend TypeScript domain (`src/types/domain.ts`) mirrors the relational PostgreSQL entities defined in PRD §10 (`User`, `CareerProfile`, `Skill`, `UserSkill`, `Organization`, `Opportunity`, `OpportunitySource`, `OpportunitySkill`, `OpportunityAnalysis`, `TrustAssessment`, `TrustEvidence`, `SavedOpportunity`, `Application`). This guarantees that transitioning `VITE_DATA_MODE` from `mock` to `api` requires zero component-level refactoring.

