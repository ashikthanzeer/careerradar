from fastapi.testclient import TestClient
from tests.conftest import login_with_oauth


def test_health_endpoint(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["version"] == "1.0.0"


def test_zero_dummy_data_on_fresh_database(client: TestClient) -> None:
    """
    TC-01: Verifies that a fresh database contains zero dummy opportunities,
    zero fake saved items, and zero fake applications.
    """
    headers = login_with_oauth(client, provider="google", email="newuser@gmail.com")
    opps = client.get("/api/v1/opportunities", headers=headers).json()
    assert opps["total"] == 0
    assert opps["items"] == []

    saved = client.get("/api/v1/saved-opportunities", headers=headers).json()
    assert saved == []

    apps = client.get("/api/v1/applications", headers=headers).json()
    assert apps == []


def test_create_list_and_filter_opportunities(client: TestClient) -> None:
    headers = login_with_oauth(client, provider="google", email="dev@gmail.com")

    # 1. Create a verified opportunity
    legit_res = client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "Backend Systems Intern (Python & Rust)",
            "organizationName": "Cloudflare",
            "officialWebsite": "https://cloudflare.com",
            "recruiterContactEmail": "internships@cloudflare.com",
            "opportunityType": "internship",
            "roleCategory": "systems_infrastructure",
            "domain": "Developer Tools & Cloud",
            "location": "Remote",
            "workMode": "remote",
            "compensationMin": 65000,
            "compensationMax": 80000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-20",
            "applicationUrl": "https://boards.greenhouse.io/cloudflare/jobs/101",
            "sourceName": "Greenhouse Official",
            "description": (
                "Work with our distributed systems engineering team to build low-latency "
                "services in Rust, Python, and Linux. Write integration tests in Docker and PostgreSQL."
            ),
        },
    )
    assert legit_res.status_code == 201
    legit_id = legit_res.json()["id"]

    # 2. Create a high-risk fee scam opportunity
    scam_res = client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "AI Intern (Instant Offer Letter)",
            "organizationName": "Unverified Cert Portal",
            "officialWebsite": None,
            "recruiterContactEmail": "certportal@gmail.com",
            "opportunityType": "internship",
            "roleCategory": "machine_learning",
            "domain": "AI & Machine Learning",
            "location": "Remote",
            "workMode": "remote",
            "compensationMin": None,
            "compensationMax": None,
            "compensationCurrency": "INR",
            "compensationPeriod": "unpaid",
            "duration": "1 month",
            "deadline": "2026-12-01",
            "applicationUrl": "https://forms.gle/scam-form",
            "sourceName": "Social Post",
            "description": (
                "Direct selection with no interview required! Selected candidates must pay "
                "a mandatory registration fee of ₹1,999 for training and certificate."
            ),
        },
    )
    assert scam_res.status_code == 201

    # Filter out elevated_risk listings
    safe_list = client.get(
        "/api/v1/opportunities?trustFilter=hide_elevated_risk",
        headers=headers,
    ).json()
    assert safe_list["total"] == 1
    assert safe_list["items"][0]["id"] == legit_id

    # Filter by skill=Rust
    rust_list = client.get(
        "/api/v1/opportunities?skill=Rust",
        headers=headers,
    ).json()
    assert rust_list["total"] == 1
    assert rust_list["items"][0]["id"] == legit_id

    # 404 check
    not_found = client.get("/api/v1/opportunities/opp_nonexistent", headers=headers)
    assert not_found.status_code == 404
