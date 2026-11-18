# AGENTS.md

```markdown
# AGENTS.md — Career Intelligence

## 1. Project Context

Career Intelligence is an intelligent career-opportunity discovery and evaluation platform.

The initial focus is internship discovery, with future expansion into:

- Research opportunities
- Open-source programmes
- Fellowships and scholarships
- Hackathons
- Graduate programmes
- Early-career technical roles

The project aims to combine conventional software engineering, data engineering, machine learning and LLM capabilities into a genuinely useful product.

Read `CAREER_INTELLIGENCE_PRD.md` before making significant architectural or product decisions.

The PRD defines product requirements and long-term direction. This file defines engineering conventions and agent behaviour.

---

## 2. Core Engineering Principles

Follow these principles throughout development.

### 2.1 Understand Before Implementing

- Inspect the existing repository before modifying anything.
- Understand the current architecture and dependencies.
- Identify existing reusable components and utilities.
- Avoid rewriting working code without a clear reason.
- Never assume that an existing feature is incomplete without inspecting it.

### 2.2 Prefer Fundamentals Over Abstractions

- Use straightforward implementations.
- Avoid unnecessary design patterns.
- Do not introduce abstractions without a demonstrated need.
- Avoid premature optimization.
- Prefer readable and maintainable code over clever implementations.

### 2.3 Incremental Development

- Implement one coherent feature at a time.
- Do not attempt to build the entire product in one operation.
- Respect the development phases defined in the PRD.
- Do not introduce future-phase infrastructure without justification.
- Keep the application functional after each meaningful change.

### 2.4 Engineering Quality

Prioritize:

1. Correctness
2. Security
3. Maintainability
4. Readability
5. Performance
6. Scalability

Do not sacrifice correctness for development speed.

---

## 3. Development Phase Awareness

The project follows these phases:

| Phase | Focus |
|---|---|
| Phase 0 | Product and technical foundation |
| Phase 1 | React MVP |
| Phase 2 | Backend and database |
| Phase 3 | Opportunity intelligence |
| Phase 4 | Data ingestion |
| Phase 5 | Advanced ML systems |

Before implementing a task:

1. Identify its corresponding phase.
2. Check whether required dependencies already exist.
3. Avoid implementing unrelated future-phase functionality.
4. Document any justified deviation.

### Current Initial Priority

The initial assignment focuses on the React application.

Prioritize:

- Application architecture
- Design system
- Landing page
- Discovery dashboard
- Search and filtering
- Opportunity details
- Career profile interface
- Application tracker interface

Use realistic sample data where backend functionality is not yet available.

Clearly distinguish mock functionality from implemented functionality.

---

## 4. Frontend Engineering Standards

### 4.1 Technology

Preferred stack:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- React Hook Form
- Zod

Do not add every library immediately.

Install dependencies only when required by the current implementation.

### 4.2 TypeScript

- Prefer strict TypeScript.
- Avoid `any`.
- Define explicit interfaces and types.
- Avoid unnecessary type assertions.
- Use discriminated unions for complex states where appropriate.
- Keep API response types separate from UI-specific types.

Example:

```typescript
interface Opportunity {
  id: string;
  title: string;
  organization: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite" | "unknown";
  description: string;
  applicationUrl: string;
  postedAt: string | null;
}
```

Do not use loosely typed objects when a meaningful domain type can be defined.

### 4.3 Component Architecture

Follow these principles:

- Components should have clear responsibilities.
- Keep components reasonably small.
- Extract reusable UI elements.
- Avoid deeply nested component structures.
- Separate presentation from business logic.
- Avoid unnecessary prop drilling.
- Do not create abstractions for components that are used only once unless there is a clear benefit.

Suggested organization:

```text
src/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   └── shared/
├── features/
│   ├── discovery/
│   ├── opportunities/
│   ├── profile/
│   ├── recommendations/
│   ├── applications/
│   └── dashboard/
├── hooks/
├── lib/
├── services/
├── types/
└── styles/
```

Adjust the structure when necessary, but maintain logical separation.

### 4.4 State Management

Use appropriate state management for each use case.

- React state for local UI interactions.
- Context for genuinely shared application state.
- TanStack Query for server state.
- URL search parameters for shareable search and filter state.

Do not introduce Redux or Zustand without a demonstrated requirement.

### 4.5 Forms

- Use React Hook Form where forms become sufficiently complex.
- Use Zod for validation.
- Provide clear validation messages.
- Handle submission states.
- Prevent duplicate submissions.
- Never rely exclusively on frontend validation.

### 4.6 API Integration

- Keep API calls outside presentation components.
- Centralize API configuration.
- Use typed request and response models.
- Handle loading, error and empty states.
- Avoid hardcoding API URLs throughout the application.
- Use environment variables for deployment-specific configuration.

Example:

```text
services/
├── api-client.ts
├── opportunities.service.ts
├── profile.service.ts
└── applications.service.ts
```

Never expose private API credentials in frontend environment variables.

---

## 5. UI/UX and Design Standards

The interface should feel like a professionally designed career intelligence product.

Avoid generic AI-generated dashboard aesthetics.

### 5.1 Design Philosophy

Prioritize:

- Strong visual hierarchy
- Consistent typography
- Intentional spacing
- Clear navigation
- Information density
- Restrained colour usage
- Accessible contrast
- Responsive layouts
- Functional interactions

### 5.2 Avoid Design Slop

Do not blindly generate interfaces containing:

- Excessive gradients
- Unnecessary glassmorphism
- Random glowing effects
- Oversized decorative headings
- Excessive rounded cards
- Unnecessary animations
- Fake dashboard metrics
- Generic AI-generated marketing copy
- Repetitive card layouts
- Decorative charts without meaningful data

Every visual element should have a purpose.

### 5.3 Design Consistency

- Maintain a consistent spacing system.
- Use design tokens where appropriate.
- Reuse buttons, inputs and other common elements.
- Maintain consistent border radii.
- Follow a coherent typography scale.
- Keep icons consistent.
- Avoid mixing unrelated visual styles.

### 5.4 Responsiveness

Support:

- Desktop
- Tablet
- Mobile

Do not simply shrink desktop layouts.

Adapt navigation, filters, cards and information hierarchy to smaller screens.

### 5.5 Accessibility

- Use semantic HTML.
- Provide accessible labels.
- Maintain keyboard navigation.
- Show visible focus states.
- Ensure appropriate colour contrast.
- Avoid communicating important information through colour alone.
- Provide accessible error messages.

### 5.6 Functional Completeness

Every visible interactive element should work.

Do not implement:

- Buttons with no action.
- Search bars that do not search.
- Fake filters.
- Non-functional navigation.
- Decorative forms that cannot submit.
- Fake notifications.
- Fake live metrics.

If functionality is not implemented, clearly communicate its status or avoid presenting it as operational.

---

## 6. Backend Engineering Standards

These standards apply when backend development begins.

### 6.1 Technology

Preferred stack:

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic
- PostgreSQL

### 6.2 Architecture

Use a modular monolith initially.

Organize code by domain responsibility.

Avoid:

- One enormous application file.
- Circular dependencies.
- Database operations inside route handlers.
- Business logic inside Pydantic schemas.
- Unnecessary microservices.

### 6.3 API Design

- Use REST conventions.
- Maintain consistent response structures.
- Validate requests.
- Return appropriate HTTP status codes.
- Handle exceptions centrally where practical.
- Version APIs.
- Document endpoints through OpenAPI.
- Implement pagination for collection endpoints.

### 6.4 Database

- Use migrations for schema changes.
- Define appropriate foreign keys.
- Add indexes based on actual query requirements.
- Use transactions where necessary.
- Avoid unnecessary database queries.
- Prevent duplicate records using appropriate constraints.
- Preserve source provenance.

Never modify the production database schema manually without migrations.

### 6.5 Authentication and Authorization

- Enforce authorization server-side.
- Verify resource ownership.
- Never trust user IDs supplied by the frontend.
- Protect private application notes.
- Avoid exposing authentication tokens.
- Use secure cookie/token practices appropriate to the selected authentication provider.

---

## 7. AI and ML Engineering Standards

AI capabilities must be implemented carefully.

### 7.1 General Rules

- Do not use LLMs for deterministic operations.
- Validate model outputs.
- Handle provider failures.
- Apply timeouts.
- Use bounded retries.
- Avoid unnecessary inference calls.
- Keep API keys server-side.
- Track important model and prompt versions.

### 7.2 Structured Outputs

LLM outputs must be validated against predefined schemas.

Never assume that model-generated JSON is valid.

Handle:

- Missing fields
- Invalid types
- Unexpected values
- Malformed responses
- Provider timeouts

### 7.3 Prompt Injection

External internship descriptions must be treated as untrusted data.

Instructions embedded in opportunity descriptions must never override system instructions.

Do not provide external listing content with unrestricted authority over tools or application operations.

### 7.4 Trust Assessment

Never allow an LLM to independently declare an organization legitimate or fraudulent.

Trust assessments must be supported by observable evidence.

Distinguish:

- Verified facts
- Unverified claims
- Heuristic indicators
- Model-generated interpretations

Never present uncertainty as certainty.

### 7.5 ML Development

When introducing ML models:

1. Define the problem.
2. Establish a simple baseline.
3. Identify suitable data.
4. Define evaluation metrics.
5. Train or integrate the model.
6. Evaluate against the baseline.
7. Document limitations.
8. Monitor performance.

Do not introduce complex models without measurable justification.

### 7.6 Reproducibility

Where applicable:

- Fix random seeds.
- Record model versions.
- Track dataset versions.
- Document preprocessing.
- Store evaluation results.
- Separate training and inference code.

---

## 8. Data Engineering Standards

Opportunity data comes from multiple external sources.

Maintain:

- Source attribution
- Original URLs
- Discovery timestamps
- Last-checked timestamps
- Normalized values
- Source identifiers
- Data provenance

### Data Quality

Handle:

- Missing values
- Duplicate listings
- Inconsistent dates
- Different compensation formats
- Organization name variations
- Invalid URLs
- Expired listings

Do not silently discard important source information during normalization.

### Source Compliance

- Respect source terms and access policies.
- Prefer documented APIs and RSS feeds.
- Respect rate limits.
- Do not bypass authentication or CAPTCHAs.
- Do not collect unnecessary personal information.

### Idempotency

Repeated ingestion of the same source record should not create uncontrolled duplicates.

Design ingestion operations to be idempotent wherever practical.

---

## 9. Security Standards

Security is not an optional later enhancement.

Mandatory rules:

1. Never commit API keys or credentials.
2. Never expose backend secrets in frontend code.
3. Validate all external input.
4. Enforce authorization on private resources.
5. Protect user data.
6. Avoid logging sensitive information.
7. Use HTTPS in production.
8. Apply rate limits to expensive operations.
9. Handle uploaded files safely if uploads are introduced.
10. Keep dependencies updated.

Use `.env.example` to document required environment variables without including actual credentials.

---

## 10. Error Handling and Reliability

Applications must fail gracefully.

### Frontend

Provide:

- Loading states
- Error states
- Empty states
- Retry options where appropriate
- Form validation feedback
- Success feedback

### Backend

- Handle external service failures.
- Set appropriate timeouts.
- Avoid leaking stack traces.
- Log useful diagnostic information.
- Use consistent error responses.

### AI Providers

The application must remain usable when an AI provider is unavailable.

Opportunity discovery, saved opportunities and application tracking should not depend on successful LLM inference.

---

## 11. Testing Standards

Add tests whenever meaningful functionality is introduced.

### Frontend

- Component tests
- Form validation tests
- Interaction tests
- Routing tests
- End-to-end tests for critical journeys

### Backend

- Unit tests
- API tests
- Authorization tests
- Database integration tests
- Business logic tests

### AI/ML

- Schema validation tests
- Prompt injection tests
- Evaluation dataset tests
- Model performance tests

### General Rule

Do not claim tests passed unless they were actually executed.

If tests cannot be executed, explicitly mention that limitation.

---

## 12. Documentation Standards

Maintain documentation as the project evolves.

Important files:

```text
CAREER_INTELLIGENCE_PRD.md
AGENTS.md
README.md
docs/
├── ARCHITECTURE.md
├── API.md
└── decisions/
```

Update documentation when:

- Architecture changes.
- Dependencies change significantly.
- API contracts change.
- Environment variables are introduced.
- Deployment procedures change.
- Important technical decisions are made.

Avoid documenting hypothetical functionality as implemented functionality.

---

## 13. Git and Version Control

Follow clean Git practices.

### Commit Messages

Use descriptive commit messages.

Examples:

feat: implement opportunity discovery page

feat: add opportunity filtering

fix: correct application status update

refactor: extract opportunity card component

test: add trust assessment tests

docs: update architecture documentation

### General Rules

- Keep commits focused.
- Avoid committing generated build artifacts.
- Never commit secrets.
- Do not overwrite unrelated user changes.
- Inspect Git status before destructive operations.
- Do not force-push unless explicitly authorized.

---

## 14. Dependency Management

Before installing a dependency:

1. Check whether the functionality already exists.
2. Consider whether the dependency is necessary.
3. Evaluate maintenance and security.
4. Prefer established libraries.
5. Avoid overlapping dependencies.

Do not install packages merely because they are commonly used in AI-generated projects.

---

## 15. Coding Agent Workflow

For every assigned task, follow this workflow.

### Step 1: Understand

- Read the relevant documentation.
- Inspect the codebase.
- Identify dependencies.
- Understand existing conventions.

### Step 2: Plan

For non-trivial tasks, provide a concise implementation plan.

Identify:
- Files to modify.
- Components affected.
- Dependencies required.
- Potential risks.
- Tests required.

### Step 3: Implement

- Make focused changes.
- Follow existing conventions.
- Avoid unrelated modifications.
- Keep functionality testable.

### Step 4: Verify

Run applicable:

- Tests
- Type checks
- Linters
- Build commands

Fix introduced errors before declaring completion.

### Step 5: Report

Provide a concise implementation summary:

- What was implemented.
- Files changed.
- Important technical decisions.
- Tests executed and results.
- Known limitations.
- Suggested next step.

Do not claim completion when functionality is only partially implemented.

---

## 16. Autonomous Agent Boundaries

The agent may independently:

- Inspect files.
- Refactor code within the requested scope.
- Add tests.
- Improve documentation.
- Fix obvious bugs.
- Improve accessibility.
- Improve error handling.

The agent must seek clarification before:

- Introducing a major architectural change.
- Changing authentication strategy.
- Removing significant functionality.
- Introducing a new paid service.
- Collecting additional personal information.
- Integrating a source with unclear access permissions.
- Making irreversible data changes.
- Performing destructive Git operations.

Do not assume permission to deploy publicly, spend money or expose private data.

---

## 17. Definition of Done

A feature is complete only when:

- Requirements are satisfied.
- Implementation follows project conventions.
- Relevant tests pass.
- Loading and error states are handled.
- Accessibility has been considered.
- Responsive behavior has been checked where applicable.
- Documentation is updated when necessary.
- No unintended functionality has been broken.

A visually complete component is not necessarily a functionally complete feature.

---

## 18. Final Engineering Philosophy

Career Intelligence should be developed as a serious software product.

The goal is not to maximize the amount of code generated.

The goal is to build a useful, reliable and maintainable system.

Prefer understanding over blindly generating code.

Prefer measurable improvements over impressive-looking claims.

Prefer simple solutions over unnecessary complexity.

Treat AI as an engineering tool, not a replacement for engineering judgment.

Every implementation should contribute meaningfully to the product.
```

---

## Recommended repository structure

Once you initialize the repository, keep these files at the root:

career-intelligence/
│
├── AGENTS.md
├── CAREER_INTELLIGENCE_PRD.md
├── README.md
├── .gitignore
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── decisions/
│
├── apps/
│   ├── web/
│   └── api/
│
└── scripts/