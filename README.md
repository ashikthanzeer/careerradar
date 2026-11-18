# CareerRadar — Job Discovery, Scam Protection & Application Tracker

CareerRadar is a production-ready career intelligence platform that helps students and jobseekers evaluate internships and early-career roles, spot scam listings, check their skill match, and track applications in one clean workspace.

---

## Key Capabilities

1. **Sign In with Google (Better Auth + Persistent Device Sessions)**:
   - Entry at `/` opens the Google login interface (`<LoginPage />`) when signed out and automatically redirects signed-in users to **Find & Check Jobs (`/discover`)**.
   - Better Auth-compatible routes (`/api/auth/sign-in/social`, `/api/auth/callback/google`, `/api/auth/get-session`, `/api/auth/sign-out`) alongside `/api/v1/auth/*` issue 30-day HMAC-SHA256 signed JWTs stored in both `better-auth.session_token` cookies and device `localStorage`, keeping users signed in across browser refreshes and server restarts.
   - Every user starts with a clean, private workspace (zero pre-filled dummy jobs or fake profiles) with full JSON data export and one-click account deletion.
2. **Job Link Auto-Fetch & Live Public Job Board Sync**:
   - Paste a job URL from LinkedIn, Internshala, Indeed, Greenhouse, Lever, Ashby, or a company careers page (`POST /api/v1/opportunities/extract-url`) to extract Schema.org JSON-LD `JobPosting`, platform DOM/OpenGraph tags, and URL-slug metadata fallbacks when boards are auth-walled.
   - Sync real remote/tech job listings on demand from public Remotive and Arbeitnow feeds (`POST /api/v1/ingestion/fetch-live`) into your safety & skill-match pipeline.
3. **Instant Job Safety & Scam Check**:
   - Evaluates job postings for upfront registration/training fees (`FEE_REQUIRED`), sensitive credential requests (`CREDENTIAL_HARVESTING`), brand impersonation from free email domains (`BRAND_IMPERSONATION_RISK`), external Google Forms/Telegram links, and adversarial prompt-injection attempts.
4. **Clear Skill-Match & Gap Analysis**:
   - Compares job requirements against your explicitly listed skills and project experience, showing which skills you already have and which skills to brush up on.
5. **End-to-End Application Tracker**:
   - Bookmark jobs, track applications from *Interested* and *Applied* through *Assessment*, *Interview*, and *Offer*, monitor upcoming deadlines, and record private notes.
6. **Compliant Ingestion, Deduplication & Hybrid Semantic Search**:
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

Copy `.env.example` to `.env` in the repository root (`apps/api` automatically loads the repository-root `.env` as well as `apps/api/.env` if present):

```bash
cp .env.example .env
```

To enable live redirects to Google OAuth 2.0 sign-in, add your Google OAuth client credentials in `.env`. See [`.env.example`](./.env.example) for the deployment segregation between Frontend (`apps/web`) and Backend (`apps/api`) environment variables:

- **Frontend (`apps/web` — static host / Vercel / Netlify)**:
  - `VITE_API_BASE_URL` (and optional `VITE_DATA_MODE`) — never put secret API keys in `VITE_*` variables.
- **Backend (`apps/api` — FastAPI server host)**:
  - Database: `DATABASE_URL`, `DIRECT_URL` (PostgreSQL/Neon or local SQLite fallback)
  - Runtime & CORS: `ENVIRONMENT`, `FRONTEND_URL`, `ALLOWED_ORIGINS`
  - Auth & OAuth: `JWT_SECRET_KEY`, `JWT_EXPIRE_MINUTES`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - AI Extraction (Groq — server-side only): `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_API_BASE_URL`

*(Note: When running locally without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, clicking **Continue with Google** provides a direct local identity sign-in step so you can still test all platform features. Also, if `DATABASE_URL` points to PostgreSQL without `psycopg`/`psycopg2` installed in `.venv`, `apps/api` automatically logs a warning and uses persistent local SQLite `sqlite:///./career_intelligence.db`.)*

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

Open **`http://localhost:5173`** in your browser (unauthenticated visitors land directly on the Google login interface at `/`; signed-in users are automatically taken to `/discover` and stay signed in across browser refreshes):
1. Click **Continue with Google** to sign in and persist your 30-day session on the device.
2. Visit **My Skills & Profile (`/profile`)** to add your skills and education.
3. Visit **Find & Check Jobs (`/discover`)** to paste any LinkedIn, Internshala, Indeed, Greenhouse, Lever, Ashby, or company job URL to auto-fetch details, click **Fetch Live Jobs** to sync public Remotive/Arbeitnow roles, or open **Check / Add a Job Listing** to inspect scam indicators and your skill-match breakdown.

---

## Running the Test & Audit Suite

To execute all frontend and backend type checks, unit/integration tests, database migrations, and production build checks in one command:

```bash
bash scripts/verify.sh
```

Or run them individually:

```bash
# Frontend checks (TypeScript + 14 Vitest unit/journey tests across 3 files + Vite production build)
cd apps/web
npm run typecheck
npm test
npm run build

# Backend checks (Alembic migrations + 16 Pytest API, Better Auth, URL extractor, ownership & security tests across 5 files)
cd ../api
.venv/bin/alembic upgrade head
.venv/bin/pytest -v
```
