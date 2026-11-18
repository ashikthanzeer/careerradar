from datetime import datetime, timezone
import re
from app.models.entities import Opportunity, OpportunitySource, utc_now_iso

MAX_AGE_DAYS_WITHOUT_DEADLINE = 90

CLOSED_LISTING_PATTERN = re.compile(
    r"\b(?:no longer accepting applications|job is no longer available|"
    r"position has been filled|this position is closed|internship is closed|"
    r"applications are closed|posting has been removed|404 not found|"
    r"page not found|no longer open|listing has expired|role has been filled)\b",
    re.IGNORECASE,
)


def is_listing_text_closed(title: str | None, description: str | None = "") -> bool:
    """Returns True when title or description explicitly states the opening is closed or removed."""
    combined = f"{title or ''} {description or ''}"
    return bool(CLOSED_LISTING_PATTERN.search(combined))


def _parse_iso_datetime(raw: str | None, end_of_day_for_date_only: bool = False) -> datetime | None:
    if not raw or not str(raw).strip():
        return None
    cleaned = str(raw).strip()
    try:
        is_date_only = len(cleaned) == 10 and cleaned[4] == "-" and cleaned[7] == "-"
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            if is_date_only and end_of_day_for_date_only:
                dt = dt.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            else:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def is_opportunity_expired(
    deadline: str | None,
    posted_at: str | None,
    reference_iso: str | None = None,
    max_age_days_without_deadline: int = MAX_AGE_DAYS_WITHOUT_DEADLINE,
) -> tuple[bool, str]:
    """
    Determines whether a listing has expired:
    - Explicit deadline < current reference UTC time -> expired.
    - No explicit deadline, but posted_at / first_seen_at > 90 days old -> expired.
    """
    ref_dt = _parse_iso_datetime(reference_iso or utc_now_iso()) or datetime.now(timezone.utc)

    if deadline and str(deadline).strip():
        dl_dt = _parse_iso_datetime(deadline, end_of_day_for_date_only=True)
        if dl_dt is not None and (dl_dt - ref_dt).total_seconds() < 0:
            days_past = max(1, round((ref_dt - dl_dt).total_seconds() / 86400))
            return True, f"Application deadline passed ({days_past} day(s) ago)."
        return False, ""

    if posted_at and str(posted_at).strip():
        posted_dt = _parse_iso_datetime(posted_at, end_of_day_for_date_only=False)
        if posted_dt is not None:
            age_days = (ref_dt - posted_dt).total_seconds() / 86400
            if age_days > max_age_days_without_deadline:
                return (
                    True,
                    f"Listing exceeded the {max_age_days_without_deadline}-day maximum active window for roles without an explicit deadline.",
                )
    return False, ""


def evaluate_opportunity_freshness(
    opportunity: Opportunity,
    sources: list[OpportunitySource],
    reference_iso: str | None = None,
    http_check_reachable: bool | None = None,
) -> dict[str, str | int | bool | None]:
    """
    Opportunity Freshness & Availability Tracker (PRD §11, AGENTS.md §8).
    CRITICAL RULE (PRD §11):
    'A failed HTTP request does not automatically prove that an opportunity is closed.'
    When an HTTP check fails, the source is marked 'unreachable' and opportunity status
    becomes 'unverified_status' rather than 'expired'.
    """
    effective_ref = reference_iso or utc_now_iso()
    ref_dt = _parse_iso_datetime(effective_ref) or datetime.now(timezone.utc)

    days_until_deadline: int | None = None
    if opportunity.deadline:
        dl_dt = _parse_iso_datetime(opportunity.deadline, end_of_day_for_date_only=True)
        if dl_dt is not None:
            days_until_deadline = round((dl_dt - ref_dt).total_seconds() / 86400)

    expired_check, expired_reason = is_opportunity_expired(
        opportunity.deadline,
        opportunity.posted_at or opportunity.first_seen_at,
        reference_iso=effective_ref,
    )

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
    elif (days_until_deadline is not None and days_until_deadline < 0) or expired_check:
        opportunity.status = "expired"
        freshness_state = "expired"
        explanation = expired_reason or (
            f"Application deadline passed ({abs(days_until_deadline or 0)} days ago)."
        )
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
