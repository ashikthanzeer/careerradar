from datetime import datetime, timezone
import re
from urllib.parse import urlparse
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import (
    Application,
    Opportunity,
    OpportunityAnalysis,
    OpportunitySkill,
    OpportunitySource,
    SavedOpportunity,
    TrustAssessment,
    TrustEvidence,
    utc_now_iso,
)

MAX_AGE_DAYS_WITHOUT_DEADLINE = 90

CLOSED_LISTING_PATTERN = re.compile(
    r"\b(?:no longer accepting(?: applications)?|job is no longer available|"
    r"position has been filled|this position is closed|this internship is closed|"
    r"internship is closed|internship has expired|applications are closed|"
    r"application window has closed|posting has been removed|404 not found|"
    r"page not found|no longer open|listing has expired|this job has expired|"
    r"role has been filled|job is closed|requisition is closed|position is closed|"
    r"role is closed)\b",
    re.IGNORECASE,
)

GENERIC_CAREER_URL_PATH_PATTERN = re.compile(
    r"^/(?:"
    r"(?:[a-z]{2}(?:-[a-z]{2})?/)*(?:careers|jobs|internships|about(?:/careers)?|"
    r"company/careers(?:/all-jobs)?|dbt-labs/careers|join-us|open-positions|"
    r"work-with-us|apply|students|university|jobs/university|careers/jobs|"
    r"careers/results|jobs/results|search-results|global/[a-z]{2}/search)"
    r")/?$",
    re.IGNORECASE,
)

SPECIFIC_JOB_QUERY_KEYS = ("gh_jid=", "jk=", "jobid=", "job_id=", "reqid=", "id=", "jid=", "posting_id=")


def is_specific_posting_url(url: str | None) -> bool:
    """
    Returns True only when the URL appears to target an individual job posting
    (has a specific job path slug or job ID query parameter) rather than a generic
    company careers homepage or search results portal.
    """
    if not url or not str(url).strip():
        return False
    try:
        parsed = urlparse(str(url).strip())
    except Exception:
        return False

    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return False

    query_lower = (parsed.query or "").lower()
    if any(key in query_lower for key in SPECIFIC_JOB_QUERY_KEYS):
        return True

    path = (parsed.path or "").strip()
    if not path or path == "/":
        return False
    if GENERIC_CAREER_URL_PATH_PATTERN.match(path):
        return False
    return True


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


def verify_listing_availability(
    url: str | None,
    title: str = "",
    description: str = "",
    deadline: str | None = None,
    posted_at: str | None = None,
    perform_http_check: bool = False,
) -> tuple[bool, str]:
    """
    Two-stage live availability verification gate:
    1. Specific job URL + deadline/age + closed-text check.
    2. Optional live HTTP check rejecting 4xx/5xx, redirects to generic career portals,
       or closed-application banners in the destination HTML.
    """
    if not is_specific_posting_url(url):
        return (
            False,
            "URL points to a generic career portal rather than a specific open job listing.",
        )

    expired, exp_reason = is_opportunity_expired(deadline, posted_at)
    if expired:
        return False, exp_reason

    if is_listing_text_closed(title, description):
        return (
            False,
            "Listing text indicates applications are closed or the position is no longer available.",
        )

    if not perform_http_check:
        return True, "Listing passed static availability verification."

    try:
        with httpx.Client(
            timeout=4.5,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        ) as http:
            resp = http.get(str(url).strip())
        if resp.status_code >= 400:
            return False, f"Source URL returned HTTP {resp.status_code}."
        final_url = str(getattr(resp, "url", "") or "")
        if final_url and not is_specific_posting_url(final_url):
            return (
                False,
                "Source URL redirected to a generic career page (listing closed).",
            )
        snippet = (resp.text or "")[:25000]
        if snippet:
            headings = " ".join(
                re.findall(
                    r"<(?:title|h1|h2|div[^>]*alert)[^>]*>(.*?)</(?:title|h1|h2|div)>",
                    snippet,
                    flags=re.IGNORECASE | re.DOTALL,
                )
            )
            headings_clean = re.sub(r"<[^>]+>", " ", headings)
            body_clean = re.sub(r"<[^>]+>", " ", snippet[:12000])
            if is_listing_text_closed(headings_clean, body_clean):
                return (
                    False,
                    "Destination page indicates the job listing is closed.",
                )
        return True, "Listing verified as active."
    except Exception as exc:
        # Per PRD §11: transient network failures shouldn't falsely mark open jobs dead
        return True, f"Transient verification skip ({type(exc).__name__})."


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


LEGACY_HARDCODED_DURATIONS = {
    "programme / full-time",
    "early career / internship",
    "internship / early career",
    "full-time / programme",
    "internship / programme",
    "unknown duration",
}


def purge_synthetic_and_unavailable_opportunities(db: Session) -> int:
    """
    Purges legacy synthetic listings (native_*/worldwide_* portal templates),
    generic career-portal URLs lacking a specific job ID/slug, and explicitly
    closed listings from the database in FK-safe order.
    Also normalizes legacy hardcoded duration labels to 'Not available'.
    """
    all_opps = list(db.scalars(select(Opportunity)).all())
    if not all_opps:
        return 0

    all_sources = list(db.scalars(select(OpportunitySource)).all())
    bad_ids: set[str] = set()

    for src in all_sources:
        ext = (src.external_id or "").lower()
        sname = (src.source_name or "").lower()
        if ext.startswith(("native_", "worldwide_")) or sname.endswith(
            ("official careers", "official career portal")
        ):
            bad_ids.add(src.opportunity_id)

    for opp in all_opps:
        if not is_specific_posting_url(opp.application_url):
            bad_ids.add(opp.id)
        elif is_listing_text_closed(opp.title, opp.description):
            bad_ids.add(opp.id)

    dirty = False
    if bad_ids:
        trust_ids = [
            ta.id
            for ta in db.scalars(
                select(TrustAssessment).where(TrustAssessment.opportunity_id.in_(bad_ids))
            ).all()
        ]
        if trust_ids:
            for ev in db.scalars(
                select(TrustEvidence).where(TrustEvidence.trust_assessment_id.in_(trust_ids))
            ).all():
                db.delete(ev)
            for ta in db.scalars(
                select(TrustAssessment).where(TrustAssessment.id.in_(trust_ids))
            ).all():
                db.delete(ta)

        for model_cls in (
            OpportunitySkill,
            OpportunityAnalysis,
            OpportunitySource,
            SavedOpportunity,
            Application,
        ):
            for row in db.scalars(
                select(model_cls).where(model_cls.opportunity_id.in_(bad_ids))
            ).all():
                db.delete(row)

        for opp in db.scalars(select(Opportunity).where(Opportunity.id.in_(bad_ids))).all():
            db.delete(opp)
        dirty = True

    for opp in all_opps:
        if opp.id in bad_ids:
            continue
        if (opp.duration or "").strip().lower() in LEGACY_HARDCODED_DURATIONS:
            opp.duration = "Not available"
            dirty = True

    if dirty:
        db.commit()

    return len(bad_ids)
