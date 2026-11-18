from fastapi.testclient import TestClient
from tests.conftest import login_with_oauth


def test_oauth_providers_login_export_and_account_deletion(client: TestClient) -> None:
    """
    TC-02: Tests Google OAuth 2.0 endpoints, /auth/me,
    data export (/auth/export), and account deletion (/auth/account).
    """
    providers = client.get("/api/v1/auth/providers").json()["providers"]
    provider_ids = {p["id"] for p in providers}
    assert provider_ids == {"google"}

    headers = login_with_oauth(
        client,
        provider="google",
        email="user.google@gmail.com",
        display_name="User Google",
    )
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me = me_res.json()
    assert me["provider"] == "google"
    assert me["email"] == "user.google@gmail.com"

    # Test data export & account deletion for google user
    export_res = client.get("/api/v1/auth/export", headers=headers)
    assert export_res.status_code == 200
    assert export_res.json()["user"]["email"] == "user.google@gmail.com"

    del_res = client.delete("/api/v1/auth/account", headers=headers)
    assert del_res.status_code == 204

    # Subsequent call with deleted user's token must return 401
    after_del = client.get("/api/v1/auth/me", headers=headers)
    assert after_del.status_code == 401


def test_profile_update_recomputes_skill_gap(client: TestClient) -> None:
    headers = login_with_oauth(
        client, provider="google", email="student@gmail.com"
    )

    opp_res = client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "Machine Learning Intern (Python & PyTorch)",
            "organizationName": "DeepMind Lab",
            "officialWebsite": "https://deepmind.google",
            "recruiterContactEmail": "interns@deepmind.google",
            "opportunityType": "internship",
            "roleCategory": "machine_learning",
            "domain": "AI & Machine Learning",
            "location": "Bengaluru",
            "workMode": "hybrid",
            "compensationMin": 80000,
            "compensationMax": 80000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-15",
            "applicationUrl": "https://boards.greenhouse.io/deepmind/jobs/202",
            "sourceName": "Company Career Page",
            "description": (
                "Build machine learning training and evaluation pipelines in Python and PyTorch. "
                "Use Git and Docker for reproducible experiments."
            ),
        },
    ).json()
    opp_id = opp_res["id"]

    # Initially user has 0 skills, so Python and PyTorch are in missingRequiredSkills
    assert "Python" in opp_res["skillGap"]["missingRequiredSkills"]
    assert "PyTorch" in opp_res["skillGap"]["missingRequiredSkills"]
    initial_score = opp_res["recommendation"]["compositeScore"]

    # Add Python, PyTorch, Git, Docker to profile
    profile = client.get("/api/v1/profile", headers=headers).json()
    profile["preferredRoles"] = ["machine_learning"]
    profile["preferredDomains"] = ["AI & Machine Learning"]
    profile["skills"] = [
        {
            "id": "sk_1",
            "canonicalName": "Python",
            "category": "language",
            "proficiency": "advanced",
            "yearsExperience": 2.0,
            "sourceType": "explicit",
        },
        {
            "id": "sk_2",
            "canonicalName": "PyTorch",
            "category": "data_ml",
            "proficiency": "intermediate",
            "yearsExperience": 1.0,
            "sourceType": "explicit",
        },
        {
            "id": "sk_3",
            "canonicalName": "Git",
            "category": "tooling",
            "proficiency": "intermediate",
            "yearsExperience": 2.0,
            "sourceType": "explicit",
        },
        {
            "id": "sk_4",
            "canonicalName": "Docker",
            "category": "tooling",
            "proficiency": "beginner",
            "yearsExperience": 1.0,
            "sourceType": "explicit",
        },
    ]

    put_res = client.put("/api/v1/profile", headers=headers, json=profile)
    assert put_res.status_code == 200

    after_opp = client.get(f"/api/v1/opportunities/{opp_id}", headers=headers).json()
    assert after_opp["skillGap"]["requiredCoveragePercent"] == 100
    assert after_opp["recommendation"]["compositeScore"] > initial_score


def test_authorization_and_resource_ownership_protection(client: TestClient) -> None:
    # 1. Missing or invalid token returns 401
    assert client.get("/api/v1/applications").status_code == 401
    assert (
        client.get(
            "/api/v1/applications",
            headers={"Authorization": "Bearer invalid.jwt.token"},
        ).status_code
        == 401
    )

    # 2. User A creates an opportunity and tracks an application
    user_a = login_with_oauth(client, provider="google", email="alice@example.com")
    user_b = login_with_oauth(client, provider="google", email="bob@example.com")

    opp = client.post(
        "/api/v1/opportunities",
        headers=user_a,
        json={
            "title": "Software Engineer Intern",
            "organizationName": "Stripe",
            "officialWebsite": "https://stripe.com",
            "recruiterContactEmail": "university@stripe.com",
            "opportunityType": "internship",
            "roleCategory": "software_engineering",
            "domain": "Fintech & Payments",
            "location": "Bengaluru",
            "workMode": "hybrid",
            "compensationMin": 90000,
            "compensationMax": 90000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-20",
            "applicationUrl": "https://stripe.com/jobs/intern",
            "sourceName": "Company Page",
            "description": "Build payment APIs in Python, TypeScript, SQL, and Docker.",
        },
    ).json()

    app_a = client.post(
        "/api/v1/applications",
        headers=user_a,
        json={
            "opportunityId": opp["id"],
            "status": "applied",
            "nextAction": "Prepare for technical interview",
            "privateNotes": "Alice private interview note",
        },
    ).json()

    # User B must NOT see User A's application and must receive 403 on PATCH or DELETE
    b_apps = client.get("/api/v1/applications", headers=user_b).json()
    assert b_apps == []

    forbidden_patch = client.patch(
        f"/api/v1/applications/{app_a['id']}",
        headers=user_b,
        json={"status": "withdrawn"},
    )
    assert forbidden_patch.status_code == 403

    forbidden_del = client.delete(
        f"/api/v1/applications/{app_a['id']}",
        headers=user_b,
    )
    assert forbidden_del.status_code == 403
