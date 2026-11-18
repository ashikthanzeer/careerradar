import math
import re
from collections import Counter
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import Opportunity, OpportunitySkill, Organization, Skill

# Domain concept taxonomy for semantic query expansion & dense concept projection
CONCEPT_CLUSTERS: dict[str, list[str]] = {
    "ml_ai_retrieval": [
        "machine",
        "learning",
        "ml",
        "ai",
        "pytorch",
        "deep",
        "neural",
        "llm",
        "embedding",
        "embeddings",
        "retrieval",
        "rag",
        "evaluation",
        "benchmark",
        "inference",
        "model",
        "transformer",
        "nlp",
    ],
    "cloud_containers_infra": [
        "kubernetes",
        "k8s",
        "docker",
        "container",
        "containers",
        "cloud",
        "native",
        "cncf",
        "observability",
        "telemetry",
        "opentelemetry",
        "prometheus",
        "devops",
        "cluster",
        "orchestration",
    ],
    "backend_distributed_db": [
        "backend",
        "distributed",
        "api",
        "rest",
        "fastapi",
        "postgresql",
        "postgres",
        "sql",
        "database",
        "storage",
        "ingestion",
        "idempotent",
        "queue",
        "microservice",
        "go",
        "golang",
        "python",
    ],
    "systems_kernel_lowlevel": [
        "systems",
        "linux",
        "kernel",
        "ebpf",
        "c++",
        "cpp",
        "rust",
        "os",
        "operating",
        "low-latency",
        "networking",
        "memory",
        "concurrency",
        "isolation",
    ],
    "security_appsec": [
        "security",
        "cybersecurity",
        "appsec",
        "vulnerability",
        "static",
        "analysis",
        "ast",
        "sandbox",
        "sandboxing",
        "audit",
        "supply-chain",
    ],
    "frontend_fullstack_web": [
        "frontend",
        "full-stack",
        "fullstack",
        "react",
        "typescript",
        "ui",
        "web",
        "dashboard",
        "reconciliation",
        "fintech",
    ],
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9+#]{2,}", text.lower())


def _char_trigrams(text: str) -> Counter[str]:
    cleaned = re.sub(r"\s+", " ", text.lower().strip())
    if len(cleaned) < 3:
        return Counter([cleaned])
    return Counter(cleaned[i : i + 3] for i in range(len(cleaned) - 2))


def _cosine_counter(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a.keys()) & set(b.keys())
    dot = sum(a[k] * b[k] for k in common)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _concept_embedding(tokens: list[str]) -> tuple[dict[str, float], list[str]]:
    token_set = set(tokens)
    vec: dict[str, float] = {}
    matched_concepts: list[str] = []
    for cluster_name, cluster_terms in CONCEPT_CLUSTERS.items():
        overlap = len(token_set & set(cluster_terms))
        if overlap > 0:
            vec[cluster_name] = 1.0 + math.log(overlap + 1)
            matched_concepts.append(cluster_name)
        else:
            vec[cluster_name] = 0.0
    return vec, matched_concepts


def _cosine_dict(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in a)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def run_hybrid_semantic_search(
    db: Session,
    query: str,
    alpha: float = 0.45,
    exclude_elevated_risk: bool = True,
) -> dict[str, Any]:
    """
    Phase 5 Hybrid Semantic + Lexical Retrieval Engine (PRD §12).
    Combines:
    1. Sublinear TF-IDF lexical cosine similarity (weight = alpha).
    2. Semantic concept-cluster embedding + character n-gram structural similarity (weight = 1 - alpha).
    """
    opps = list(db.scalars(select(Opportunity)).all())
    orgs = {o.id: o for o in db.scalars(select(Organization)).all()}
    skills_by_id = {s.id: s for s in db.scalars(select(Skill)).all()}
    opp_skills = list(db.scalars(select(OpportunitySkill)).all())

    skills_per_opp: dict[str, list[str]] = {}
    for os_row in opp_skills:
        sk = skills_by_id.get(os_row.skill_id)
        if sk:
            skills_per_opp.setdefault(os_row.opportunity_id, []).append(sk.canonical_name)

    # Build document corpus
    docs_tokens: dict[str, list[str]] = {}
    docs_text: dict[str, str] = {}
    df: Counter[str] = Counter()

    for opp in opps:
        org = orgs.get(opp.organization_id)
        sk_list = skills_per_opp.get(opp.id, [])
        full_text = " ".join(
            [
                opp.title,
                org.name if org else "",
                opp.domain,
                opp.role_category.replace("_", " "),
                opp.location,
                " ".join(sk_list),
                opp.description,
            ]
        )
        docs_text[opp.id] = full_text
        tokens = _tokenize(full_text)
        docs_tokens[opp.id] = tokens
        for unique_tok in set(tokens):
            df[unique_tok] += 1

    n_docs = max(1, len(opps))
    q_tokens = _tokenize(query)
    q_tf = Counter(q_tokens)
    q_tfidf: Counter[str] = Counter()
    for tok, count in q_tf.items():
        idf = math.log((n_docs + 1) / (df.get(tok, 0) + 1)) + 1.0
        q_tfidf[tok] = (1.0 + math.log(count)) * idf

    q_concept_vec, q_concepts = _concept_embedding(q_tokens)
    q_trigrams = _char_trigrams(query)

    results: list[dict[str, Any]] = []
    for opp in opps:
        if exclude_elevated_risk and opp.trust_assessment:
            if opp.trust_assessment.overall_label == "elevated_risk":
                continue

        d_tf = Counter(docs_tokens[opp.id])
        d_tfidf: Counter[str] = Counter()
        for tok, count in d_tf.items():
            idf = math.log((n_docs + 1) / (df.get(tok, 0) + 1)) + 1.0
            d_tfidf[tok] = (1.0 + math.log(count)) * idf

        lexical_score = _cosine_counter(q_tfidf, d_tfidf)
        d_concept_vec, d_concepts = _concept_embedding(docs_tokens[opp.id])
        concept_sim = _cosine_dict(q_concept_vec, d_concept_vec)
        trigram_sim = _char_trigrams_sim(q_trigrams, _char_trigrams(opp.title + " " + " ".join(skills_per_opp.get(opp.id, []))))
        semantic_score = 0.70 * concept_sim + 0.30 * trigram_sim

        hybrid_score = alpha * lexical_score + (1.0 - alpha) * semantic_score
        shared_concepts = sorted(set(q_concepts) & set(d_concepts))

        org = orgs.get(opp.organization_id)
        results.append(
            {
                "opportunityId": opp.id,
                "title": opp.title,
                "organizationName": org.name if org else "Unknown",
                "domain": opp.domain,
                "roleCategory": opp.role_category,
                "location": opp.location,
                "workMode": opp.work_mode,
                "skills": skills_per_opp.get(opp.id, []),
                "lexicalScore": round(lexical_score, 4),
                "semanticScore": round(semantic_score, 4),
                "hybridScore": round(hybrid_score, 4),
                "matchedConceptClusters": shared_concepts,
            }
        )

    results.sort(key=lambda r: r["hybridScore"], reverse=True)
    return {
        "query": query,
        "alphaLexicalWeight": alpha,
        "semanticWeight": round(1.0 - alpha, 2),
        "queryConceptClusters": q_concepts,
        "totalEvaluated": len(results),
        "results": results,
    }


def _char_trigrams_sim(a: Counter[str], b: Counter[str]) -> float:
    return _cosine_counter(a, b)

