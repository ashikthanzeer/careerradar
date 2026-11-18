from datetime import datetime, timezone
from app.models.entities import Opportunity, OpportunitySource


def evaluate_opportunity_freshness(
    opportunity: Opportunity,
    sources: list[OpportunitySource],
    reference_iso: str = "2026-11-17T12:00:00Z",
    http_check_reachable: bool | None = None,
) -> dict[str, str | int | bool | None]:
    """
    Opportunity Freshness & Availability Tracker (PRD §11, AGENTS.md §8).
    CRITICAL RULE (PRD §11):
    'A failed HTTP request does not automatically prove that an opportunity is closed.'
    When an HTTP check fails, the source is marked 'unreachable' and opportunity status
    becomes 'unverified_status' rather than 'expired'.
    """
    ref_dt = datetime.fromisoformat(reference_iso.replace("Z", "+00:00"))

    days_until_deadline: int | None = None
    if opportunity.deadline:
        try:
            dl_dt = datetime.fromisoformat(opportunity.deadline.replace("Z", "+00:00"))
            if dl_dt.tzinfo is None:
                dl_dt = dl_dt.replace(tzinfo=timezone.utc)
            days_until_deadline = round((dl_dt - ref_dt).total_seconds() / 86400)
        except Exception:
            days_until_deadline = None

    has_unreachable_source = any(src.source_status == "unreachable" for src in sources)
    if http_check_reachable is False or (
        http_check_reachable is None
        and (has_unreachable_source or opportunity.status == "unverified_status")
    ):
        # Failed HTTP request does NOT mark opportunity as closed/expired!
        for src in sources:
            src.source_status = "unreachable"
        opportunity.status = "unverified_status"
        freshness_state = "unreachable_unverified"
        explanation = (
            "Last HTTP check to source URL did not succeed. Per PRD §11, a transient network/HTTP "
            "failure does not prove the role is closed; marked for re-verification."
        )
    elif days_until_deadline is not None and days_until_deadline < 0:
        opportunity.status = "expired"
        freshness_state = "expired"
        explanation = f"Application deadline passed ({abs(days_until_deadline)} days ago)."
    elif days_until_deadline is not None and days_until_deadline <= 10:
        opportunity.status = "closing_soon"
        freshness_state = "closing_soon"
        explanation = f"Closing soon ({days_until_deadline} days remaining until deadline)."
    else:
        opportunity.status = "open"
        freshness_state = "fresh"
        explanation = "Active listing within valid application window."

    return {
        "opportunityId": opportunity.id,
        "title": opportunity.title,
        "status": opportunity.status,
        "freshnessState": freshness_state,
        "daysUntilDeadline": days_until_deadline,
        "firstSeenAt": opportunity.first_seen_at,
        "lastSeenAt": opportunity.last_seen_at,
        "sourceCount": len(sources),
        "primarySourceStatus": sources[0].source_status if sources else "active",
        "explanation": explanation,
    }
