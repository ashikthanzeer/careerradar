# CareerRadar (Career Intelligence) — REST API Specification (`/api/v1`)

This document specifies the HTTP contracts between the React frontend (`apps/web`) and the FastAPI backend (`apps/api`). In Phase 1, `src/services/*.service.ts` implements these exact signatures against local deterministic engines and storage.

---

## 1. Conventions & Envelopes

- **Base URL**: `/api/v1`
- **Content-Type**: `application/json`
- **Timestamps**: ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ssZ`)

### Paginated Collection Envelope
```json
{
  "items": [],
  "total": 12,
  "page": 1,
  "pageSize": 6,
  "totalPages": 2
}
```

### Standard Error Envelope
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Opportunity opp_999 was not found.",
    "details": null
  }
}
```

---

## 2. Endpoints

### 2.1 Health
- **`GET /health`**
  - Returns service status, current version, and database connectivity check.

### 2.2 Opportunities & Intelligence
- **`GET /api/v1/opportunities`**
  - **Query Parameters**:
    - `q` (string, optional): Full-text search across title, organization, description, and skills.
    - `opportunityType` (`internship` | `research` | `fellowship` | `open_source` | `hackathon` | `graduate`, optional)
    - `roleCategory` (string, optional): e.g., `software_engineering`, `machine_learning`, `data_science`, `systems_infrastructure`, `security`, `research`.
    - `workMode` (`remote` | `hybrid` | `onsite`, optional)
    - `trustFilter` (`all` | `low_risk_only` | `hide_elevated_risk`, optional)
    - `paidOnly` (boolean, optional)
    - `skill` (string, optional): Canonical skill filter.
    - `source` (string, optional): Provenance source filter.
    - `sortBy` (`relevance` | `deadline_asc` | `posted_desc` | `stipend_desc`, optional)
    - `page` (integer, default `1`)
    - `pageSize` (integer, default `6`)
  - **Response**: `200 OK` with `PaginatedResponse<EnrichedOpportunity>`

- **`GET /api/v1/opportunities/{opportunity_id}`**
  - **Response**: `200 OK` with full `EnrichedOpportunity` including `organization`, `sources`, `analysis`, `trustAssessment`, and profile-computed `recommendation` + `skillGap`.

- **`POST /api/v1/opportunities`**
  - **Request Body**: `CreateOpportunityInput` (title, organizationName, officialWebsite, recruiterEmail, location, workMode, opportunityType, roleCategory, description, applicationUrl, sourceName, compensationMin, compensationMax, compensationCurrency, duration, deadline).
  - **Behavior**: Normalizes fields, runs deterministic `TrustAssessment` rules and structured intelligence extraction, persists the record, and returns `201 Created` with the `EnrichedOpportunity`.

- **`POST /api/v1/opportunities/{opportunity_id}/analyze`**
  - Triggers or refreshes structured extraction (`OpportunityAnalysis`) and `TrustAssessment`.

- **`GET /api/v1/opportunities/{opportunity_id}/analysis`**
  - Returns schema-validated `OpportunityAnalysis`.

- **`GET /api/v1/opportunities/{opportunity_id}/trust-assessment`**
  - Returns `TrustAssessment` and `TrustEvidence[]`.

### 2.3 Saved Opportunities
- **`GET /api/v1/saved-opportunities`**
  - Returns all saved opportunities for the authenticated user.
- **`POST /api/v1/opportunities/{opportunity_id}/save`**
  - Bookmarks an opportunity (`SavedOpportunity`).
- **`DELETE /api/v1/opportunities/{opportunity_id}/save`**
  - Removes bookmark.

### 2.4 Applications
- **`GET /api/v1/applications`**
  - Returns user's tracked applications ordered by upcoming deadline and recent activity.
- **`POST /api/v1/applications`**
  - Creates a tracked application record (`status`, `appliedAt`, `deadline`, `nextAction`, `privateNotes`).
- **`PATCH /api/v1/applications/{application_id}`**
  - Updates application status, dates, next action, or private notes.
- **`DELETE /api/v1/applications/{application_id}`**
  - Deletes an application record.

### 2.5 Career Profile & Recommendations
- **`GET /api/v1/profile`**
  - Retrieves the user's `CareerProfile` and `UserSkill[]`.
- **`PUT /api/v1/profile`**
  - Validates and updates the user's `CareerProfile` and `UserSkill[]`.
- **`GET /api/v1/recommendations`**
  - Returns ranked opportunities with explainable match breakdowns (`RecommendationMatch` & `SkillGapAnalysis`).

