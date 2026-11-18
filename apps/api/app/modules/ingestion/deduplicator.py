from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse
from app.models.entities import Opportunity, OpportunitySource, Organization
from app.modules.ingestion.normalizer import (
    jaccard_similarity,
    normalize_application_url,
    normalize_organization_name,
    normalize_role_title,
)


@dataclass(frozen=True)
class DeduplicationMatch:
    status: Literal["new_record", "idempotent_source_match", "cross_source_duplicate"]
    matched_opportunity_id: str | None
    matched_reason: str | None
    similarity_score: float


def detect_duplicate_opportunity(
    candidate_title: str,
    candidate_org_name: str,
    candidate_app_url: str,
    candidate_location: str,
    candidate_description: str,
    candidate_source_name: str,
    candidate_external_id: str,
    existing_opportunities: list[Opportunity],
    orgs_by_id: dict[str, Organization],
    sources_by_opp_id: dict[str, list[OpportunitySource]],
) -> DeduplicationMatch:
    """
    Multi-attribute Duplicate Detection Engine (PRD §11, AGENTS.md §8).
    Rules:
    1. Exact (source_name, external_id) match -> idempotent_source_match (no duplicate created).
    2. Canonical application_url match + compatible organization -> cross_source_duplicate.
    3. Normalized organization name match + role title overlap + location/description similarity -> cross_source_duplicate.
    CRITICAL RULE: Never merges two records solely because their titles are similar when organizations differ.
    """
    norm_cand_org = normalize_organization_name(candidate_org_name)
    norm_cand_title = normalize_role_title(candidate_title)
    norm_cand_url = normalize_application_url(candidate_app_url)

    # Pass 1: Idempotent check on (source_name, external_id)
    for opp in existing_opportunities:
        for src in sources_by_opp_id.get(opp.id, []):
            if (
                src.source_name.strip().lower() == candidate_source_name.strip().lower()
                and src.external_id.strip().lower() == candidate_external_id.strip().lower()
            ):
                return DeduplicationMatch(
                    status="idempotent_source_match",
                    matched_opportunity_id=opp.id,
                    matched_reason=f"Exact provenance match on ({candidate_source_name}, {candidate_external_id})",
                    similarity_score=1.0,
                )

    parsed_cand_url = urlparse(norm_cand_url) if norm_cand_url else None
    has_specific_url = bool(
        parsed_cand_url
        and (len(parsed_cand_url.path.strip("/")) > 3 or bool(parsed_cand_url.query))
    )

    # Pass 2: Canonical Application URL or Multi-Attribute Organization + Title + Content match
    for opp in existing_opportunities:
        org = orgs_by_id.get(opp.organization_id)
        existing_org_norm = (
            normalize_organization_name(org.name) if org else ""
        )
        existing_url_norm = normalize_application_url(opp.application_url)

        if has_specific_url and norm_cand_url == existing_url_norm:
            return DeduplicationMatch(
                status="cross_source_duplicate",
                matched_opportunity_id=opp.id,
                matched_reason="Exact canonical application URL match",
                similarity_score=0.99,
            )

        # Organization identity check (never merge across distinct organizations!)
        org_matches = (
            norm_cand_org == existing_org_norm
            or (
                len(norm_cand_org) >= 5
                and len(existing_org_norm) >= 5
                and (
                    norm_cand_org in existing_org_norm
                    or existing_org_norm in norm_cand_org
                )
            )
        )

        if not org_matches:
            continue

        # If organization matches AND canonical application URL matches -> definite cross-source duplicate
        if norm_cand_url and norm_cand_url == existing_url_norm:
            return DeduplicationMatch(
                status="cross_source_duplicate",
                matched_opportunity_id=opp.id,
                matched_reason="Matching organization and canonicalized application URL",
                similarity_score=0.98,
            )

        # Check multi-attribute similarity (Title + Location + Description)
        existing_title_norm = normalize_role_title(opp.title)
        title_sim = jaccard_similarity(norm_cand_title, existing_title_norm)
        desc_sim = jaccard_similarity(candidate_description, opp.description)
        loc_compatible = (
            candidate_location.strip().lower() in opp.location.strip().lower()
            or opp.location.strip().lower() in candidate_location.strip().lower()
            or ("remote" in candidate_location.lower() and "remote" in opp.location.lower())
        )

        if norm_cand_title == existing_title_norm and loc_compatible:
            return DeduplicationMatch(
                status="cross_source_duplicate",
                matched_opportunity_id=opp.id,
                matched_reason="Matching organization, normalized role title, and location",
                similarity_score=0.95,
            )

        composite_sim = round(title_sim * 0.5 + desc_sim * 0.5, 3)
        if title_sim >= 0.60 and desc_sim >= 0.45 and loc_compatible:
            return DeduplicationMatch(
                status="cross_source_duplicate",
                matched_opportunity_id=opp.id,
                matched_reason=(
                    f"Multi-attribute match: Organization '{org.name if org else ''}' + "
                    f"Title similarity ({title_sim:.2f}) + Description similarity ({desc_sim:.2f})"
                ),
                similarity_score=composite_sim,
            )

    return DeduplicationMatch(
        status="new_record",
        matched_opportunity_id=None,
        matched_reason=None,
        similarity_score=0.0,
    )

