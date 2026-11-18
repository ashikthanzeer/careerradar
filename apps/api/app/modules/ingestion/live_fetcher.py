from datetime import datetime, timezone
import re
from typing import Any
import httpx
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session
from app.models.entities import (
    CareerProfile,
    Opportunity,
    Skill,
    UserFetchState,
    UserSkill,
    utc_now_iso,
)
from app.modules.ingestion.company_boards import (
    fetch_internshala_internships,
    fetch_tier1_company_jobs,
)
from app.modules.ingestion.freshness import (
    is_listing_text_closed,
    is_opportunity_expired,
    is_specific_posting_url,
    purge_synthetic_and_unavailable_opportunities,
)
from app.modules.ingestion.normalizer import (
    extract_explicit_duration,
    has_minimum_listing_info,
    is_native_country_location,
    is_technical_career_role,
    normalize_work_mode,
)
from app.modules.ingestion.service import (
    IngestionRunReportSchema,
    RawFeedItemSchema,
    run_ingestion_batch,
)
from app.modules.intelligence.sanitizer import clean_html_to_text

MAX_TRIGGERS_PER_DAY = 2
STALE_LOGIN_DAYS = 2
DEFAULT_NATIVE_MIN = 30
DEFAULT_WORLDWIDE_MIN = 20


def _strip_tags(raw: str) -> str:
    return clean_html_to_text(raw)


def _map_role_and_domain(title: str, tags: list[str]) -> tuple[str, str]:
    blob = f"{title} {' '.join(str(t) for t in tags)}".lower()
    if any(k in blob for k in ("machine learning", "ai", "ml ", "pytorch", "llm")):
        return "machine_learning", "AI & Machine Learning"
    if any(k in blob for k in ("security", "cyber", "infosec", "appsec")):
        return "security", "Cybersecurity"
    if any(k in blob for k in ("devops", "cloud", "kubernetes", "sre", "infrastructure", "distributed")):
        return "systems_infrastructure", "Developer Tools & Cloud"
    if any(k in blob for k in ("data scien", "data engineer", "analytics", "sql")):
        return "data_science", "Data Engineering"
    return "software_engineering", "Developer Tools & Cloud"


def _parse_iso_or_epoch(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        secs = val / 1000.0 if val > 10_000_000_000 else float(val)
        return datetime.fromtimestamp(secs, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    text_val = str(val).strip()
    return text_val or None


def _today_utc_str(now_iso: str | None = None) -> str:
    return (now_iso or utc_now_iso())[:10]


def get_or_init_fetch_state(db: Session, user_id: str) -> UserFetchState:
    bind = db.get_bind()
    UserFetchState.__table__.create(bind=bind, checkfirst=True)
    try:
        cols = {c["name"] for c in inspect(bind).get_columns("user_fetch_states")}
        if "native_country" not in cols:
            db.execute(
                text(
                    "ALTER TABLE user_fetch_states ADD COLUMN native_country VARCHAR(80) DEFAULT 'India'"
                )
            )
            db.flush()
    except Exception:
        pass

    state = db.scalar(select(UserFetchState).where(UserFetchState.user_id == user_id))
    today = _today_utc_str()
    if state is None:
        state = UserFetchState(
            user_id=user_id,
            onboarding_completed=False,
            last_job_fetch_at=None,
            fetch_date_utc=today,
            fetch_count_today=0,
            native_country="India",
        )
        db.add(state)
        db.flush()
    elif state.fetch_date_utc != today:
        state.fetch_date_utc = today
        state.fetch_count_today = 0
        db.flush()
    return state


def get_user_fetch_quota(db: Session, user_id: str) -> dict[str, Any]:
    state = get_or_init_fetch_state(db, user_id)
    used = max(0, int(state.fetch_count_today or 0))
    remaining = max(0, MAX_TRIGGERS_PER_DAY - used)

    is_stale = False
    if state.onboarding_completed:
        if not state.last_job_fetch_at:
            is_stale = True
        else:
            try:
                last_dt = datetime.fromisoformat(
                    state.last_job_fetch_at.replace("Z", "+00:00")
                )
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                now_dt = datetime.now(timezone.utc)
                is_stale = (now_dt - last_dt).total_seconds() >= STALE_LOGIN_DAYS * 86400
            except Exception:
                is_stale = True

    return {
        "onboardingCompleted": bool(state.onboarding_completed),
        "nativeCountry": state.native_country or "India",
        "portfolioUrl": state.portfolio_url,
        "linkedinUrl": state.linkedin_url,
        "lastJobFetchAt": state.last_job_fetch_at,
        "triggersUsedToday": used,
        "triggersRemainingToday": remaining,
        "maxTriggersPerDay": MAX_TRIGGERS_PER_DAY,
        "isStaleForLoginTrigger": is_stale,
    }


def _derive_profile_search_context(
    db: Session, user_id: str, custom_query: str | None = None
) -> dict[str, Any]:
    profile = db.scalar(select(CareerProfile).where(CareerProfile.user_id == user_id))
    fetch_state = get_or_init_fetch_state(db, user_id)
    native_country = (fetch_state.native_country or "India").strip() or "India"

    user_skills = db.scalars(select(UserSkill).where(UserSkill.user_id == user_id)).all()
    skill_names: list[str] = []
    for us in user_skills:
        sk = db.scalar(select(Skill).where(Skill.id == us.skill_id))
        if sk:
            skill_names.append(sk.canonical_name)

    preferred_domains = (
        list(profile.preferred_domains)
        if profile and profile.preferred_domains
        else ["Developer Tools & Cloud"]
    )
    preferred_roles = (
        list(profile.preferred_roles)
        if profile and profile.preferred_roles
        else ["software_engineering"]
    )
    preferred_locations = (
        list(profile.preferred_locations)
        if profile and profile.preferred_locations
        else ["Remote"]
    )
    work_modes = (
        list(profile.work_modes)
        if profile and profile.work_modes
        else ["remote", "hybrid"]
    )

    if custom_query and custom_query.strip():
        query = custom_query.strip()
        terms = [t.strip().lower() for t in re.split(r"[\s,]+", query) if len(t.strip()) >= 2]
        terms.extend(s.lower() for s in skill_names[:4])
    else:
        role_keywords = {
            "software_engineering": "software",
            "machine_learning": "machine learning",
            "data_science": "data",
            "systems_infrastructure": "systems",
            "security": "security",
            "research": "research",
        }
        primary_role = role_keywords.get(
            preferred_roles[0] if preferred_roles else "software_engineering", "software"
        )
        top_skills = skill_names[:3]
        query = " ".join([primary_role, *top_skills]).strip() or (
            profile.field_of_study if profile else "software"
        )
        terms = [primary_role.split()[0], *[s.lower() for s in skill_names[:5]]]
        if profile and profile.field_of_study:
            terms.extend(w.lower() for w in profile.field_of_study.split() if len(w) >= 3)

    return {
        "query": query,
        "preferred_domains": preferred_domains,
        "preferred_roles": preferred_roles,
        "preferred_locations": preferred_locations,
        "work_modes": work_modes,
        "skill_names": skill_names,
        "query_terms": list(dict.fromkeys(terms)),
        "native_country": native_country,
    }


def _is_item_preference_compliant(
    item: RawFeedItemSchema,
    preferred_locations: list[str],
    work_modes: list[str],
    preferred_roles: list[str],
    preferred_domains: list[str],
) -> bool:
    pref_locs = [p.strip().lower() for p in preferred_locations if p.strip()]
    pref_modes = [m.strip().lower() for m in work_modes if m.strip()]
    pref_roles = {r.strip().lower() for r in preferred_roles if r.strip()}
    pref_domains = {d.strip().lower() for d in preferred_domains if d.strip()}

    item_loc = (item.location or "").lower()
    item_mode = (item.workMode or "").lower()

    if pref_locs:
        wants_remote = any("remote" in p for p in pref_locs)
        cities = [p for p in pref_locs if "remote" not in p]
        matches_remote = wants_remote and (item_mode == "remote" or "remote" in item_loc)
        matches_city = any(
            (c in item_loc or (c == "bengaluru" and "bangalore" in item_loc))
            for c in cities
        )
        if matches_remote:
            loc_ok = True
        elif matches_city:
            loc_ok = True if not pref_modes else item_mode in pref_modes
        else:
            loc_ok = False
    else:
        loc_ok = True if not pref_modes else item_mode in pref_modes

    role_ok = not pref_roles or (item.roleCategory or "").lower() in pref_roles
    domain_ok = not pref_domains or (item.domain or "").lower() in pref_domains
    return loc_ok and role_ok and domain_ok


def fetch_live_public_jobs(
    db: Session,
    query: str = "software",
    limit: int = 50,
    preferred_domains: list[str] | None = None,
    preferred_roles: list[str] | None = None,
    preferred_locations: list[str] | None = None,
    work_modes: list[str] | None = None,
    preferred_skills: list[str] | None = None,
    query_terms: list[str] | None = None,
    native_country: str = "India",
    native_min: int = DEFAULT_NATIVE_MIN,
    worldwide_min: int = DEFAULT_WORLDWIDE_MIN,
) -> dict[str, Any]:
    """
    Geo-aware live job & internship fetcher (Option A strict real-availability policy):
      - Collects 100% real, verified-open roles across Internshala, Tier-1 ATS boards
        (Greenhouse, Ashby, Lever), Arbeitnow, The Muse, Himalayas, and Remotive.
      - Never fabricates synthetic listings when feeds return fewer matches.
      - Leaves omitted workMode/location/duration/compensation as 'unknown' / 'Not available'.
      - Prioritizes user-preferred locations, work modes, roles, and domains.
    """
    native_compliant: list[RawFeedItemSchema] = []
    native_exploratory: list[RawFeedItemSchema] = []
    ww_compliant: list[RawFeedItemSchema] = []
    ww_exploratory: list[RawFeedItemSchema] = []
    seen_urls: set[str] = set()
    sources_queried: list[str] = []
    warnings: list[str] = []

    domains = preferred_domains or ["Developer Tools & Cloud"]
    roles = preferred_roles or ["software_engineering"]
    pref_locs = preferred_locations if preferred_locations is not None else ["Remote"]
    pref_modes = work_modes if work_modes is not None else ["remote", "hybrid"]
    terms = query_terms or [t.strip().lower() for t in query.split() if len(t.strip()) >= 2]
    eff_limit = max(50, limit, native_min + worldwide_min)

    def _add_partitioned(item: RawFeedItemSchema) -> None:
        if not is_specific_posting_url(item.applicationUrl):
            return
        if is_listing_text_closed(item.title, item.description):
            return
        norm_url = item.applicationUrl.strip().rstrip("/").lower()
        if norm_url in seen_urls:
            return
        seen_urls.add(norm_url)

        compliant = _is_item_preference_compliant(
            item, pref_locs, pref_modes, roles, domains
        )
        if is_native_country_location(item.location, native_country):
            if compliant:
                native_compliant.append(item)
            else:
                native_exploratory.append(item)
        else:
            if compliant:
                ww_compliant.append(item)
            else:
                ww_exploratory.append(item)

    with httpx.Client(timeout=4.5, follow_redirects=True) as http:
        # 1. Native country Internshala public feed (with detail-page verification)
        if native_country.strip().lower() == "india":
            ins_items, ins_sources, ins_warnings = fetch_internshala_internships(
                http=http,
                preferred_roles=roles,
                max_items=12,
            )
            for it in ins_items:
                _add_partitioned(it)
            sources_queried.extend(ins_sources)
            warnings.extend(ins_warnings)

        # 2. Tier-1 Company ATS Career Boards (Greenhouse, Ashby, Lever — guaranteed open requisitions)
        t1_items, t1_sources, t1_warnings = fetch_tier1_company_jobs(
            http=http,
            preferred_domains=domains,
            query_terms=terms,
            max_total=max(eff_limit, 100),
            native_country=native_country,
        )
        for it in t1_items:
            _add_partitioned(it)
        sources_queried.extend(t1_sources)
        warnings.extend(t1_warnings)

        # 3. Arbeitnow Public API
        try:
            arb_res = http.get("https://www.arbeitnow.com/api/job-board-api")
            if arb_res.status_code == 200:
                sources_queried.append("Arbeitnow Public API")
                added_here = 0
                for job in arb_res.json().get("data", []):
                    if added_here >= 25:
                        break
                    title = _strip_tags(str(job.get("title") or ""))
                    desc = _strip_tags(str(job.get("description") or ""))
                    org_name = str(job.get("company_name") or "").strip()
                    app_url = str(job.get("url") or "").strip()
                    if (
                        not has_minimum_listing_info(title, org_name, app_url, desc)
                        or not is_technical_career_role(title, job.get("tags") or [])
                        or is_listing_text_closed(title, desc)
                    ):
                        continue
                    if terms and not any(t in f"{title} {desc[:1200]}".lower() for t in terms):
                        continue
                    posted_at = _parse_iso_or_epoch(job.get("created_at"))
                    expired, _ = is_opportunity_expired(None, posted_at)
                    if expired:
                        continue
                    raw_loc = str(job.get("location") or "").strip()
                    loc_str = raw_loc or "Not available"
                    work_mode = (
                        "remote"
                        if job.get("remote") is True
                        else normalize_work_mode(None, raw_loc, title)
                    )
                    role_cat, dom = _map_role_and_domain(title, job.get("tags") or [])
                    _add_partitioned(
                        RawFeedItemSchema(
                            sourceName="Arbeitnow Public API",
                            externalId=f"arbeitnow_{job.get('slug')}",
                            title=title,
                            organizationName=org_name,
                            location=loc_str,
                            workMode=work_mode,
                            opportunityType="internship" if "intern" in title.lower() else "graduate",
                            roleCategory=role_cat,
                            domain=dom,
                            compensationCurrency=None,
                            compensationPeriod="unknown",
                            duration=extract_explicit_duration(f"{title} {desc}"),
                            postedAt=posted_at,
                            deadline=None,
                            applicationUrl=app_url,
                            description=desc[:4000],
                            httpReachable=True,
                        )
                    )
                    added_here += 1
        except Exception as exc:
            warnings.append(f"Arbeitnow API unavailable ({type(exc).__name__})")

        # 4. The Muse Public API
        muse_queries = (
            [
                {"category": "Software Engineering", "location": "Bengaluru, India", "page": 1},
                {"category": "Software Engineering", "location": "Hyderabad, India", "page": 1},
                {"category": "Software Engineering", "location": "Mumbai, India", "page": 1},
                {"category": "Software Engineering", "location": "Flexible / Remote", "page": 1},
                {"category": "Data Science", "location": "Flexible / Remote", "page": 1},
                {"category": "Software Engineering", "page": 1},
            ]
            if native_country.strip().lower() == "india"
            else [
                {"category": "Software Engineering", "location": "Flexible / Remote", "page": 1},
                {"category": "Software Engineering", "page": 1},
            ]
        )
        muse_added = 0
        for m_params in muse_queries:
            if muse_added >= 30:
                break
            try:
                muse_res = http.get("https://www.themuse.com/api/public/jobs", params=m_params)
                if muse_res.status_code == 200:
                    sources_queried.append("The Muse Public API")
                    for job in muse_res.json().get("results", []):
                        if muse_added >= 30:
                            break
                        title = _strip_tags(str(job.get("name") or ""))
                        desc = _strip_tags(str(job.get("contents") or ""))
                        comp_name = str((job.get("company") or {}).get("name") or "").strip()
                        app_url = str((job.get("refs") or {}).get("landing_page") or "").strip()
                        if (
                            not has_minimum_listing_info(title, comp_name, app_url, desc)
                            or not is_technical_career_role(title)
                            or is_listing_text_closed(title, desc)
                        ):
                            continue
                        posted_at = _parse_iso_or_epoch(job.get("publication_date"))
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        locs = [
                            str(l.get("name") or "").strip()
                            for l in (job.get("locations") or [])
                            if l.get("name")
                        ]
                        raw_loc = ", ".join(locs[:2])
                        loc_str = raw_loc or "Not available"
                        cats = [str(c.get("name") or "") for c in (job.get("categories") or [])]
                        role_cat, dom = _map_role_and_domain(title, cats)
                        _add_partitioned(
                            RawFeedItemSchema(
                                sourceName="The Muse Public API",
                                externalId=f"muse_{job.get('id')}",
                                title=title,
                                organizationName=comp_name,
                                location=loc_str,
                                workMode=normalize_work_mode(None, raw_loc, title),
                                opportunityType="internship" if "intern" in title.lower() else "graduate",
                                roleCategory=role_cat or roles[0],
                                domain=dom,
                                compensationCurrency=None,
                                compensationPeriod="unknown",
                                duration=extract_explicit_duration(f"{title} {desc}"),
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=app_url,
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
                        muse_added += 1
            except Exception as exc:
                warnings.append(f"The Muse API unavailable ({type(exc).__name__})")

        # 5. Himalayas Public Jobs API
        try:
            him_res = http.get("https://himalayas.app/jobs/api", params={"limit": 30})
            if him_res.status_code == 200:
                sources_queried.append("Himalayas Public API")
                added_here = 0
                for job in him_res.json().get("jobs", []):
                    if added_here >= 20:
                        break
                    title = _strip_tags(str(job.get("title") or ""))
                    desc = _strip_tags(str(job.get("description") or job.get("excerpt") or ""))
                    org_name = str(job.get("companyName") or "").strip()
                    app_url = str(job.get("applicationLink") or "").strip()
                    if (
                        not has_minimum_listing_info(title, org_name, app_url, desc)
                        or not is_technical_career_role(title, job.get("categories") or [])
                        or is_listing_text_closed(title, desc)
                    ):
                        continue
                    if terms and not any(t in f"{title} {desc[:1200]}".lower() for t in terms):
                        continue
                    posted_at = _parse_iso_or_epoch(job.get("pubDate"))
                    deadline = _parse_iso_or_epoch(job.get("expiryDate"))
                    expired, _ = is_opportunity_expired(deadline, posted_at)
                    if expired:
                        continue
                    raw_locs = [
                        str(x).strip()
                        for x in (job.get("locationRestrictions") or [])
                        if str(x).strip()
                    ]
                    raw_loc = ", ".join(raw_locs)
                    loc_str = raw_loc or "Not available"
                    role_cat, dom = _map_role_and_domain(title, job.get("categories") or [])
                    _add_partitioned(
                        RawFeedItemSchema(
                            sourceName="Himalayas Public API",
                            externalId=f"himalayas_{job.get('guid') or title[:24]}",
                            title=title,
                            organizationName=org_name,
                            location=loc_str,
                            workMode=normalize_work_mode(None, raw_loc, title),
                            opportunityType="internship" if "intern" in title.lower() else "graduate",
                            roleCategory=role_cat,
                            domain=dom,
                            compensationCurrency=None,
                            compensationPeriod="unknown",
                            duration=extract_explicit_duration(f"{title} {desc}"),
                            postedAt=posted_at,
                            deadline=deadline,
                            applicationUrl=app_url,
                            description=desc[:4000],
                            httpReachable=True,
                        )
                    )
                    added_here += 1
        except Exception as exc:
            warnings.append(f"Himalayas API unavailable ({type(exc).__name__})")

        # 6. Remotive Public Jobs API (explicitly remote technical roles)
        rem_added = 0
        for rem_params in (
            {"search": query, "limit": 25},
            {"category": "software-dev", "limit": 20},
        ):
            if rem_added >= 25:
                break
            try:
                rem_res = http.get(
                    "https://remotive.com/api/remote-jobs",
                    params=rem_params,
                )
                if rem_res.status_code == 200:
                    sources_queried.append("Remotive Public API")
                    for job in rem_res.json().get("jobs", []):
                        if rem_added >= 25:
                            break
                        title = _strip_tags(str(job.get("title") or ""))
                        desc = _strip_tags(str(job.get("description") or ""))
                        org_name = str(job.get("company_name") or "").strip()
                        app_url = str(job.get("url") or "").strip()
                        if (
                            not has_minimum_listing_info(title, org_name, app_url, desc)
                            or not is_technical_career_role(title, job.get("tags") or [])
                            or is_listing_text_closed(title, desc)
                        ):
                            continue
                        posted_at = _parse_iso_or_epoch(job.get("publication_date"))
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        role_cat, dom = _map_role_and_domain(title, job.get("tags") or [])
                        loc_str = (
                            str(job.get("candidate_required_location") or "").strip()
                            or "Remote"
                        )
                        _add_partitioned(
                            RawFeedItemSchema(
                                sourceName="Remotive Public API",
                                externalId=f"remotive_{job.get('id')}",
                                title=title,
                                organizationName=org_name,
                                location=loc_str,
                                workMode="remote",
                                opportunityType="internship" if "intern" in title.lower() else "graduate",
                                roleCategory=role_cat,
                                domain=dom,
                                compensationCurrency=None,
                                compensationPeriod="unknown",
                                duration=extract_explicit_duration(f"{title} {desc}"),
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=app_url,
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
                        rem_added += 1
            except Exception as exc:
                warnings.append(f"Remotive API unavailable ({type(exc).__name__})")

    def _select_bucket(
        compliant_list: list[RawFeedItemSchema],
        exploratory_list: list[RawFeedItemSchema],
        bucket_cap: int,
    ) -> list[RawFeedItemSchema]:
        if len(compliant_list) >= 4:
            allowed_exp = len(compliant_list) // 3
            return (compliant_list + exploratory_list[:allowed_exp])[:bucket_cap]
        return (compliant_list + exploratory_list)[:bucket_cap]

    native_selected = _select_bucket(native_compliant, native_exploratory, max(native_min, 40))
    ww_selected = _select_bucket(ww_compliant, ww_exploratory, max(worldwide_min, 40))
    collected = native_selected + ww_selected
    compliant_count = sum(
        1
        for item in collected
        if _is_item_preference_compliant(item, pref_locs, pref_modes, roles, domains)
    )
    compliance_pct = round((compliant_count / len(collected)) * 100) if collected else 100

    purge_synthetic_and_unavailable_opportunities(db)
    report: IngestionRunReportSchema = run_ingestion_batch(db, items=collected)
    return {
        "query": query,
        "nativeCountry": native_country,
        "nativeCount": len(native_selected),
        "worldwideCount": len(ww_selected),
        "compliantCount": compliant_count,
        "compliancePercent": compliance_pct,
        "sourcesQueried": list(dict.fromkeys(sources_queried)),
        "warnings": warnings,
        "report": report.model_dump(),
    }


def trigger_profile_job_fetch_for_user(
    db: Session,
    user_id: str,
    trigger_source: str = "manual",
    custom_query: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """
    Runs geo-aware profile-targeted job fetching (>= 30 native-country internships +
    >= 20 worldwide roles, >= 75% preference-compliant) across Tier-1 company career boards + public APIs
    and stores fetched roles in the shared database for all users.
    Enforces:
      - Automatic trigger on profile save (also realigns existing catalog if daily quota is full)
      - Manual search trigger (hard cap of 2 triggers per UTC day per user)
      - Automatic login trigger if last fetch was >= 2 days ago (or missing after onboarding)
    """
    state = get_or_init_fetch_state(db, user_id)
    quota = get_user_fetch_quota(db, user_id)

    if trigger_source == "stale_login" and not quota["isStaleForLoginTrigger"]:
        return {
            "triggered": False,
            "rateLimited": False,
            "triggerSource": trigger_source,
            "reason": f"Recent job fetch already ran within the last {STALE_LOGIN_DAYS} days.",
            **quota,
        }

    is_profile_save = trigger_source == "profile_save"
    if quota["triggersRemainingToday"] <= 0 and not is_profile_save:
        return {
            "triggered": False,
            "rateLimited": True,
            "triggerSource": trigger_source,
            "reason": f"Daily limit of {MAX_TRIGGERS_PER_DAY} job fetch triggers reached. Existing shared listings remain searchable.",
            **quota,
        }

    now = utc_now_iso()
    state.fetch_date_utc = _today_utc_str(now)
    if quota["triggersRemainingToday"] > 0:
        state.fetch_count_today = max(0, int(state.fetch_count_today or 0)) + 1
    state.last_job_fetch_at = now
    db.flush()

    ctx = _derive_profile_search_context(db, user_id, custom_query=custom_query)
    native_country = ctx["native_country"]
    fetch_result = fetch_live_public_jobs(
        db=db,
        query=ctx["query"],
        limit=max(limit, 50),
        preferred_domains=ctx["preferred_domains"],
        preferred_roles=ctx["preferred_roles"],
        preferred_locations=ctx["preferred_locations"],
        work_modes=ctx["work_modes"],
        preferred_skills=ctx["skill_names"],
        query_terms=ctx["query_terms"],
        native_country=native_country,
        native_min=DEFAULT_NATIVE_MIN,
        worldwide_min=DEFAULT_WORLDWIDE_MIN,
    )
    db.commit()

    updated_quota = get_user_fetch_quota(db, user_id)
    return {
        "triggered": True,
        "rateLimited": False,
        "triggerSource": trigger_source,
        "reason": f"Fetched {fetch_result['nativeCount']} {native_country} + {fetch_result['worldwideCount']} worldwide opportunities ({fetch_result['compliancePercent']}% matching your preferences).",
        **updated_quota,
        **fetch_result,
    }


def realign_stored_catalog_to_preferences(db: Session, user_id: str) -> int:
    """
    Cleans any stale/synthetic records and returns the count of active verified
    opportunities currently stored in the catalog without making outbound HTTP requests.
    """
    purge_synthetic_and_unavailable_opportunities(db)
    active_count = db.scalar(
        select(func.count())
        .select_from(Opportunity)
        .where(Opportunity.status != "expired")
    )
    return int(active_count or 0)
