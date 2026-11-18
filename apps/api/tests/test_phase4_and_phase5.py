from fastapi.testclient import TestClient
from tests.conftest import login_with_oauth


def test_phase4_ingestion_idempotency_and_deduplication(client: TestClient) -> None:
    """
    Tests Phase 4 Data Ingestion, Normalization & Multi-Attribute Deduplication:
    - Feed item 1: Canonical listing at Acme Cloud Systems
    - Feed item 2: Cross-source duplicate of Acme Cloud Systems with 'Pvt. Ltd.' suffix and UTM params
    - Re-running the same batch is 100% idempotent.
    """
    headers = login_with_oauth(client, provider="google", email="ing@example.com")
    batch = [
        {
            "sourceName": "Ashby Official Board",
            "externalId": "ashby_acme_01",
            "title": "Backend & Distributed Systems Engineering Intern",
            "organizationName": "Acme Cloud Systems",
            "officialWebsite": "https://acmecloud.dev",
            "recruiterContactEmail": "careers@acmecloud.dev",
            "location": "Remote (India)",
            "workMode": "remote",
            "opportunityType": "internship",
            "roleCategory": "software_engineering",
            "domain": "Developer Tools & Cloud",
            "compensationMin": 75000,
            "compensationMax": 90000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-20T23:59:59Z",
            "applicationUrl": "https://acmecloud.dev/careers/backend-intern",
            "description": (
                "Work with Acme Cloud core storage team designing idempotent APIs in Python and Go, "
                "optimizing PostgreSQL query plans, and writing Docker tests."
            ),
            "httpReachable": True,
        },
        {
            "sourceName": "GitHub Verified Internships Feed",
            "externalId": "gh_acme_dup_01",
            "title": "Backend & Distributed Systems SWE Intern",
            "organizationName": "Acme Cloud Systems Pvt. Ltd.",
            "officialWebsite": "https://acmecloud.dev",
            "recruiterContactEmail": "careers@acmecloud.dev",
            "location": "Remote (India)",
            "workMode": "WFH / Remote",
            "opportunityType": "internship",
            "roleCategory": "software_engineering",
            "domain": "Developer Tools & Cloud",
            "compensationMin": 75000,
            "compensationMax": 90000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-20T23:59:59Z",
            "applicationUrl": "https://acmecloud.dev/careers/backend-intern/?utm_source=github&ref=feed",
            "description": (
                "Work with Acme Cloud core storage team designing idempotent APIs in Python and Go, "
                "optimizing PostgreSQL query plans, and writing Docker tests."
            ),
            "httpReachable": True,
        },
    ]

    first_run = client.post("/api/v1/ingestion/run", json=batch).json()
    assert first_run["totalProcessed"] == 2
    assert first_run["newOpportunitiesCreated"] == 1
    assert first_run["crossSourceDuplicatesMerged"] == 1

    opp_id = first_run["outcomes"][0]["opportunityId"]
    detail = client.get(f"/api/v1/opportunities/{opp_id}", headers=headers).json()
    assert len(detail["sources"]) == 2

    # Second run of the exact same batch must be 100% idempotent
    second_run = client.post("/api/v1/ingestion/run", json=batch).json()
    assert second_run["newOpportunitiesCreated"] == 0
    assert second_run["idempotentUpdates"] == 2


def test_phase4_similar_title_different_organization_not_merged(
    client: TestClient,
) -> None:
    headers = login_with_oauth(client, provider="google", email="fresh@example.com")
    batch = [
        {
            "sourceName": "Company Career Page",
            "externalId": "org_a_1",
            "title": "Software Engineering Intern",
            "organizationName": "AlphaTech Labs",
            "officialWebsite": "https://alphatech.io",
            "location": "Remote",
            "workMode": "remote",
            "applicationUrl": "https://alphatech.io/jobs/1",
            "description": "Build web services in Python, FastAPI, PostgreSQL, and Docker.",
            "httpReachable": True,
        },
        {
            "sourceName": "Company Career Page",
            "externalId": "org_b_1",
            "title": "Software Engineering Intern",  # Identical title, different company!
            "organizationName": "BetaWave Systems",
            "officialWebsite": "https://betawave.io",
            "location": "Remote",
            "workMode": "remote",
            "applicationUrl": "https://betawave.io/jobs/1",
            "description": "Build web services in Python, FastAPI, PostgreSQL, and Docker.",
            "httpReachable": False,  # Simulated failed HTTP check!
        },
    ]
    report = client.post("/api/v1/ingestion/run", json=batch).json()
    assert report["newOpportunitiesCreated"] == 2

    opp_b_id = report["outcomes"][1]["opportunityId"]
    detail_b = client.get(
        f"/api/v1/opportunities/{opp_b_id}", headers=headers
    ).json()
    assert detail_b["status"] == "unverified_status"


def test_phase5_hybrid_semantic_search_and_ml_evaluation(client: TestClient) -> None:
    headers = login_with_oauth(client, provider="google", email="ml@example.com")
    client.post(
        "/api/v1/opportunities",
        headers=headers,
        json={
            "title": "Machine Learning Retrieval Intern",
            "organizationName": "AI Research Lab",
            "officialWebsite": "https://airesearch.org",
            "recruiterContactEmail": "jobs@airesearch.org",
            "opportunityType": "internship",
            "roleCategory": "machine_learning",
            "domain": "AI & Machine Learning",
            "location": "Remote",
            "workMode": "remote",
            "compensationMin": 70000,
            "compensationMax": 85000,
            "compensationCurrency": "INR",
            "compensationPeriod": "monthly",
            "duration": "6 months",
            "deadline": "2026-12-20",
            "applicationUrl": "https://airesearch.org/jobs/ml",
            "sourceName": "Official Site",
            "description": "Implement PyTorch embedding benchmarks and RAG evaluation pipelines in Python.",
        },
    )

    search_res = client.get("/api/v1/ml/search?q=neural+nets+rag+llm+embeddings")
    assert search_res.status_code == 200
    search_body = search_res.json()
    assert "ml_ai_retrieval" in search_body["queryConceptClusters"]
    assert len(search_body["results"]) == 1
    assert search_body["results"][0]["semanticScore"] > 0

    eval_res = client.get("/api/v1/ml/evaluation")
    assert eval_res.status_code == 200
    eval_body = eval_res.json()
    assert eval_body["reproducibilityMetadata"]["randomSeed"] == 42
