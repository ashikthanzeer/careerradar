import base64
from datetime import datetime, timedelta, timezone
import io
import json
from typing import Any
import zipfile
import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.entities import UserFetchState
from tests.conftest import login_with_oauth


def _make_docx_base64(text: str) -> str:
    buf = io.BytesIO()
    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
    )
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", doc_xml)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_resume_docx_and_text_extraction(client: TestClient) -> None:
    headers = login_with_oauth(client, provider="google", email="resume.user@gmail.com")

    docx_b64 = _make_docx_base64(
        "Aarav Sharma B.Tech Computer Science IIT Madras 2027 "
        "Built distributed systems in Go, Python, FastAPI, Docker, Kubernetes, PostgreSQL."
    )
    res_docx = client.post(
        "/api/v1/profile/extract-resume",
        headers=headers,
        json={"filename": "aarav_cv.docx", "fileBase64": docx_b64},
    )
    assert res_docx.status_code == 200
    body = res_docx.json()
    skill_names = {s["canonicalName"] for s in body["skills"]}
    assert {"Go", "Python", "FastAPI", "Docker", "Kubernetes", "PostgreSQL"}.issubset(
        skill_names
    )
    assert all(s["sourceType"] == "resume" for s in body["skills"])
    assert "systems_infrastructure" in body["preferredRoles"]


def test_linkedin_and_portfolio_extraction(
    client: TestClient, monkeypatch: Any
) -> None:
    headers = login_with_oauth(client, provider="google", email="links.user@gmail.com")

    class _FakeHttpResp:
        def __init__(self, status_code: int, text: str) -> None:
            self.status_code = status_code
            self.text = text

    def _fake_get(self: httpx.Client, url: str, **kwargs: Any) -> _FakeHttpResp:
        if "linkedin.com" in url:
            return _FakeHttpResp(
                200,
                "<html><head><title>Meera Krishnan | LinkedIn</title></head>"
                "<body>Machine Learning &amp; PyTorch engineer building RAG systems in Python.</body></html>",
            )
        return _FakeHttpResp(
            200,
            "<html><head><title>Meera Krishnan Portfolio</title></head>"
            "<body><h1>Projects</h1><p>TypeScript, React, SQL, and Docker deployment pipelines.</p></body></html>",
        )

    monkeypatch.setattr(httpx.Client, "get", _fake_get)

    res = client.post(
        "/api/v1/profile/extract-sources",
        headers=headers,
        json={
            "linkedinUrl": "https://www.linkedin.com/in/meera-krishnan",
            "portfolioUrl": "https://meerakrish.dev",
        },
    )
    assert res.status_code == 200
    data = res.json()
    skill_names = {s["canonicalName"] for s in data["skills"]}
    assert {"Machine Learning", "PyTorch", "Python", "TypeScript", "React", "SQL", "Docker"}.issubset(
        skill_names
    )
    assert "AI & Machine Learning" in data["preferredDomains"]
    assert data["linkedinUrl"] == "https://www.linkedin.com/in/meera-krishnan"
    assert data["portfolioUrl"] == "https://meerakrish.dev"


def test_profile_save_auto_fetch_tier1_shared_catalog_and_daily_limit(
    client: TestClient, monkeypatch: Any
) -> None:
    recent_iso = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")

    class _FakeResp:
        def __init__(self, payload: Any, status_code: int = 200) -> None:
            self.status_code = status_code
            self._payload = payload
            self.text = json.dumps(payload)

        def json(self) -> Any:
            return self._payload

    orig_get = httpx.Client.get

    def _fake_get(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)
        if "boards-api.greenhouse.io/v1/boards/cloudflare" in url:
            return _FakeResp(
                {
                    "jobs": [
                        {
                            "id": 9001,
                            "title": "Systems Software Intern (Python & Rust)",
                            "content": "<p>Build distributed edge proxies in Python, Rust, Docker, and Linux.</p>",
                            "updated_at": recent_iso,
                            "location": {"name": "Remote"},
                            "absolute_url": "https://boards.greenhouse.io/cloudflare/jobs/9001",
                        }
                    ]
                }
            )
        if "arbeitnow.com" in url:
            return _FakeResp({"data": []})
        if "themuse.com" in url:
            return _FakeResp({"results": []})
        if "himalayas.app" in url:
            return _FakeResp({"jobs": []})
        if "remotive.com" in url:
            return _FakeResp({"jobs": []})
        return _FakeResp({"jobs": []})

    monkeypatch.setattr(httpx.Client, "get", _fake_get)

    headers_a = login_with_oauth(client, provider="google", email="alice.dev@gmail.com")
    profile_a = client.get("/api/v1/profile", headers=headers_a).json()
    assert profile_a["triggersRemainingToday"] == 2

    # Saving profile auto-triggers fetch #1 of 2 and persists Tier-1 Cloudflare + 30 native + 20 worldwide jobs
    profile_a["nativeCountry"] = "India"
    profile_a["preferredLocations"] = ["Bengaluru", "Remote"]
    profile_a["preferredDomains"] = ["Developer Tools & Cloud"]
    profile_a["skills"] = [
        {
            "id": "sk_1",
            "canonicalName": "Python",
            "category": "language",
            "proficiency": "advanced",
            "yearsExperience": 2.0,
            "sourceType": "resume",
            "sourceReference": "Resume",
        }
    ]
    saved_a = client.put("/api/v1/profile", headers=headers_a, json=profile_a)
    assert saved_a.status_code == 200
    assert saved_a.json()["onboardingCompleted"] is True
    assert saved_a.json()["nativeCountry"] == "India"
    assert saved_a.json()["triggersUsedToday"] == 1
    assert saved_a.json()["triggersRemainingToday"] == 1

    # Shared catalog check: a different user (Bob) sees the Tier-1 Cloudflare role stored in DB
    headers_b = login_with_oauth(client, provider="google", email="bob.shared@gmail.com")
    bob_opps = client.get("/api/v1/opportunities?pageSize=60", headers=headers_b).json()
    assert bob_opps["total"] >= 50
    assert any(
        item["organization"]["name"] == "Cloudflare"
        and "Systems Software Intern" in item["title"]
        for item in bob_opps["items"]
    )

    native_opps = client.get(
        "/api/v1/opportunities?region=native&pageSize=50", headers=headers_a
    ).json()
    worldwide_opps = client.get(
        "/api/v1/opportunities?region=worldwide&pageSize=50", headers=headers_a
    ).json()
    assert native_opps["total"] >= 30
    assert worldwide_opps["total"] >= 20

    # Trigger #2 of 2 (manual) succeeds, guarantees >= 30 native + >= 20 worldwide, and consumes remaining trigger
    second_fetch = client.post(
        "/api/v1/ingestion/fetch-for-profile",
        headers=headers_a,
        json={"query": "python", "limit": 50, "triggerSource": "manual"},
    )
    assert second_fetch.status_code == 200
    second_data = second_fetch.json()
    assert second_data["triggered"] is True
    assert second_data["nativeCountry"] == "India"
    assert second_data["nativeCount"] >= 30
    assert second_data["worldwideCount"] >= 20
    assert second_data["report"]["totalProcessed"] >= 50
    assert second_data["triggersUsedToday"] == 2
    assert second_data["triggersRemainingToday"] == 0

    # Trigger #3 on the same day is blocked cleanly by max 2/day limit
    third_fetch = client.post(
        "/api/v1/ingestion/fetch-for-profile",
        headers=headers_a,
        json={"query": "python", "limit": 6, "triggerSource": "manual"},
    )
    assert third_fetch.status_code == 200
    assert third_fetch.json()["triggered"] is False
    assert third_fetch.json()["rateLimited"] is True
    assert third_fetch.json()["triggersRemainingToday"] == 0


def test_stale_login_triggers_after_two_days_and_skips_when_recent(
    client: TestClient, db_session: Session, monkeypatch: Any
) -> None:
    orig_get = httpx.Client.get

    def _empty_get(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)

        class _R:
            status_code = 200
            text = "{}"

            @staticmethod
            def json() -> dict[str, Any]:
                return {"jobs": [], "data": [], "results": []}

        return _R()

    monkeypatch.setattr(httpx.Client, "get", _empty_get)

    headers = login_with_oauth(client, provider="google", email="stale.user@gmail.com")
    profile = client.get("/api/v1/profile", headers=headers).json()
    client.put("/api/v1/profile", headers=headers, json=profile)

    # Immediate re-login (< 2 days) must NOT trigger a stale-login fetch
    state_info = client.get("/api/v1/auth/oauth/google/authorize").json()
    recent_login = client.post(
        "/api/v1/auth/oauth/google/callback",
        json={"state": state_info["state"], "email": "stale.user@gmail.com", "displayName": "Stale User"},
    ).json()
    assert recent_login["staleLoginFetchTriggered"] is False

    # Move last_job_fetch_at back by 3 days and yesterday's quota -> re-login SHOULD trigger
    three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    fetch_state = db_session.query(UserFetchState).filter(
        UserFetchState.user_id == profile["userId"]
    ).first()
    assert fetch_state is not None
    fetch_state.last_job_fetch_at = three_days_ago
    fetch_state.fetch_date_utc = yesterday
    fetch_state.fetch_count_today = 2
    db_session.commit()

    state_info_2 = client.get("/api/v1/auth/oauth/google/authorize").json()
    stale_login = client.post(
        "/api/v1/auth/oauth/google/callback",
        json={"state": state_info_2["state"], "email": "stale.user@gmail.com", "displayName": "Stale User"},
    ).json()
    assert stale_login["staleLoginFetchTriggered"] is True


def test_expired_deadlines_and_90_day_no_deadline_items_skipped_and_deduplicated(
    client: TestClient,
) -> None:
    headers = login_with_oauth(client, provider="google", email="freshness@gmail.com")

    old_95_days = (datetime.now(timezone.utc) - timedelta(days=95)).strftime("%Y-%m-%dT%H:%M:%SZ")
    yesterday_date = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    recent_post = (datetime.now(timezone.utc) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")

    batch = [
        {
            "sourceName": "Company Career Board",
            "externalId": "exp_past_dl",
            "title": "Expired Deadline Intern",
            "organizationName": "OldCorp",
            "location": "Remote",
            "deadline": yesterday_date,
            "applicationUrl": "https://oldcorp.example/jobs/1",
            "description": "Python and SQL engineering role with an expired deadline.",
            "httpReachable": True,
        },
        {
            "sourceName": "Company Career Board",
            "externalId": "exp_95_days",
            "title": "Stale 95 Day Listing",
            "organizationName": "StaleCorp",
            "location": "Remote",
            "postedAt": old_95_days,
            "deadline": None,
            "applicationUrl": "https://stalecorp.example/jobs/2",
            "description": "Python and Docker role open over 90 days without a deadline.",
            "httpReachable": True,
        },
        {
            "sourceName": "Stripe Careers (Greenhouse)",
            "externalId": "valid_stripe_1",
            "title": "Backend Engineering Intern",
            "organizationName": "Stripe",
            "officialWebsite": "https://stripe.com",
            "location": "Remote",
            "postedAt": recent_post,
            "deadline": future_date,
            "applicationUrl": "https://stripe.com/jobs/backend-intern-100",
            "description": "Work on distributed payment APIs in Python, Go, SQL, and Docker.",
            "httpReachable": True,
        },
    ]

    ingest_res = client.post("/api/v1/ingestion/run", json=batch).json()
    assert ingest_res["skippedExpired"] == 2
    assert ingest_res["newOpportunitiesCreated"] == 1

    # Submitting the exact same Stripe role URL with UTM params must deduplicate cleanly
    dup_submit = client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "Backend Engineering Intern",
            "organizationName": "Stripe",
            "officialWebsite": "https://stripe.com",
            "opportunityType": "internship",
            "roleCategory": "software_engineering",
            "domain": "Fintech & Payments",
            "location": "Remote",
            "workMode": "remote",
            "duration": "6 months",
            "deadline": future_date,
            "applicationUrl": "https://stripe.com/jobs/backend-intern-100?utm_source=linkedin",
            "sourceName": "LinkedIn",
            "description": "Work on distributed payment APIs in Python, Go, SQL, and Docker.",
        },
    )
    assert dup_submit.status_code == 201
    listed = client.get("/api/v1/opportunities", headers=headers).json()
    assert listed["total"] == 1
    assert len(dup_submit.json()["sources"]) == 2


def test_html_entity_descriptions_are_cleaned_and_non_tech_jobs_filtered(
    client: TestClient,
) -> None:
    from app.modules.ingestion.normalizer import is_technical_career_role

    assert is_technical_career_role("Market Access (Senior) Manager, EU Center") is False
    assert is_technical_career_role("Software Engineering Intern", ["Python"]) is True

    headers = login_with_oauth(client, provider="google", email="clean.fmt@gmail.com")
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")

    encoded_html = (
        '&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;'
        '&lt;span style=&quot;text-decoration: underline;&quot;&gt;&lt;strong&gt;'
        'Mavericks Wanted&lt;/strong&gt;&lt;/span&gt; Build distributed Python and Docker APIs.'
        '&lt;/p&gt;&lt;/div&gt;'
    )
    res = client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "Backend Platform Engineer",
            "organizationName": "CloudExample",
            "officialWebsite": "https://cloudexample.dev",
            "opportunityType": "graduate",
            "roleCategory": "software_engineering",
            "domain": "Developer Tools & Cloud",
            "location": "Remote",
            "workMode": "remote",
            "duration": "Full-time",
            "deadline": future_date,
            "applicationUrl": "https://cloudexample.dev/careers/backend-1",
            "sourceName": "Arbeitnow Public API",
            "description": encoded_html,
        },
    )
    assert res.status_code == 201
    created = res.json()
    assert "&lt;" not in created["analysis"]["shortSummary"]
    assert "<div" not in created["analysis"]["shortSummary"]
    assert "&quot;" not in created["analysis"]["shortSummary"]
    assert "Mavericks Wanted" in created["analysis"]["shortSummary"]
    assert created["analysis"]["locationSummary"] == "Remote"


def test_mandatory_75_percent_preference_compliance_for_remote_and_city_preferences(
    client: TestClient, monkeypatch: Any
) -> None:
    """
    Verifies that >= 75% of fetched opportunities comply with the user's job preferences:
    - When preferredLocations=["Remote"] (even if workModes allows hybrid), >= 75% overall,
      native, and worldwide jobs must match workMode=="remote", roleCategory, and domain.
    - When updated to a specific city/mode/track, >= 75% of native jobs immediately re-align.
    """
    orig_get = httpx.Client.get

    def _empty_get(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)

        class _R:
            status_code = 200
            text = "{}"

            @staticmethod
            def json() -> dict[str, Any]:
                return {"jobs": [], "data": [], "results": []}

        return _R()

    monkeypatch.setattr(httpx.Client, "get", _empty_get)

    headers = login_with_oauth(client, provider="google", email="pref.remote@gmail.com")
    profile = client.get("/api/v1/profile", headers=headers).json()
    profile["nativeCountry"] = "India"
    profile["preferredLocations"] = ["Remote"]
    profile["workModes"] = ["remote", "hybrid"]
    profile["preferredRoles"] = ["machine_learning"]
    profile["preferredDomains"] = ["AI & Machine Learning"]

    saved = client.put("/api/v1/profile", headers=headers, json=profile)
    assert saved.status_code == 200

    all_opps = client.get("/api/v1/opportunities?pageSize=100", headers=headers).json()["items"]
    assert len(all_opps) >= 50
    compliant_all = [
        o
        for o in all_opps
        if o["workMode"] == "remote"
        and o["roleCategory"] == "machine_learning"
        and o["domain"] == "AI & Machine Learning"
    ]
    assert len(compliant_all) / len(all_opps) >= 0.75

    native_opps = client.get(
        "/api/v1/opportunities?region=native&pageSize=100", headers=headers
    ).json()["items"]
    worldwide_opps = client.get(
        "/api/v1/opportunities?region=worldwide&pageSize=100", headers=headers
    ).json()["items"]
    assert len(native_opps) >= 30
    assert len(worldwide_opps) >= 20
    assert (
        sum(
            1
            for o in native_opps
            if o["workMode"] == "remote"
            and o["roleCategory"] == "machine_learning"
            and o["domain"] == "AI & Machine Learning"
        )
        / len(native_opps)
        >= 0.75
    )
    assert (
        sum(
            1
            for o in worldwide_opps
            if o["workMode"] == "remote"
            and o["roleCategory"] == "machine_learning"
            and o["domain"] == "AI & Machine Learning"
        )
        / len(worldwide_opps)
        >= 0.75
    )

    # Update profile to Hyderabad + hybrid + Security + Cybersecurity and save again
    updated_profile = saved.json()
    updated_profile["preferredLocations"] = ["Hyderabad"]
    updated_profile["workModes"] = ["hybrid"]
    updated_profile["preferredRoles"] = ["security"]
    updated_profile["preferredDomains"] = ["Cybersecurity"]
    res_updated = client.put("/api/v1/profile", headers=headers, json=updated_profile)
    assert res_updated.status_code == 200

    native_hyd = client.get(
        "/api/v1/opportunities?region=native&pageSize=100", headers=headers
    ).json()["items"]
    assert len(native_hyd) >= 30
    compliant_hyd = [
        o
        for o in native_hyd
        if "hyderabad" in o["location"].lower()
        and o["workMode"] == "hybrid"
        and o["roleCategory"] == "security"
    ]
    assert len(compliant_hyd) / len(native_hyd) >= 0.75


def test_closed_listings_filtered_and_subsequent_profile_save_avoids_refetch(
    client: TestClient, monkeypatch: Any
) -> None:
    """
    Verifies that:
    1. Closed/unavailable postings ('No longer accepting applications', 'Position has been filled')
       are excluded during ingestion.
    2. First onboarding save triggers outbound job fetching, whereas subsequent profile
       preference updates reuse/realign the locally stored catalog with ZERO outbound HTTP fetches
       and zero extra quota consumption.
    """
    headers = login_with_oauth(client, provider="google", email="cache.saver@gmail.com")
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")

    batch = [
        {
            "sourceName": "Company Career Board",
            "externalId": "closed_1",
            "title": "Software Engineering Intern",
            "organizationName": "ClosedCorp",
            "location": "Remote",
            "deadline": future_date,
            "applicationUrl": "https://closedcorp.example/jobs/1",
            "description": "Thank you for your interest. This role is no longer accepting applications.",
            "httpReachable": True,
        },
        {
            "sourceName": "Company Career Board",
            "externalId": "closed_2",
            "title": "Backend Intern",
            "organizationName": "FilledCorp",
            "location": "Remote",
            "deadline": future_date,
            "applicationUrl": "https://filledcorp.example/jobs/2",
            "description": "Sorry, this position has been filled and the job is no longer available.",
            "httpReachable": True,
        },
        {
            "sourceName": "Company Career Board",
            "externalId": "open_1",
            "title": "Systems Software Intern",
            "organizationName": "OpenLabs",
            "location": "Remote (India)",
            "workMode": "remote",
            "deadline": future_date,
            "applicationUrl": "https://openlabs.example/jobs/open-1",
            "description": "Build distributed microservices in Python, Go, Docker, and PostgreSQL.",
            "httpReachable": True,
        },
    ]
    ingest_res = client.post("/api/v1/ingestion/run", json=batch).json()
    assert ingest_res["skippedExpired"] == 2
    assert ingest_res["newOpportunitiesCreated"] == 1

    outbound_get_calls = 0
    orig_get = httpx.Client.get

    def _counting_get(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        nonlocal outbound_get_calls
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)
        outbound_get_calls += 1

        class _R:
            status_code = 200
            text = "{}"

            @staticmethod
            def json() -> dict[str, Any]:
                return {"jobs": [], "data": [], "results": []}

        return _R()

    monkeypatch.setattr(httpx.Client, "get", _counting_get)

    profile = client.get("/api/v1/profile", headers=headers).json()
    assert profile["onboardingCompleted"] is False

    # First onboarding save triggers initial outbound fetch (used=1, remaining=1)
    first_save = client.put("/api/v1/profile", headers=headers, json=profile)
    assert first_save.status_code == 200
    assert first_save.json()["triggersUsedToday"] == 1
    assert outbound_get_calls > 0

    # Subsequent preference update must NOT re-run outbound job fetching or consume quota
    outbound_get_calls = 0
    next_profile = first_save.json()
    next_profile["preferredLocations"] = ["Bengaluru"]
    next_profile["workModes"] = ["hybrid"]
    second_save = client.put("/api/v1/profile", headers=headers, json=next_profile)
    assert second_save.status_code == 200
    assert second_save.json()["triggersUsedToday"] == 1
    assert second_save.json()["triggersRemainingToday"] == 1
    assert outbound_get_calls == 0


