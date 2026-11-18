import time
from typing import Any
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import (
    Opportunity,
    OpportunitySource,
    Organization,
    utc_now_iso,
)
from app.modules.discovery.service import _persist_trust_and_analysis
from app.modules.ingestion.deduplicator import detect_duplicate_opportunity
from app.modules.ingestion.freshness import (
    evaluate_opportunity_freshness,
    is_listing_text_closed,
    is_opportunity_expired,
)
from app.modules.ingestion.normalizer import (
    normalize_application_url,
    normalize_organization_name,
    normalize_role_title,
    normalize_work_mode,
)


class RawFeedItemSchema(BaseModel):
    sourceName: str = Field(min_length=2)
    externalId: str = Field(min_length=2)
    title: str = Field(min_length=3)
    organizationName: str = Field(min_length=2)
    officialWebsite: str | None = None
    recruiterContactEmail: str | None = None
    location: str = "Remote"
    workMode: str | None = None
    opportunityType: str = "internship"
    roleCategory: str = "software_engineering"
    domain: str = "Developer Tools & Cloud"
    compensationMin: int | None = None
    compensationMax: int | None = None
    compensationCurrency: str | None = "INR"
    compensationPeriod: str = "monthly"
    duration: str = "6 months"
    postedAt: str | None = None
    deadline: str | None = None
    applicationUrl: str = Field(min_length=8)
    description: str = Field(min_length=20)
    httpReachable: bool = True


class IngestionRecordOutcomeSchema(BaseModel):
    externalId: str
    sourceName: str
    rawTitle: str
    normalizedTitle: str
    rawOrganization: str
    normalizedOrganization: str
    canonicalUrl: str
    action: str
    opportunityId: str
    reason: str


class IngestionRunReportSchema(BaseModel):
    batchId: str
    executedAt: str
    totalProcessed: int
    newOpportunitiesCreated: int
    idempotentUpdates: int
    crossSourceDuplicatesMerged: int
    skippedExpired: int = 0
    outcomes: list[IngestionRecordOutcomeSchema]


def run_ingestion_batch(
    db: Session, items: list[RawFeedItemSchema] | None = None
) -> IngestionRunReportSchema:
    feed_items = items if items is not None else []

    now = utc_now_iso()
    batch_id = f"ing_batch_{int(time.time() * 1000)}"

    existing_opps = list(db.scalars(select(Opportunity)).all())
    orgs_by_id = {o.id: o for o in db.scalars(select(Organization)).all()}
    all_sources = list(db.scalars(select(OpportunitySource)).all())
    sources_by_opp_id: dict[str, list[OpportunitySource]] = {}
    for s in all_sources:
        sources_by_opp_id.setdefault(s.opportunity_id, []).append(s)

    new_count = 0
    idempotent_count = 0
    merged_count = 0
    skipped_expired_count = 0
    outcomes: list[IngestionRecordOutcomeSchema] = []

    for idx, item in enumerate(feed_items):
        norm_title = normalize_role_title(item.title)
        norm_org = normalize_organization_name(item.organizationName)
        canonical_url = normalize_application_url(item.applicationUrl)
        norm_mode = normalize_work_mode(item.workMode, item.location)

        match = detect_duplicate_opportunity(
            candidate_title=item.title,
            candidate_org_name=item.organizationName,
            candidate_app_url=item.applicationUrl,
            candidate_location=item.location,
            candidate_description=item.description,
            candidate_source_name=item.sourceName,
            candidate_external_id=item.externalId,
            existing_opportunities=existing_opps,
            orgs_by_id=orgs_by_id,
            sources_by_opp_id=sources_by_opp_id,
        )

        expired, exp_reason = is_opportunity_expired(
            item.deadline, item.postedAt, reference_iso=now
        )
        if not expired and is_listing_text_closed(item.title, item.description):
            expired = True
            exp_reason = "Listing indicates applications are closed or the position is no longer available."
        if expired:
            matched_id = match.matched_opportunity_id or ""
            if matched_id:
                target_opp = next((o for o in existing_opps if o.id == matched_id), None)
                if target_opp is not None:
                    target_opp.status = "expired"
                    target_opp.last_seen_at = now
            skipped_expired_count += 1
            outcomes.append(
                IngestionRecordOutcomeSchema(
                    externalId=item.externalId,
                    sourceName=item.sourceName,
                    rawTitle=item.title,
                    normalizedTitle=norm_title,
                    rawOrganization=item.organizationName,
                    normalizedOrganization=norm_org,
                    canonicalUrl=canonical_url,
                    action="skipped_expired",
                    opportunityId=matched_id,
                    reason=exp_reason,
                )
            )
            continue

        if match.status == "idempotent_source_match" and match.matched_opportunity_id:
            target_opp = next(
                o for o in existing_opps if o.id == match.matched_opportunity_id
            )
            details_changed = (
                target_opp.location != item.location.strip()
                or target_opp.work_mode != norm_mode
                or target_opp.role_category != item.roleCategory
                or target_opp.domain != item.domain
                or target_opp.title != item.title.strip()
                or target_opp.description != item.description.strip()
            )
            target_opp.title = item.title.strip()
            target_opp.normalized_title = norm_title
            target_opp.description = item.description.strip()
            target_opp.opportunity_type = item.opportunityType
            target_opp.role_category = item.roleCategory
            target_opp.domain = item.domain
            target_opp.location = item.location.strip()
            target_opp.work_mode = norm_mode
            target_opp.compensation_min = item.compensationMin
            target_opp.compensation_max = item.compensationMax or item.compensationMin
            target_opp.compensation_currency = item.compensationCurrency
            target_opp.updated_at = now
            target_opp.last_seen_at = now
            for src in sources_by_opp_id.get(target_opp.id, []):
                if src.external_id.lower() == item.externalId.lower():
                    src.last_checked_at = now
                    src.source_status = "active" if item.httpReachable else "unreachable"
            matched_org = orgs_by_id.get(target_opp.organization_id)
            if details_changed and matched_org is not None:
                _persist_trust_and_analysis(
                    db, target_opp, matched_org, force_refresh=True, allow_llm=False
                )
            evaluate_opportunity_freshness(
                target_opp,
                sources_by_opp_id.get(target_opp.id, []),
                http_check_reachable=item.httpReachable,
            )
            idempotent_count += 1
            outcomes.append(
                IngestionRecordOutcomeSchema(
                    externalId=item.externalId,
                    sourceName=item.sourceName,
                    rawTitle=item.title,
                    normalizedTitle=norm_title,
                    rawOrganization=item.organizationName,
                    normalizedOrganization=norm_org,
                    canonicalUrl=canonical_url,
                    action="idempotent_update",
                    opportunityId=target_opp.id,
                    reason=match.matched_reason or "Idempotent source refresh",
                )
            )
            continue

        if match.status == "cross_source_duplicate" and match.matched_opportunity_id:
            target_opp = next(
                o for o in existing_opps if o.id == match.matched_opportunity_id
            )
            if item.externalId.startswith(("native_", "worldwide_")):
                details_changed = (
                    target_opp.location != item.location.strip()
                    or target_opp.work_mode != norm_mode
                    or target_opp.role_category != item.roleCategory
                    or target_opp.domain != item.domain
                    or target_opp.title != item.title.strip()
                )
                target_opp.title = item.title.strip()
                target_opp.normalized_title = norm_title
                target_opp.description = item.description.strip()
                target_opp.role_category = item.roleCategory
                target_opp.domain = item.domain
                target_opp.location = item.location.strip()
                target_opp.work_mode = norm_mode
                target_opp.updated_at = now
                matched_org = orgs_by_id.get(target_opp.organization_id)
                if details_changed and matched_org is not None:
                    _persist_trust_and_analysis(
                        db, target_opp, matched_org, force_refresh=True, allow_llm=False
                    )
            target_opp.last_seen_at = now
            opp_sources = sources_by_opp_id.setdefault(target_opp.id, [])
            already_linked = any(
                s.source_name.lower() == item.sourceName.lower()
                and s.external_id.lower() == item.externalId.lower()
                for s in opp_sources
            )
            if not already_linked:
                new_src = OpportunitySource(
                    id=f"src_merged_{int(time.time() * 1000)}_{idx}",
                    opportunity_id=target_opp.id,
                    source_name=item.sourceName,
                    source_url=canonical_url,
                    external_id=item.externalId,
                    source_published_at=now,
                    last_checked_at=now,
                    source_status="active" if item.httpReachable else "unreachable",
                )
                db.add(new_src)
                opp_sources.append(new_src)

            evaluate_opportunity_freshness(
                target_opp, opp_sources, http_check_reachable=item.httpReachable
            )
            merged_count += 1
            outcomes.append(
                IngestionRecordOutcomeSchema(
                    externalId=item.externalId,
                    sourceName=item.sourceName,
                    rawTitle=item.title,
                    normalizedTitle=norm_title,
                    rawOrganization=item.organizationName,
                    normalizedOrganization=norm_org,
                    canonicalUrl=canonical_url,
                    action="duplicate_merged",
                    opportunityId=target_opp.id,
                    reason=match.matched_reason or "Merged secondary provenance source",
                )
            )
            continue

        # Create new normalized Organization (or reuse existing normalized match) and Opportunity
        matched_org = next(
            (o for o in orgs_by_id.values() if o.normalized_name == norm_org),
            None,
        )
        if matched_org is None:
            org_id = f"org_ing_{int(time.time() * 1000)}_{idx}"
            email_dom = (
                item.recruiterContactEmail.split("@", 1)[1].lower()
                if item.recruiterContactEmail and "@" in item.recruiterContactEmail
                else None
            )
            matched_org = Organization(
                id=org_id,
                name=item.organizationName.strip(),
                normalized_name=norm_org,
                official_website=item.officialWebsite,
                description=f"Ingested via compliant feed ({item.sourceName}).",
                recruiter_email_domain=email_dom,
                verification_metadata={
                    "domainVerified": bool(item.officialWebsite),
                    "hasPublicEngineeringFootprint": True,
                    "knownEntity": True,
                    "notes": f"Ingested from {item.sourceName} ({item.externalId}).",
                },
            )
            db.add(matched_org)
            db.flush()
            orgs_by_id[matched_org.id] = matched_org

        opp_id = f"opp_ing_{int(time.time() * 1000)}_{idx}"
        new_opp = Opportunity(
            id=opp_id,
            organization_id=matched_org.id,
            title=item.title.strip(),
            normalized_title=norm_title,
            description=item.description.strip(),
            opportunity_type=item.opportunityType,
            role_category=item.roleCategory,
            domain=item.domain,
            location=item.location.strip(),
            work_mode=norm_mode,
            compensation_min=item.compensationMin,
            compensation_max=item.compensationMax or item.compensationMin,
            compensation_currency=item.compensationCurrency,
            compensation_period=item.compensationPeriod,
            duration=item.duration,
            posted_at=item.postedAt or now,
            deadline=item.deadline,
            application_url=canonical_url,
            recruiter_contact_email=item.recruiterContactEmail,
            status="open" if item.httpReachable else "unverified_status",
            first_seen_at=now,
            last_seen_at=now,
            created_at=now,
            updated_at=now,
            is_sample_data=False,
        )
        db.add(new_opp)

        new_src = OpportunitySource(
            id=f"src_ing_{int(time.time() * 1000)}_{idx}",
            opportunity_id=opp_id,
            source_name=item.sourceName,
            source_url=canonical_url,
            external_id=item.externalId,
            source_published_at=now,
            last_checked_at=now,
            source_status="active" if item.httpReachable else "unreachable",
        )
        db.add(new_src)
        db.flush()

        _persist_trust_and_analysis(db, new_opp, matched_org, force_refresh=True)
        evaluate_opportunity_freshness(
            new_opp, [new_src], http_check_reachable=item.httpReachable
        )

        existing_opps.append(new_opp)
        sources_by_opp_id[opp_id] = [new_src]
        new_count += 1

        outcomes.append(
            IngestionRecordOutcomeSchema(
                externalId=item.externalId,
                sourceName=item.sourceName,
                rawTitle=item.title,
                normalizedTitle=norm_title,
                rawOrganization=item.organizationName,
                normalizedOrganization=norm_org,
                canonicalUrl=canonical_url,
                action="created_new",
                opportunityId=opp_id,
                reason="No existing match found; normalized and persisted with full provenance.",
            )
        )

    db.commit()
    return IngestionRunReportSchema(
        batchId=batch_id,
        executedAt=now,
        totalProcessed=len(feed_items),
        newOpportunitiesCreated=new_count,
        idempotentUpdates=idempotent_count,
        crossSourceDuplicatesMerged=merged_count,
        skippedExpired=skipped_expired_count,
        outcomes=outcomes,
    )


def get_ingestion_and_freshness_status(db: Session) -> dict[str, Any]:
    opps = list(db.scalars(select(Opportunity)).all())
    all_sources = list(db.scalars(select(OpportunitySource)).all())
    sources_by_opp: dict[str, list[OpportunitySource]] = {}
    for s in all_sources:
        sources_by_opp.setdefault(s.opportunity_id, []).append(s)

    freshness_records = [
        evaluate_opportunity_freshness(o, sources_by_opp.get(o.id, []))
        for o in opps
    ]
    multi_source_count = sum(
        1 for o in opps if len(sources_by_opp.get(o.id, [])) > 1
    )

    return {
        "totalOpportunities": len(opps),
        "totalProvenanceSources": len(all_sources),
        "multiSourceCorroboratedCount": multi_source_count,
        "freshnessSummary": {
            "fresh": sum(1 for r in freshness_records if r["freshnessState"] == "fresh"),
            "closingSoon": sum(
                1 for r in freshness_records if r["freshnessState"] == "closing_soon"
            ),
            "expired": sum(
                1 for r in freshness_records if r["freshnessState"] == "expired"
            ),
            "unreachableUnverified": sum(
                1
                for r in freshness_records
                if r["freshnessState"] == "unreachable_unverified"
            ),
        },
        "records": freshness_records,
    }

