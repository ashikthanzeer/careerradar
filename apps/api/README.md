# CareerRadar Backend (`apps/api`) — Phase 2 & Phase 3 Modular Monolith

This service implements **Phase 2 (Backend & Database Integration)** and **Phase 3 (Opportunity Intelligence)** of CareerRadar per `CAREER_INTELLIGENCE_PRD.md` (§6, §10, §13, §15, §18) and `AGENTS.md` (§6, §7, §9).

## Architecture & Modules

```text
apps/api/
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/0001_initial_schema.py
├── pyproject.toml
├── requirements.txt
├── app/
│   ├── main.py                      # FastAPI entrypoint, CORS, lifespan seeding, /health
│   ├── seed.py                      # Idempotent seeder for 9 curated sample opportunities
│   ├── core/
│   │   ├── config.py                # Pydantic Settings (DATABASE_URL, GROQ_API_KEY, GROQ_MODEL)
│   │   ├── database.py              # SQLAlchemy 2.0 engine & session management
│   │   ├── auth.py                  # Bearer token auth & server-side user resolution
│   │   └── errors.py                # Centralized error envelopes
│   ├── models/
│   │   └── entities.py              # Relational tables from PRD §10
│   ├── schemas/
│   │   └── api_schemas.py           # Strict Pydantic v2 schemas
│   └── modules/
│       ├── discovery/               # GET/POST /opportunities, /recommendations, /analyze
│       ├── profile/                 # GET/PUT /profile & UserSkill synchronization
│       ├── applications/            # /saved-opportunities & /applications with ownership guard
│       └── intelligence/
│           ├── sanitizer.py         # Prompt-injection detection & untrusted text sanitization
│           ├── trust_engine.py      # Deterministic risk & credibility rule evaluator
│           ├── extractor.py         # Groq OpenAI-compatible JSON extractor + deterministic fallback
│           └── matching_engine.py   # Explainable compatibility & skill-gap engine
└── tests/
    ├── conftest.py
    ├── test_api_opportunities.py
    ├── test_api_profile_and_applications.py
    └── test_phase3_intelligence_and_security.py
```

## Running Locally

```bash
cd apps/api
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Running Automated Tests

```bash
cd apps/api
.venv/bin/pytest -v
```
