# CareerRadar — Job Discovery, Scam Protection & Application Tracker

CareerRadar is a production-ready career intelligence platform that helps students and jobseekers evaluate internships and early-career roles, spot scam listings, check their skill match, and track applications in one clean workspace.

---

## Key Capabilities

1. **Sign In with Google**:
   - Google OAuth 2.0 / OIDC authentication backed by HMAC-SHA256 signed JWT sessions.
   - Every user starts with a clean, private workspace (zero pre-filled dummy jobs or fake profiles) with full JSON data export and one-click account deletion.
2. **Instant Job Safety & Scam Check**:
   - Evaluates job postings for upfront registration/training fees (`FEE_REQUIRED`), sensitive credential requests (`CREDENTIAL_HARVESTING`), brand impersonation from free email domains (`BRAND_IMPERSONATION_RISK`), external Google Forms/Telegram links, and adversarial prompt-injection attempts.
3. **Clear Skill-Match & Gap Analysis**:
   - Compares job requirements against your explicitly listed skills and project experience, showing which skills you already have and which skills to brush up on.
4. **End-to-End Application Tracker**:
   - Bookmark jobs, track applications from *Interested* and *Applied* through *Assessment*, *Interview*, and *Offer*, monitor upcoming deadlines, and record private notes.
5. **Compliant Ingestion, Deduplication & Hybrid Semantic Search**:
   - Normalizes organization names and URLs, merges cross-source duplicates without losing provenance, and supports hybrid lexical + semantic concept retrieval.

---

## Repository Structure

```text
careerintelligence/
├── AGENTS.md                       # Engineering standards and agent operating principles
├── CAREER_INTELLIGENCE_PRD.md      # Product Requirements Document (PRD)
├── README.md                       # Startup, configuration, and verification guide
├── .env.example                    # Environment configuration template
├── docs/
│   ├── ARCHITECTURE.md             # System architecture and design specification
│   ├── API.md                      # REST API contracts (/api/v1/*)
│   ├── TESTING_AND_AUDIT.md        # Formal testing criteria and security audit report
│   └── decisions/                  # Architecture Decision Records (ADRs)
├── apps/
│   ├── web/                        # React + TypeScript + Vite + Tailwind CSS frontend
│   └── api/                        # Python + FastAPI + SQLAlchemy 2.0 + Alembic backend
└── scripts/
    └── verify.sh                   # Full-stack verification & audit runner
```

---

## How to Start the Application

### Prerequisites
- **Node.js** `>= 20.x` (or `>= 18.19`) and **npm** `>= 9.x`
- **Python** `>= 3.11`

---

### Step 1: Configure Environment Variables

Copy `.env.example` to `.env` in the repository root (and/or inside `apps/api/.env`):

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

To enable live redirects to Google OAuth 2.0 sign-in, add your Google OAuth client credentials in `apps/api/.env`:
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` (Redirect URI: `http://localhost:5173/auth/callback?provider=google`)

*(Note: When running locally before Google OAuth client secrets are configured, clicking **Continue with Google** on `/login` automatically provides a direct Google identity sign-in step so you can sign in and use the full platform immediately.)*

---

### Step 2: Start the Backend API (`apps/api`)

Open a terminal and run:

```bash
cd apps/api

# 1. Create virtual environment and install dependencies (if not already installed)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2. Apply database migrations
.venv/bin/alembic upgrade head

# 3. Start the FastAPI server on http://localhost:8000
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- **Backend API Base URL**: `http://localhost:8000/api/v1`
- **Interactive OpenAPI Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

---

### Step 3: Start the Frontend Web Application (`apps/web`)

Open a second terminal and run:

```bash
cd apps/web

# 1. Install frontend packages
npm install

# 2. Start the Vite development server on http://localhost:5173
npm run dev
```

Open **`http://localhost:5173`** in your browser:
1. Click **Sign In** and choose **Continue with Google**.
2. Visit **My Skills & Profile (`/profile`)** to add your skills and education.
3. Visit **Find & Check Jobs (`/discover`)** and click **Check / Add a Job Listing** to paste any job post and inspect its safety and skill-match breakdown.

---

## Running the Test & Audit Suite

To execute all frontend and backend type checks, unit/integration tests, database migrations, and production build checks in one command:

```bash
bash scripts/verify.sh
```

Or run them individually:

```bash
# Frontend checks (TypeScript + 11 Vitest unit/journey tests + Vite production build)
cd apps/web
npm run typecheck
npm test
npm run build

# Backend checks (Alembic migrations + 10 Pytest API, OAuth, ownership & security tests)
cd ../api
.venv/bin/alembic upgrade head
.venv/bin/pytest -v
```
