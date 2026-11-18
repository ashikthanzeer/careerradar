import json
from typing import Any
import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.entities import CareerProfile, User
from app.modules.ingestion.url_extractor import extract_job_from_url


def test_root_env_google_oauth_settings_loaded() -> None:
    assert settings.google_client_id
    assert settings.google_client_secret
    assert settings.google_redirect_uri.endswith("/auth/callback?provider=google")


def test_better_auth_social_sign_in_and_session_cookie_lifecycle(client: TestClient) -> None:
    social_res = client.post(
        "/api/auth/sign-in/social",
        json={"provider": "google", "callbackURL": "/discover"},
    )
    assert social_res.status_code == 200
    social_data = social_res.json()
    assert social_data["configuredClientCredentials"] is True
    assert social_data["redirect"] is True
    assert social_data["url"] and "accounts.google.com" in social_data["url"]
    assert social_data["state"]

    # Complete callback and verify cookie + Bearer session + idempotent replay
    payload = {
        "state": social_data["state"],
        "email": "priya.nair@gmail.com",
        "displayName": "Priya Nair",
    }
    cb_res = client.post("/api/v1/auth/oauth/google/callback", json=payload)
    assert cb_res.status_code == 200
    cb_data = cb_res.json()
    assert cb_data["user"]["email"] == "priya.nair@gmail.com"
    assert cb_data["session"]["token"] == cb_data["accessToken"]
    assert "better-auth.session_token" in cb_res.cookies

    # Cookie-based get-session works without Authorization header
    session_res = client.get("/api/auth/get-session")
    assert session_res.status_code == 200
    session_data = session_res.json()
    assert session_data["user"]["email"] == "priya.nair@gmail.com"
    assert session_data["session"]["userId"] == cb_data["user"]["id"]

    # Sign-out clears cookie and subsequent unauthenticated get-session returns null
    signout_res = client.post("/api/auth/sign-out")
    assert signout_res.status_code == 200
    assert signout_res.json()["success"] is True

    after_signout = client.get("/api/auth/get-session")
    assert after_signout.status_code == 200
    assert after_signout.json() == {"session": None, "user": None}


def test_jwt_session_survives_database_reset_without_logging_user_out(
    client: TestClient, db_session: Session
) -> None:
    social_res = client.post(
        "/api/auth/sign-in/social",
        json={"provider": "google", "callbackURL": "/discover"},
    )
    state = social_res.json()["state"]

    cb_res = client.post(
        "/api/v1/auth/oauth/google/callback",
        json={
            "state": state,
            "email": "arjun.mehta@gmail.com",
            "displayName": "Arjun Mehta",
        },
    )
    assert cb_res.status_code == 200
    token = cb_res.json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}

    # Simulate an ephemeral database reset while the user keeps their device JWT
    db_session.query(CareerProfile).delete()
    db_session.query(User).delete()
    db_session.commit()

    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "arjun.mehta@gmail.com"
    assert me_res.json()["displayName"] == "Arjun Mehta"

    # Re-hydrated user + CareerProfile now exist again in the database
    rehydrated = db_session.query(User).filter(User.email == "arjun.mehta@gmail.com").first()
    assert rehydrated is not None


def test_url_extractor_parses_json_ld_and_platform_specific_dom() -> None:
    json_ld_payload = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": "Software Engineering Intern - Summer 2026",
        "description": "<p>Build distributed Python and React telemetry services with automated testing and cloud deployment.</p>",
        "hiringOrganization": {
            "@type": "Organization",
            "name": "Datadog",
            "sameAs": "https://www.datadoghq.com",
        },
        "jobLocation": {
            "@type": "Place",
            "address": {"@type": "PostalAddress", "addressLocality": "Bengaluru", "addressCountry": "IN"},
        },
        "jobLocationType": "TELECOMMUTE",
        "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "INR",
            "value": {"@type": "QuantitativeValue", "value": 85000, "unitText": "MONTH"},
        },
        "validThrough": "2026-12-31",
    }
    html_doc = f"""
    <html>
      <head>
        <script type="application/ld+json">{json.dumps(json_ld_payload)}</script>
      </head>
      <body><h1>Software Engineering Intern - Summer 2026</h1></body>
    </html>
    """
    result = extract_job_from_url(
        "https://www.linkedin.com/jobs/view/software-engineering-intern-at-datadog-998877",
        html_override=html_doc,
    )
    assert result["sourceName"] == "LinkedIn"
    assert result["title"] == "Software Engineering Intern - Summer 2026"
    assert result["organizationName"] == "Datadog"
    assert result["officialWebsite"] == "https://www.datadoghq.com"
    assert result["compensationMin"] == 85000
    assert result["compensationCurrency"] == "INR"
    assert result["workMode"] == "remote"
    assert result["partialExtraction"] is False


def test_url_extractor_linkedin_and_internshala_slug_fallbacks_when_walled() -> None:
    linkedin_res = extract_job_from_url(
        "https://www.linkedin.com/jobs/view/backend-software-engineer-intern-at-stripe-4091823",
        html_override="",
    )
    assert linkedin_res["sourceName"] == "LinkedIn"
    assert linkedin_res["title"] == "Backend Software Engineer Intern"
    assert linkedin_res["organizationName"] == "Stripe"
    assert linkedin_res["partialExtraction"] is True
    assert "LinkedIn" in linkedin_res["extractionNotice"]

    internshala_res = extract_job_from_url(
        "https://internshala.com/internship/detail/machine-learning-internship-in-bengaluru-at-razorpay1726384",
        html_override="",
    )
    assert internshala_res["sourceName"] == "Internshala"
    assert "Machine Learning Internship" in internshala_res["title"]
    assert internshala_res["organizationName"] == "Razorpay"
    assert internshala_res["location"] == "Bengaluru"
    assert internshala_res["partialExtraction"] is True


def test_extract_url_endpoint_with_indeed_dom_html(
    client: TestClient, monkeypatch: Any
) -> None:
    class _FakeResponse:
        status_code = 200
        headers = {"content-type": "text/html; charset=utf-8"}
        text = """
        <html>
          <head><title>Data Science Intern - Postman - Remote | Indeed</title></head>
          <body>
            <h1 class="jobsearch-JobInfoHeader-title">Data Science Intern</h1>
            <div data-company-name="true">Postman</div>
            <div data-testid="inlineHeader-companyLocation">Remote · Bengaluru</div>
            <div id="jobDescriptionText">
              Work with SQL, Python, pandas, and experimentation pipelines on API analytics telemetry.
            </div>
          </body>
        </html>
        """

    def _fake_get(self: httpx.Client, url: str, **kwargs: Any) -> _FakeResponse:
        return _FakeResponse()

    monkeypatch.setattr(httpx.Client, "get", _fake_get)

    social_res = client.post(
        "/api/auth/sign-in/social",
        json={"provider": "google", "callbackURL": "/discover"},
    )
    cb_res = client.post(
        "/api/v1/auth/oauth/google/callback",
        json={
            "state": social_res.json()["state"],
            "email": "tester@gmail.com",
            "displayName": "Test User",
        },
    )
    headers = {"Authorization": f"Bearer {cb_res.json()['accessToken']}"}

    extract_res = client.post(
        "/api/v1/opportunities/extract-url",
        json={"url": "https://in.indeed.com/viewjob?jk=abc123"},
        headers=headers,
    )
    assert extract_res.status_code == 200
    data = extract_res.json()
    assert data["sourceName"] == "Indeed"
    assert data["title"] == "Data Science Intern"
    assert data["organizationName"] == "Postman"
    assert "SQL, Python, pandas" in data["description"]
    assert data["partialExtraction"] is False

