# Career Intelligence
## Product Requirements Document (PRD)

**Version:** 0.1  
**Date:** 17 November 2026  
**Status:** Initial Specification  
**Working Name:** Career Intelligence  
**Initial Focus:** Internship Discovery and Evaluation  
**Frontend:** React + TypeScript

---

# 1. Product Overview

## 1.1 Vision

Career Intelligence is an intelligent career-opportunity discovery and evaluation platform designed for students and early-career professionals.

Its purpose is to help users discover relevant opportunities from multiple sources, evaluate their credibility and quality, understand their compatibility with personal career goals, and manage their applications.

The initial product focuses on internships but should eventually support:

- Research internships and research positions.
- Open-source contribution programmes.
- Fellowships and scholarships.
- Hackathons and technical competitions.
- Graduate programmes.
- Early-career technical positions.

The long-term vision is to become a unified career intelligence platform rather than another conventional job board.

## 1.2 Problem Statement

Career opportunities are fragmented across multiple platforms:

- LinkedIn
- Internshala
- Wellfound
- Company career pages
- GitHub repositories
- Discord and Telegram communities
- University and research institution websites

Students face several problems:

1. Opportunities are scattered across different platforms.
2. Many listings are outdated or duplicated.
3. Some opportunities are fraudulent or misleading.
4. Genuine opportunities aren't necessarily valuable for career development.
5. It is difficult to determine which internships align with personal career interests.
6. Application requirements and deadlines are difficult to track.
7. Students waste time applying to opportunities that aren't relevant to their goals.

Career Intelligence aims to reduce this friction through intelligent discovery, evidence-based evaluation and personalized recommendations.

## 1.3 Core Value Proposition

A user should be able to:

1. Create a career profile.
2. Discover opportunities from multiple sources.
3. Search and filter opportunities.
4. Identify potentially fraudulent or suspicious listings.
5. Evaluate technical relevance and learning potential.
6. Receive personalized recommendations.
7. Identify skill gaps.
8. Save opportunities and track applications.

The platform should help users make better-informed career decisions.

---

# 2. Product Principles

The following principles should guide every product and engineering decision.

### 2.1 Real Utility First

Every major feature must solve an identifiable user problem.

Avoid building features simply because they demonstrate AI capabilities.

### 2.2 Evidence Over AI Guesses

AI-generated assessments must include reasoning and supporting evidence.

The platform must never claim that an opportunity is definitively legitimate based solely on an AI prediction.

### 2.3 Engineering Over AI Wrappers

Use AI where it adds measurable value.

Conventional software engineering should handle deterministic operations such as:

- Filtering.
- Data normalization.
- Deduplication.
- Database operations.
- Application tracking.
- Rule-based validation.

### 2.4 Incremental Sophistication

Start with simple, explainable algorithms.

Introduce advanced ML techniques when the product has sufficient data and a measurable need.

### 2.5 Production-Oriented Architecture

Prioritize:

- Maintainability.
- Modularity.
- Testing.
- Observability.
- Security.
- Scalability.
- Documentation.

Avoid premature microservices and unnecessary infrastructure.

---

# 3. Target Users

## 3.1 Primary Users

Students and early-career engineers seeking internships, research experience, open-source programmes and other career-building opportunities.

## 3.2 Primary Persona

**Undergraduate Computer Science Student**

Needs:
- Discover relevant technical internships.
- Find remote and location-specific opportunities.
- Avoid scams.
- Evaluate technical requirements.
- Identify opportunities that offer meaningful experience.
- Track applications and deadlines.

Pain points:
- Opportunities are scattered across multiple platforms.
- Listings are frequently duplicated or outdated.
- Company credibility is difficult to assess.
- Generic recommendations aren't personalized.
- Application tracking is fragmented.

## 3.3 Secondary Users

- Students seeking research internships.
- Students looking for open-source programmes.
- Recent graduates.
- Students interested in fellowships and scholarships.
- Career advisors and mentors.

---

# 4. Product Modules

The platform should initially consist of seven major modules.

| Module | Responsibility |
|---|---|
| Opportunity Discovery | Collect and search career opportunities |
| Opportunity Intelligence | Extract and analyse opportunity information |
| Trust & Verification | Evaluate credibility and identify risk indicators |
| Recommendation Engine | Match opportunities with user profiles |
| Career Profile | Maintain skills, education and career interests |
| Application Manager | Track applications and deadlines |
| Career Analytics | Provide career-related insights and trends |

These modules should have clear logical boundaries, even if they initially reside in one backend application.

---

# 5. Feature Prioritization

Features are classified into three categories.

- **P0:** Essential for MVP.
- **P1:** Next development phase.
- **P2:** Advanced future capabilities.

| Feature | Priority |
|---|---|
| Landing page | P0 |
| Opportunity listing | P0 |
| Search and filtering | P0 |
| Opportunity detail pages | P0 |
| Career profile | P0 |
| Save opportunities | P0 |
| Application tracker | P0 |
| AI opportunity summarization | P0 |
| Basic trust indicators | P0 |
| Profile-aware recommendations | P1 |
| Duplicate detection | P1 |
| Opportunity freshness detection | P1 |
| Skill-gap analysis | P1 |
| Automated data ingestion | P1 |
| Semantic search | P2 |
| Learning-to-rank recommendation system | P2 |
| Advanced scam classification | P2 |
| Career trend analytics | P2 |
| Community reporting system | P2 |

**Important:** The MVP must be useful even with a curated dataset. Automated scraping and advanced ML models are not prerequisites.

---

# 6. Core Features and Requirements

## 6.1 Opportunity Discovery

The platform should aggregate internship opportunities from supported sources.

Potential sources:

- LinkedIn.
- Internshala.
- Wellfound.
- YC Work at a Startup.
- Company career pages.
- GitHub opportunity repositories.
- Public APIs and RSS feeds.
- User-submitted opportunities.

Source integrations must comply with their respective access policies and terms.

Do not implement unrestricted scraping or bypass access restrictions.

### Search Filters

Users should be able to filter by:

- Role.
- Domain.
- Skills and technologies.
- Location.
- Remote, hybrid or on-site.
- Compensation.
- Duration.
- Experience requirements.
- Application deadline.
- Date posted.

### Opportunity Cards

Each opportunity card should display:

- Role title.
- Organization.
- Location.
- Work mode.
- Compensation, if available.
- Duration.
- Posted date.
- Application deadline.
- Source.
- Trust indicator.
- Match indicator, if available.

Search results must support pagination or another bounded loading mechanism.

---

## 6.2 Opportunity Intelligence

The platform should analyse internship descriptions and extract structured information.

Expected output:

- Short description.
- Responsibilities.
- Required skills.
- Preferred skills.
- Eligibility requirements.
- Experience requirements.
- Technologies.
- Compensation.
- Duration.
- Location.
- Application deadline.
- Ambiguities or missing information.

An LLM can perform extraction and summarization.

However:

- Output must be schema-validated.
- Missing information must remain unknown.
- AI must not invent eligibility criteria or compensation.
- Original listing information must remain accessible.
- AI-generated content must be clearly identified.

---

## 6.3 Trust and Scam Detection

This should become one of the platform's defining features.

The system should identify suspicious indicators.

| Indicator | Potential Risk |
|---|---|
| Application fee required | High |
| Requests for passwords or banking credentials | High |
| Company impersonation | High |
| Unverifiable organization | Medium–High |
| Suspicious recruiter email domain | Medium |
| Unrealistic compensation promises | Medium |
| Vague responsibilities | Medium |
| Unrelated application URL | Medium |
| Missing company information | Low–Medium |

### Assessment Output

Suggested categories:

1. No major warning signs found.
2. Some details require verification.
3. Elevated risk indicators.
4. Insufficient information.

Each assessment should contain:

- Risk indicator.
- Supporting evidence.
- Explanation.
- Confidence or certainty limitations.
- Recommended verification steps.

**Critical requirement:**

The platform must distinguish between suspicious and confirmed fraudulent opportunities.

Absence of information does not automatically mean fraud.

A low-risk assessment must never be presented as a guarantee of legitimacy.

### Initial Implementation

Start with deterministic rules and manually curated evidence.

Use LLMs to assist with information extraction and explanation, not to fabricate verification.

Advanced ML classification can be introduced after collecting a properly labelled dataset.

---

## 6.4 Personalized Recommendation Engine

Users should receive opportunities based on their career profiles.

Profile attributes:

- Education.
- Skills.
- Projects.
- Preferred domains.
- Preferred roles.
- Location preferences.
- Experience.
- Career interests.

Potential recommendation factors:

- Role alignment.
- Skill overlap.
- Domain relevance.
- Eligibility compatibility.
- Location preference.
- Work-mode preference.
- Duration.
- Compensation.
- Opportunity freshness.

The initial recommendation engine should use explainable weighted scoring.

Every recommendation should explain:

- Why the opportunity was recommended.
- Which user attributes contributed.
- Which skills are missing.
- What requirements remain uncertain.

Do not present arbitrary scores as objective probabilities of getting selected.

### Future ML Capabilities

- TF-IDF.
- Sentence embeddings.
- Semantic similarity.
- Hybrid retrieval.
- Learning-to-rank.
- Personalized ranking models.

---

## 6.5 Application Tracker

Users should be able to track their application progress.

Suggested statuses:

- Interested.
- Saved.
- Applied.
- Assessment.
- Interview.
- Offer.
- Rejected.
- Withdrawn.
- Closed.

Application records should support:

- Application date.
- Deadline.
- Next action.
- Private notes.
- Status history (future enhancement).

The dashboard should display upcoming deadlines and active applications.

---

## 6.6 Skill Gap Analysis

Compare user skills against opportunity requirements.

Example:

**Machine Learning Engineering Intern**

Skill match: 68%

Already have:
- Python.
- Git.
- SQL.
- Basic Machine Learning.

Skills to improve:
- PyTorch.
- Model Deployment.
- ML Pipelines.

The system can recommend relevant learning topics and project ideas.

Skill matching must distinguish between:

- Explicitly declared skills.
- Inferred skills.
- Unknown skills.

A missing profile entry does not prove that the user lacks the skill.

---

## 6.7 Career Dashboard

The dashboard should display:

- Total saved opportunities.
- Applications by status.
- Upcoming deadlines.
- Recently discovered opportunities.
- Recommended opportunities.
- Relevant opportunity trends, when sufficient data exists.

Avoid fake metrics or charts based on invented data.

---

# 7. User Journeys

## 7.1 First-Time User

1. User visits landing page.
2. User registers or enters demo mode.
3. User creates a career profile.
4. User enters the discovery dashboard.
5. User explores available opportunities.
6. User applies filters.
7. User opens an opportunity.
8. User reviews its analysis and trust indicators.
9. User saves the opportunity.

## 7.2 Opportunity Evaluation

1. User searches for an opportunity.
2. Backend returns matching records.
3. User opens an opportunity.
4. Platform displays its original description.
5. Intelligence module displays structured information.
6. Trust module displays risk indicators and supporting evidence.
7. Recommendation module explains profile compatibility.
8. User decides whether to apply.

## 7.3 Application Tracking

1. User saves an opportunity.
2. User changes status to Applied.
3. User records application date.
4. User adds notes or deadlines.
5. User updates the status as the process progresses.

---

# 8. Technology Stack

The following is the recommended initial stack.

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Routing | React Router |
| Server State | TanStack Query |
| Forms | React Hook Form |
| Validation | Zod |
| Backend | Python + FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| AI Integration | Gemini API / OpenRouter |
| ML | Python, scikit-learn, Sentence Transformers |
| Vector Search | pgvector |
| Deployment | Vercel + Render |
| Containerization | Docker |

### Important Architectural Decisions

- Keep API keys exclusively on the backend.
- Use PostgreSQL as the primary database.
- Introduce pgvector only when semantic search becomes necessary.
- Avoid a separate vector database initially.
- Start with a modular monolith.
- Introduce background workers when automated ingestion requires them.

---

# 9. Proposed System Architecture

```text
                 React + TypeScript
                         |
                      HTTPS
                         |
                      FastAPI
                         |
        +----------------+----------------+
        |                |                |
    Discovery         User/Profile    Application
     Module             Module          Module
        |
   Opportunity Repository
        |
     PostgreSQL
        |
   Intelligence Module
        |
   +----+--------------------+
   |                         |
Rule-Based Analysis      LLM Integration
   |
Trust Assessment
Recommendation Engine

Future:
External Sources
       |
Data Ingestion Workers
       |
Normalization
       |
Deduplication
       |
PostgreSQL + pgvector
```

This is the target architecture, not a requirement to implement everything immediately.

---

# 10. Database Design

The initial database should contain the following entities.

## User

- id
- email
- authentication_provider
- created_at
- updated_at

## CareerProfile

- id
- user_id
- display_name
- education_level
- field_of_study
- institution
- graduation_year
- preferred_roles
- preferred_domains
- preferred_locations
- work_modes
- preferred_duration
- compensation_preference

## Skill

- id
- canonical_name
- category

## UserSkill

- id
- user_id
- skill_id
- proficiency
- years_experience

## Organization

- id
- name
- normalized_name
- official_website
- description
- verification_metadata

## Opportunity

- id
- organization_id
- title
- normalized_title
- description
- opportunity_type
- role_category
- location
- work_mode
- compensation_min
- compensation_max
- compensation_currency
- duration
- posted_at
- deadline
- application_url
- status
- first_seen_at
- last_seen_at
- created_at
- updated_at

## OpportunitySource

- id
- opportunity_id
- source_name
- source_url
- external_id
- source_published_at
- last_checked_at
- source_status

## OpportunitySkill

- id
- opportunity_id
- skill_id
- requirement_type
- extraction_confidence

## OpportunityAnalysis

- id
- opportunity_id
- analysis_type
- structured_result
- model_provider
- model_name
- prompt_version
- confidence
- created_at

## TrustAssessment

- id
- opportunity_id
- overall_label
- assessment_summary
- limitations
- ruleset_version
- created_at

## TrustEvidence

- id
- trust_assessment_id
- indicator_code
- severity
- description
- evidence_type
- evidence_reference
- confidence

## SavedOpportunity

- id
- user_id
- opportunity_id
- saved_at

## Application

- id
- user_id
- opportunity_id
- status
- applied_at
- deadline
- next_action
- private_notes
- created_at
- updated_at

This schema is conceptual. Refine relationships, constraints, indexes and field types before implementing migrations.

---

# 11. Data Ingestion Strategy

Automated aggregation is a major future component.

However, it should not be the first development priority.

### Initial Sources

Start with a small number of permitted sources.

Potential options:

- Official company career pages.
- Public APIs.
- RSS feeds.
- Public GitHub repositories.
- User-submitted opportunities.
- Permitted job-board integrations.

### Source Compliance

Before integrating any source:

1. Review applicable terms and access policies.
2. Prefer official APIs and documented feeds.
3. Respect rate limits.
4. Preserve original source URLs.
5. Do not bypass CAPTCHAs or authentication.
6. Avoid collecting unnecessary personal information.

### Normalization

Normalize:

- Company names.
- Job titles.
- Locations.
- Work modes.
- Compensation.
- Dates.
- Technologies.
- Opportunity categories.

Preserve original source data where possible.

### Duplicate Detection

Potential matching attributes:

- Organization.
- Role title.
- Application URL.
- External listing ID.
- Location.
- Description similarity.

Do not merge records solely because their titles are similar.

### Freshness Detection

Track:

- First discovered date.
- Last checked date.
- Source publication date.
- Application URL availability.
- Application deadline.
- Source status.

A failed HTTP request does not automatically prove that an opportunity is closed.

---

# 12. AI/ML Development Strategy

The project should gradually evolve into an ML-enabled systems application.

| Component | Initial Implementation | Future Evolution |
|---|---|---|
| Opportunity extraction | LLM + schema validation | Specialized extraction models |
| Scam detection | Deterministic rules | Evaluated classification model |
| Search | PostgreSQL full-text search | Hybrid semantic search |
| Recommendations | Weighted scoring | Learning-to-rank |
| Deduplication | Normalized field matching | Embedding-assisted matching |
| Skill analysis | Set comparison | Semantic skill mapping |

### ML Evaluation

Recommendation system:
- Precision@K.
- Recall@K.
- NDCG@K.

Extraction:
- Precision.
- Recall.
- F1.
- Field-level accuracy.

Trust classification:
- Precision.
- Recall.
- False-positive rate.
- False-negative rate.
- Calibration, if probabilities are exposed.

Do not claim model effectiveness without an appropriate evaluation dataset.

---

# 13. API Design

Initial API contracts:

### Profile

```http
GET /api/v1/profile
PUT /api/v1/profile
```

### Opportunities

```http
GET /api/v1/opportunities
GET /api/v1/opportunities/{opportunity_id}
POST /api/v1/opportunities
POST /api/v1/opportunities/{opportunity_id}/analyze
GET /api/v1/opportunities/{opportunity_id}/analysis
GET /api/v1/opportunities/{opportunity_id}/trust-assessment
```

### Saved Opportunities

```http
GET /api/v1/saved-opportunities
POST /api/v1/opportunities/{opportunity_id}/save
DELETE /api/v1/opportunities/{opportunity_id}/save
```

### Applications

```http
GET /api/v1/applications
POST /api/v1/applications
PATCH /api/v1/applications/{application_id}
DELETE /api/v1/applications/{application_id}
```

### Recommendations

```http
GET /api/v1/recommendations
```

### Health

```http
GET /health
```

Requirements:

- Consistent response formats.
- Request validation.
- Pagination.
- Authorization.
- API versioning.
- OpenAPI documentation.
- Appropriate error handling.

These routes are proposed contracts and should be finalized before backend implementation.

---

# 14. UI/UX Requirements

The interface should feel like a focused research and decision-support tool.

Avoid generic AI-dashboard aesthetics.

### Design Principles

- Strong typography.
- Clear information hierarchy.
- Consistent spacing.
- Restrained colours.
- High information density without clutter.
- Responsive layouts.
- Accessible contrast.
- Minimal unnecessary animations.
- Meaningful visual indicators.

### Required Pages

1. Landing Page.
2. Authentication.
3. User Onboarding.
4. Discovery Dashboard.
5. Search Results.
6. Opportunity Details.
7. Saved Opportunities.
8. Application Tracker.
9. Career Profile.
10. Settings.

### Discovery Page

Suggested components:

- Navigation sidebar.
- Search bar.
- Filter controls.
- Sort control.
- Opportunity cards.
- Match indicators.
- Pagination.

### Opportunity Detail Page

Suggested sections:

- Overview.
- Responsibilities.
- Requirements.
- Technologies.
- Compensation.
- Application information.
- Source details.
- AI analysis.
- Trust assessment.
- Profile compatibility.

The original source must always remain accessible.

---

# 15. Security and Privacy

Security must be considered from the beginning.

Requirements:

- Keep secrets in backend environment variables.
- Never commit credentials.
- Enforce user-level authorization.
- Validate incoming data.
- Treat external listing descriptions as untrusted input.
- Protect LLM calls against prompt injection.
- Apply rate limits to expensive endpoints.
- Minimize personal information collection.
- Protect application notes.
- Avoid logging sensitive information.
- Use HTTPS in production.
- Keep dependencies updated.

Before a broad public release, provide appropriate account data deletion and export functionality.

---

# 16. Testing Strategy

### Frontend

- Component tests.
- Form validation.
- Search and filter interactions.
- Protected route behavior.
- End-to-end user journeys.

### Backend

- Unit tests.
- API tests.
- Database integration tests.
- Authorization tests.
- Data normalization tests.
- Trust rule tests.
- LLM output validation tests.

### Data Quality

Test:

- Duplicate records.
- Missing fields.
- Invalid dates.
- Contradictory information.
- Expired opportunities.
- Malformed source data.

### Security

Test:

- Unauthorized data access.
- Prompt injection.
- Secret exposure.
- Input validation.
- Rate limiting.

---

# 17. Deployment

Suggested initial deployment:

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | Managed PostgreSQL |
| AI | Server-side API integration |

Maintain three environments:

- Local development.
- Preview/staging.
- Production.

Use database migrations and repeatable seed scripts.

Docker should be introduced for reproducible development and deployment when the initial structure is stable.

---

# 18. Development Roadmap

## Phase 0: Product Foundation

- Confirm product scope.
- Create repository.
- Define architecture.
- Define UI/UX direction.
- Establish sample data schema.
- Document important technical decisions.

**Deliverable:** Product and technical foundation.

## Phase 1: React MVP

Build:

- Landing page.
- Application shell.
- Discovery dashboard.
- Search and filtering.
- Opportunity details.
- Career profile interface.
- Application tracker interface.

Use realistic, clearly labelled sample data.

**Deliverable:** Fully navigable and polished React application.

## Phase 2: Backend Integration

Implement:

- FastAPI.
- PostgreSQL.
- Authentication.
- Profile management.
- Opportunity APIs.
- Saved opportunities.
- Application tracking.

**Deliverable:** Persistent full-stack application.

## Phase 3: Opportunity Intelligence

Implement:

- Structured opportunity extraction.
- AI summarization.
- Deterministic trust checks.
- Profile-aware matching.
- Skill-gap analysis.

**Deliverable:** Functional intelligence features.

## Phase 4: Data Ingestion

Implement:

- Source adapters.
- Data normalization.
- Deduplication.
- Freshness checks.
- Background workers.

**Deliverable:** Automated opportunity aggregation.

## Phase 5: ML Systems Evolution

Implement and evaluate:

- Semantic retrieval.
- Embedding models.
- Hybrid search.
- Advanced recommendation algorithms.
- ML evaluation pipelines.
- Monitoring and observability.

**Deliverable:** Advanced ML-enabled career intelligence platform.

---

# 19. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Website scraping restrictions | Use permitted APIs and feeds |
| Outdated listings | Implement freshness tracking |
| False scam accusations | Evidence-based assessments |
| False reassurance | Never guarantee legitimacy |
| LLM hallucinations | Structured validation |
| Poor recommendations | Evaluate against baselines |
| Scope creep | Enforce feature priorities |
| API costs | Rate limits and caching |
| Duplicate records | Normalization and deduplication |
| Overengineering | Modular monolith initially |

---

# 20. Success Metrics

### MVP

- Search functionality works reliably.
- Users can discover and save opportunities.
- Core application tracking journey works.
- Analysis outputs pass schema validation.
- Trust indicators provide explanations.
- User data is protected.
- Core workflows have automated tests.

### Future

- Recommendation Precision@K.
- Search relevance.
- Duplicate detection accuracy.
- Opportunity freshness.
- Trust-assessment precision and recall.
- User retention.
- Application tracking engagement.

Raw opportunity count should not be treated as the primary measure of success.

---

# 21. Instructions for AI Coding Agents

This section is particularly important.

The PRD defines the product vision and intended capabilities. It does not authorize implementing every feature immediately.

### General Rules

1. Read this PRD and repository README before making changes.
2. Inspect the existing codebase before modifying architecture.
3. Identify the current development phase.
4. Implement only the agreed scope.
5. Avoid premature abstractions.
6. Never invent external integrations or verification results.
7. Clearly label mock data.
8. Never expose API keys in frontend code.
9. Validate external and LLM-generated data.
10. Add tests for new business logic.
11. Update documentation when architecture changes.
12. Explain significant technical decisions.
13. Do not claim a feature is complete without testing it.
14. Maintain responsive and accessible UI.
15. Ask for clarification when a decision affects security, privacy, data integrity or source compliance.

### Implementation Workflow

For every task:

1. Understand the requested outcome.
2. Inspect relevant files.
3. Identify existing conventions.
4. Create an implementation plan for non-trivial changes.
5. Implement the smallest coherent change.
6. Run relevant tests and type checks.
7. Report changed files, implemented functionality, tests and limitations.

### Priority Rules

When instructions conflict:

1. Security, privacy and source compliance take precedence.
2. Explicit instructions for the current task take precedence over assumptions.
3. This PRD defines product intent.
4. Existing repository conventions should be preserved unless there is a justified reason to change them.

---

# 22. Initial Instructions to the Coding Agent

**The first task is Phase 0 followed by Phase 1.**

Do not immediately implement:
- Web scrapers.
- Advanced ML models.
- Vector databases.
- Distributed infrastructure.
- Complex background processing.

First, deliver:

1. Architecture proposal.
2. Refined MVP feature checklist.
3. Design system.
4. Page and component hierarchy.
5. Normalized opportunity schema.
6. Realistic sample dataset.
7. Working React application shell.
8. Polished discovery experience.
9. Opportunity detail experience.

The React frontend is the primary deliverable for the initial FlyRank assignment.

The application should demonstrate:

- Strong component architecture.
- TypeScript usage.
- State management.
- API-ready design.
- Responsive UI.
- Reusable components.
- Form handling.
- Error and loading states.
- Good UX decisions.

The architecture should allow backend integration without requiring a frontend rewrite.

**Do not sacrifice product quality by implementing too many features superficially.**

---

# 23. Final Product Direction

Career Intelligence should evolve into a serious, maintainable software product.

Its initial purpose is to help students discover and evaluate internships.

Its long-term purpose is to become a unified platform for discovering, evaluating and managing career-building opportunities.

The project should also serve as a practical engineering environment for exploring:

- Data engineering.
- Backend systems.
- Information retrieval.
- Machine learning.
- Recommendation systems.
- LLM integration.
- Model serving.
- Production ML infrastructure.
- Observability and evaluation.

The product must remain useful independently of its educational value.

**The ultimate objective is to build a genuinely useful product while developing the engineering capabilities required to design and operate intelligent production systems.**