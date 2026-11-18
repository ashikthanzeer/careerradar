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
        if "boards-api.greenhouse.io/v1/boards/razorpay" in url:
            return _FakeResp(
                {
                    "jobs": [
                        {
                            "id": 4401,
                            "title": "Backend Engineering Intern (Python & Go)",
                            "content": "<p>Build high-throughput payment orchestration APIs in Python, Go, and PostgreSQL.</p>",
                            "updated_at": recent_iso,
                            "location": {"name": "Bengaluru, India"},
                            "absolute_url": "https://boards.greenhouse.io/razorpay/jobs/4401",
                        },
                        {
                            "id": 4402,
                            "title": "Cloud Platform Intern (Python)",
                            "content": "<p>Automate Kubernetes and Terraform infrastructure pipelines in Python.</p>",
                            "updated_at": recent_iso,
                            "location": None,
                            "absolute_url": "https://boards.greenhouse.io/razorpay/jobs/4402",
                        },
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

    # Saving profile auto-triggers fetch #1 of 2 and persists ONLY real verified ATS jobs (zero synthetic top-ups)
    profile_a["nativeCountry"] = "India"
    profile_a["preferredLocations"] = ["Bengaluru", "Remote"]
    profile_a["preferredDomains"] = ["Developer Tools & Cloud", "Fintech & Payments"]
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

    # Shared catalog check: a different user (Bob) sees the real persisted roles ONLY (3 jobs, zero synthetic top-ups)
    headers_b = login_with_oauth(client, provider="google", email="bob.shared@gmail.com")
    bob_opps = client.get("/api/v1/opportunities?pageSize=60", headers=headers_b).json()
    assert bob_opps["total"] == 3
    assert any(
        item["organization"]["name"] == "Cloudflare"
        and "Systems Software Intern" in item["title"]
        for item in bob_opps["items"]
    )
    razorpay_missing_loc = next(
        item
        for item in bob_opps["items"]
        if item["organization"]["name"] == "Razorpay" and "Cloud Platform Intern" in item["title"]
    )
    assert razorpay_missing_loc["location"] == "Not available"
    assert razorpay_missing_loc["workMode"] == "unknown"
    assert razorpay_missing_loc["duration"] == "Not available"
    assert razorpay_missing_loc["compensationPeriod"] == "unknown"

    native_opps = client.get(
        "/api/v1/opportunities?region=native&pageSize=50", headers=headers_a
    ).json()
    worldwide_opps = client.get(
        "/api/v1/opportunities?region=worldwide&pageSize=50", headers=headers_a
    ).json()
    assert native_opps["total"] == 1
    assert worldwide_opps["total"] == 2

    # Trigger #2 of 2 (manual) succeeds without inventing fake synthetic records
    second_fetch = client.post(
        "/api/v1/ingestion/fetch-for-profile",
        headers=headers_a,
        json={"query": "python", "limit": 50, "triggerSource": "manual"},
    )
    assert second_fetch.status_code == 200
    second_data = second_fetch.json()
    assert second_data["triggered"] is True
    assert second_data["nativeCountry"] == "India"
    assert second_data["nativeCount"] == 1
    assert second_data["worldwideCount"] == 2
    assert second_data["report"]["totalProcessed"] == 3
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
    Verifies that >= 75% of fetched opportunities comply with the user's job preferences
    using ONLY real ATS postings (zero synthetic top-ups):
    - When preferredLocations=["Remote"] (even if workModes allows hybrid), >= 75% overall,
      native, and worldwide jobs match workMode=="remote", roleCategory, and domain.
    - Updating to Hyderabad + hybrid + security + manually fetching real boards re-aligns >= 75% of native jobs.
    """
    recent_iso = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    orig_get = httpx.Client.get

    class _FakeResp:
        def __init__(self, payload: Any, status_code: int = 200) -> None:
            self.status_code = status_code
            self._payload = payload
            self.text = json.dumps(payload)

        def json(self) -> Any:
            return self._payload

    _SPECIALTIES = [
        ("Inference Systems", "CUDA, C++, Triton, and PyTorch model serving kernels"),
        ("RAG Retrieval", "vector indexing, FastAPI pipelines, and PostgreSQL embeddings"),
        ("Alignment Research", "RLHF reward modeling, Python evaluation harnesses, and distributed training"),
        ("Multimodal Vision", "computer vision transformers, ONNX optimization, and Docker containers"),
        ("Agent Evaluation", "automated benchmark sandboxes, TypeScript dashboards, and LLM telemetry"),
    ]

    def _board_jobs(slug: str, count: int, title_prefix: str, loc: str) -> dict[str, Any]:
        return {
            "jobs": [
                {
                    "id": 1000 + i,
                    "title": f"{title_prefix} - {_SPECIALTIES[i][0]}",
                    "content": f"<p>Build production software using {_SPECIALTIES[i][1]} with mentorship and testing.</p>",
                    "updated_at": recent_iso,
                    "location": {"name": loc},
                    "absolute_url": f"https://boards.greenhouse.io/{slug}/jobs/{1000 + i}",
                }
                for i in range(count)
            ]
        }

    def _fake_get(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)
        if "boards-api.greenhouse.io/v1/boards/anthropic" in url:
            return _FakeResp(_board_jobs("anthropic", 5, "Machine Learning Research Intern", "Remote"))
        if "boards-api.greenhouse.io/v1/boards/scaleai" in url:
            return _FakeResp(_board_jobs("scaleai", 5, "Machine Learning Intern", "Remote, India"))
        if "boards-api.greenhouse.io/v1/boards/snyk" in url:
            return _FakeResp(
                _board_jobs("snyk", 5, "Security Engineering Intern (Hybrid)", "Hyderabad, India (Hybrid)")
            )
        if "boards-api.greenhouse.io/v1/boards/wiz" in url:
            return _FakeResp(
                _board_jobs("wiz", 4, "Application Security Intern (Hybrid)", "Hyderabad, India (Hybrid)")
            )
        return _FakeResp({"jobs": [], "data": [], "results": []})

    monkeypatch.setattr(httpx.Client, "get", _fake_get)

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
    assert len(all_opps) >= 10
    assert all(
        not any(src["externalId"].startswith(("native_", "worldwide_")) for src in o["sources"])
        for o in all_opps
    )
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
    assert len(native_opps) >= 5
    assert len(worldwide_opps) >= 5
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

    # Update profile to Hyderabad + hybrid + Security + Cybersecurity and manually fetch live boards
    updated_profile = saved.json()
    updated_profile["preferredLocations"] = ["Hyderabad"]
    updated_profile["workModes"] = ["hybrid"]
    updated_profile["preferredRoles"] = ["security"]
    updated_profile["preferredDomains"] = ["Cybersecurity"]
    res_updated = client.put("/api/v1/profile", headers=headers, json=updated_profile)
    assert res_updated.status_code == 200

    manual_hyd = client.post(
        "/api/v1/ingestion/fetch-for-profile",
        headers=headers,
        json={"query": "security", "limit": 50, "triggerSource": "manual"},
    )
    assert manual_hyd.status_code == 200

    native_hyd = client.get(
        "/api/v1/opportunities?region=native&pageSize=100", headers=headers
    ).json()["items"]
    assert len(native_hyd) >= 9
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


def test_zero_hallucination_rejects_generic_urls_and_verifies_live_status(
    client: TestClient, monkeypatch: Any
) -> None:
    """
    Verifies the core Option A + Zero-Hallucination requirements:
    1. Synthetic top-ups never generate fake items.
    2. Generic career portal URLs (/jobs/, /careers) are rejected during ingestion.
    3. Omitted metadata defaults strictly to 'Not available' / 'unknown' / None.
    4. POST /api/v1/opportunities/{id}/verify-live marks 404/closed postings as 'expired'.
    """
    from app.modules.ingestion.company_boards import (
        build_verified_native_internships,
        build_verified_worldwide_internships,
    )

    assert build_verified_native_internships("India", ["Fintech & Payments"], ["software_engineering"]) == []
    assert build_verified_worldwide_internships(["AI & Machine Learning"], ["machine_learning"]) == []

    headers = login_with_oauth(client, provider="google", email="zero.hallucination@gmail.com")
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")

    batch = [
        {
            "sourceName": "Generic Portal 1",
            "externalId": "gen_1",
            "title": "Software Engineering Intern",
            "organizationName": "Razorpay",
            "applicationUrl": "https://razorpay.com/jobs/",
            "description": "Build distributed payment orchestration microservices in Go and Python.",
            "deadline": future_date,
        },
        {
            "sourceName": "Generic Portal 2",
            "externalId": "gen_2",
            "title": "Platform Intern",
            "organizationName": "Juspay",
            "applicationUrl": "https://juspay.io/careers",
            "description": "Develop high-concurrency systems in Rust, Go, Linux, and Docker.",
            "deadline": future_date,
        },
        {
            "sourceName": "Cloudflare Careers (Greenhouse)",
            "externalId": "gh_cloudflare_7771",
            "title": "Systems Software Intern",
            "organizationName": "Cloudflare",
            "officialWebsite": "https://cloudflare.com",
            "applicationUrl": "https://boards.greenhouse.io/cloudflare/jobs/7771",
            "description": "Work with distributed edge proxies using Rust, Go, Linux, and Docker.",
        },
    ]

    report = client.post("/api/v1/ingestion/run", json=batch).json()
    assert report["skippedExpired"] == 2
    assert report["newOpportunitiesCreated"] == 1

    listed = client.get("/api/v1/opportunities", headers=headers).json()
    assert listed["total"] == 1
    item = listed["items"][0]
    assert item["location"] == "Not available"
    assert item["workMode"] == "unknown"
    assert item["duration"] == "Not available"
    assert item["compensationPeriod"] == "unknown"
    assert item["compensationCurrency"] is None
    assert item["postedAt"] is None
    assert item["analysis"]["compensationSummary"] == "Not available"
    assert item["analysis"]["durationSummary"] == "Not available"
    assert item["analysis"]["locationSummary"] == "Not available"
    assert item["analysis"]["applicationDeadlineSummary"] == "Not available"
    assert item["analysis"]["eligibilityRequirements"] == ["Not available"]
    assert item["analysis"]["experienceRequirements"] == "Not available"

    # Simulate the external Greenhouse URL returning HTTP 404 on live verification
    orig_get = httpx.Client.get

    def _mock_404(self: httpx.Client, url: str, **kwargs: Any) -> Any:
        if "testserver" in str(url) or str(url).startswith("/"):
            return orig_get(self, url, **kwargs)

        class _R:
            status_code = 404
            text = "Not Found"

        return _R()

    monkeypatch.setattr(httpx.Client, "get", _mock_404)
    ver_res = client.post(f"/api/v1/opportunities/{item['id']}/verify-live", headers=headers)
    assert ver_res.status_code == 200
    ver_body = ver_res.json()
    assert ver_body["available"] is False
    assert ver_body["status"] == "expired"

    # Once marked expired, it is no longer returned in active discovery
    listed_after = client.get("/api/v1/opportunities", headers=headers).json()
    assert listed_after["total"] == 0


def test_universal_pdf_parser_and_multidomain_extraction(client: TestClient) -> None:
    """
    Verifies:
    1. 3-tier PDF extractor decodes FlateDecode compressed LaTeX/Canva/Word PDFs with
       TJ kerning splits ([(V) -15 (eri) 10 (log)] TJ), ToUnicode CMap hex glyph streams,
       ligatures, and hyphenated line breaks.
    2. Scanned/empty PDFs fail gracefully with an informative prompt instead of raw PDF bytes.
    3. Non-CS resumes (Hardware/VLSI, UI/UX Design, Product Management, Quantitative Finance)
       are accurately extracted into non-CS RoleCategory & Domain tracks.
    4. Multi-domain early-career ingestion admits hardware, UI/UX, and PM internships while
       still blocking senior non-career commercial roles.
    """
    import zlib
    from app.modules.ingestion.normalizer import is_technical_career_role
    from app.modules.profile.extractor import _extract_pdf_text

    # 1. FlateDecode compressed LaTeX-style PDF with TJ kerning + ToUnicode CMap hex glyphs
    cmap_stream = zlib.compress(
        b"beginbfchar\n"
        b"<0001> <0046>\n"
        b"<0002> <0069>\n"
        b"<0003> <0067>\n"
        b"<0004> <006D>\n"
        b"<0005> <0061>\n"
        b"endbfchar\n"
    )
    content_stream = zlib.compress(
        b"BT\n"
        b"/F1 11 Tf\n"
        b"[(V) -20 (eri) 10 (log) -220 (F) -15 (PGA) -240 (E) -10 (mbedded) -220 (Sys) 5 (tems)] TJ\n"
        b"<00010002000300040005> Tj\n"
        b"(B.Tech Electronics and Communication Engineering, NIT Calicut 2027) Tj\n"
        b"(MATLAB, SolidWorks, Product Management, Financial Modeling, User Re-\nsearch, Digital Marketing) Tj\n"
        b"ET\n"
    )
    fake_pdf = (
        b"%PDF-1.4\n1 0 obj << /Length 100 >> stream\n"
        + cmap_stream
        + b"\nendstream\nendobj\n2 0 obj << /Filter /FlateDecode >> stream\n"
        + content_stream
        + b"\nendstream\nendobj\n%%EOF"
    )
    extracted_text = _extract_pdf_text(fake_pdf)
    assert "Verilog" in extracted_text
    assert "FPGA" in extracted_text
    assert "Embedded Systems" in extracted_text
    assert "Figma" in extracted_text
    assert "User Research" in extracted_text

    headers = login_with_oauth(client, provider="google", email="vlsi.design@gmail.com")
    res = client.post(
        "/api/v1/profile/extract-resume",
        headers=headers,
        json={
            "filename": "ananya_hardware_pm.pdf",
            "fileBase64": base64.b64encode(fake_pdf).decode("ascii"),
        },
    )
    assert res.status_code == 200
    body = res.json()
    extracted_skill_names = {s["canonicalName"] for s in body["skills"]}
    assert {
        "Verilog",
        "FPGA",
        "Embedded Systems",
        "Figma",
        "User Research",
        "MATLAB",
        "SolidWorks",
        "Product Management",
        "Financial Modeling",
    }.issubset(extracted_skill_names)
    assert "core_engineering" in body["preferredRoles"]
    assert "ui_ux_design" in body["preferredRoles"]
    assert "product_management" in body["preferredRoles"]
    assert "finance_business" in body["preferredRoles"]
    assert "Embedded, Robotics & VLSI" in body["preferredDomains"]
    assert "UI/UX & Product Design" in body["preferredDomains"]
    assert body["fieldOfStudy"] == "Electrical & Electronics Engineering"

    # 2. Scanned image-only PDF fails cleanly with empty skills & actionable notice
    scanned_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    scanned_res = client.post(
        "/api/v1/profile/extract-resume",
        headers=headers,
        json={
            "filename": "scanned_cv.pdf",
            "fileBase64": base64.b64encode(scanned_pdf).decode("ascii"),
        },
    )
    assert scanned_res.status_code == 200
    assert scanned_res.json()["skills"] == []
    assert "scanned" in scanned_res.json()["extractionNotice"].lower()

    # 3. Non-CS early-career roles admitted during ingestion while commercial execs stay filtered
    assert is_technical_career_role("VLSI Design Intern") is True
    assert is_technical_career_role("UI/UX Product Designer Intern") is True
    assert is_technical_career_role("Associate Product Management Intern") is True
    assert is_technical_career_role("Quantitative Financial Analyst Intern") is True
    assert is_technical_career_role("Market Access (Senior) Manager, EU Center") is False




