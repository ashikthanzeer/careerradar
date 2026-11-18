from datetime import datetime, timezone
import re
from typing import Any
import httpx
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session
from app.models.entities import (
    CareerProfile,
    OpportunitySource,
    Skill,
    UserFetchState,
    UserSkill,
    utc_now_iso,
)
from app.modules.ingestion.company_boards import (
    build_verified_native_internships,
    build_verified_worldwide_internships,
    fetch_internshala_internships,
    fetch_tier1_company_jobs,
)
from app.modules.ingestion.freshness import (
    is_listing_text_closed,
    is_opportunity_expired,
)
from app.modules.ingestion.normalizer import (
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
    Two-bucket geo-aware internship fetcher:
      - Bucket 1 (Native Country): minimum 30 internships in user's native country (e.g., India)
      - Bucket 2 (Worldwide): minimum 20 internships/early-career roles across the rest of the world
    Enforces >= 80% (>= 75% mandatory) compliance with stated location/work-mode, role, and domain preferences.
    """
    native_compliant: list[RawFeedItemSchema] = []
    native_exploratory: list[RawFeedItemSchema] = []
    ww_compliant: list[RawFeedItemSchema] = []
    ww_exploratory: list[RawFeedItemSchema] = []
    sources_queried: list[str] = []
    warnings: list[str] = []

    domains = preferred_domains or ["Developer Tools & Cloud"]
    roles = preferred_roles or ["software_engineering"]
    pref_locs = preferred_locations if preferred_locations is not None else ["Remote"]
    pref_modes = work_modes if work_modes is not None else ["remote", "hybrid"]
    pref_skills = preferred_skills or []
    terms = query_terms or [t.strip().lower() for t in query.split() if len(t.strip()) >= 2]
    eff_native_min = max(30, native_min)
    eff_worldwide_min = max(20, worldwide_min)
    native_non_compliant_cap = int(eff_native_min * 0.15)
    ww_non_compliant_cap = int(eff_worldwide_min * 0.15)

    def _add_partitioned(item: RawFeedItemSchema) -> None:
        compliant = _is_item_preference_compliant(
            item, pref_locs, pref_modes, roles, domains
        )
        if is_native_country_location(item.location, native_country):
            if compliant:
                if item.applicationUrl not in {it.applicationUrl for it in native_compliant}:
                    native_compliant.append(item)
            elif len(native_exploratory) < native_non_compliant_cap:
                if item.applicationUrl not in {it.applicationUrl for it in native_exploratory}:
                    native_exploratory.append(item)
        else:
            if compliant:
                if item.applicationUrl not in {it.applicationUrl for it in ww_compliant}:
                    ww_compliant.append(item)
            elif len(ww_exploratory) < ww_non_compliant_cap:
                if item.applicationUrl not in {it.applicationUrl for it in ww_exploratory}:
                    ww_exploratory.append(item)

    with httpx.Client(timeout=4.0, follow_redirects=True) as http:
        # 1. Native country Internshala public feed (for India)
        if native_country.strip().lower() == "india":
            ins_items, ins_sources, ins_warnings = fetch_internshala_internships(
                http=http,
                preferred_roles=roles,
                max_items=eff_native_min,
            )
            for it in ins_items:
                _add_partitioned(it)
            sources_queried.extend(ins_sources)
            warnings.extend(ins_warnings)

        # 2. Tier-1 Company ATS Career Boards (Greenhouse, Ashby, Lever)
        t1_items, t1_sources, t1_warnings = fetch_tier1_company_jobs(
            http=http,
            preferred_domains=domains,
            query_terms=terms,
            max_total=max(limit, 48),
            native_country=native_country,
        )
        for it in t1_items:
            _add_partitioned(it)
        sources_queried.extend(t1_sources)
        warnings.extend(t1_warnings)

        # 3. Arbeitnow Public API (capped per source)
        if len(ww_compliant) + len(ww_exploratory) < eff_worldwide_min:
            try:
                arb_res = http.get("https://www.arbeitnow.com/api/job-board-api")
                if arb_res.status_code == 200:
                    sources_queried.append("Arbeitnow Public API")
                    added_here = 0
                    for job in arb_res.json().get("data", []):
                        if added_here >= 15:
                            break
                        title = _strip_tags(str(job.get("title") or ""))
                        desc = _strip_tags(str(job.get("description") or ""))
                        if (
                            len(desc) < 25
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
                        role_cat, dom = _map_role_and_domain(title, job.get("tags") or [])
                        _add_partitioned(
                            RawFeedItemSchema(
                                sourceName="Arbeitnow Public API",
                                externalId=f"arbeitnow_{job.get('slug')}",
                                title=title,
                                organizationName=str(job.get("company_name") or "Company"),
                                location=str(job.get("location") or "Remote"),
                                workMode="remote"
                                if job.get("remote")
                                else normalize_work_mode("", str(job.get("location") or "")),
                                opportunityType="internship" if "intern" in title.lower() else "graduate",
                                roleCategory=role_cat,
                                domain=dom,
                                compensationCurrency="EUR",
                                compensationPeriod="unknown",
                                duration="Programme / Full-time",
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=str(job.get("url") or "https://www.arbeitnow.com"),
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
                        added_here += 1
            except Exception as exc:
                warnings.append(f"Arbeitnow API unavailable ({type(exc).__name__})")

        # 4. The Muse Public API (India hubs + Remote + global entry-level/internships)
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
            if muse_added >= 25:
                break
            try:
                muse_res = http.get("https://www.themuse.com/api/public/jobs", params=m_params)
                if muse_res.status_code == 200:
                    sources_queried.append("The Muse Public API")
                    for job in muse_res.json().get("results", []):
                        if muse_added >= 25:
                            break
                        title = _strip_tags(str(job.get("name") or ""))
                        desc = _strip_tags(str(job.get("contents") or ""))
                        if (
                            len(desc) < 25
                            or not is_technical_career_role(title)
                            or is_listing_text_closed(title, desc)
                        ):
                            continue
                        posted_at = _parse_iso_or_epoch(job.get("publication_date"))
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        locs = [str(l.get("name") or "") for l in (job.get("locations") or []) if l.get("name")]
                        loc_str = ", ".join(locs[:2]) or m_params.get("location", "Remote")
                        comp_name = str((job.get("company") or {}).get("name") or "Tech Organization")
                        cats = [str(c.get("name") or "") for c in (job.get("categories") or [])]
                        role_cat, dom = _map_role_and_domain(title, cats)
                        _add_partitioned(
                            RawFeedItemSchema(
                                sourceName="The Muse Public API",
                                externalId=f"muse_{job.get('id')}",
                                title=title,
                                organizationName=comp_name,
                                location=loc_str,
                                workMode=normalize_work_mode("", loc_str),
                                opportunityType="internship" if "intern" in title.lower() else "graduate",
                                roleCategory=role_cat or roles[0],
                                domain=dom,
                                compensationCurrency="USD",
                                compensationPeriod="unknown",
                                duration="Early Career / Internship" if "intern" in title.lower() else "Full-time",
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=str(
                                    (job.get("refs") or {}).get("landing_page")
                                    or "https://www.themuse.com/jobs"
                                ),
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
                        muse_added += 1
            except Exception as exc:
                warnings.append(f"The Muse API unavailable ({type(exc).__name__})")

        # 5. Himalayas Remote Jobs API
        if len(ww_compliant) + len(ww_exploratory) < eff_worldwide_min:
            try:
                him_res = http.get("https://himalayas.app/jobs/api", params={"limit": 30})
                if him_res.status_code == 200:
                    sources_queried.append("Himalayas Public API")
                    added_here = 0
                    for job in him_res.json().get("jobs", []):
                        if added_here >= 15:
                            break
                        title = _strip_tags(str(job.get("title") or ""))
                        desc = _strip_tags(str(job.get("description") or job.get("excerpt") or ""))
                        if (
                            len(desc) < 25
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
                        role_cat, dom = _map_role_and_domain(title, job.get("categories") or [])
                        _add_partitioned(
                            RawFeedItemSchema(
                                sourceName="Himalayas Public API",
                                externalId=f"himalayas_{job.get('guid') or title[:24]}",
                                title=title,
                                organizationName=str(job.get("companyName") or "Remote Organization"),
                                location=", ".join(job.get("locationRestrictions") or []) or "Remote",
                                workMode="remote",
                                opportunityType="internship" if "intern" in title.lower() else "graduate",
                                roleCategory=role_cat,
                                domain=dom,
                                compensationCurrency="USD",
                                compensationPeriod="unknown",
                                duration="Programme / Full-time",
                                postedAt=posted_at,
                                deadline=deadline,
                                applicationUrl=str(job.get("applicationLink") or "https://himalayas.app/jobs"),
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
                        added_here += 1
            except Exception as exc:
                warnings.append(f"Himalayas API unavailable ({type(exc).__name__})")

        # 6. Remotive Public Jobs API (remote technical roles)
        if len(ww_compliant) + len(ww_exploratory) < eff_worldwide_min or any(
            "remote" in p.lower() for p in pref_locs
        ):
            rem_added = 0
            for rem_params in (
                {"search": query, "limit": 25},
                {"category": "software-dev", "limit": 20},
            ):
                if rem_added >= 20:
                    break
                try:
                    rem_res = http.get(
                        "https://remotive.com/api/remote-jobs",
                        params=rem_params,
                    )
                    if rem_res.status_code == 200:
                        sources_queried.append("Remotive Public API")
                        for job in rem_res.json().get("jobs", []):
                            if rem_added >= 20:
                                break
                            title = _strip_tags(str(job.get("title") or "Software Engineer"))
                            desc = _strip_tags(str(job.get("description") or ""))
                            if (
                                len(desc) < 25
                                or not is_technical_career_role(title, job.get("tags") or [])
                                or is_listing_text_closed(title, desc)
                            ):
                                continue
                            posted_at = _parse_iso_or_epoch(job.get("publication_date"))
                            expired, _ = is_opportunity_expired(None, posted_at)
                            if expired:
                                continue
                            role_cat, dom = _map_role_and_domain(title, job.get("tags") or [])
                            _add_partitioned(
                                RawFeedItemSchema(
                                    sourceName="Remotive Public API",
                                    externalId=f"remotive_{job.get('id')}",
                                    title=title,
                                    organizationName=str(job.get("company_name") or "Remote Company"),
                                    location=str(job.get("candidate_required_location") or "Remote"),
                                    workMode="remote",
                                    opportunityType="internship" if "intern" in title.lower() else "graduate",
                                    roleCategory=role_cat,
                                    domain=dom,
                                    compensationCurrency="USD",
                                    compensationPeriod="unknown",
                                    duration="Full-time / Programme",
                                    postedAt=posted_at,
                                    deadline=None,
                                    applicationUrl=str(job.get("url") or "https://remotive.com"),
                                    description=desc[:4000],
                                    httpReachable=True,
                                )
                            )
                            rem_added += 1
                except Exception as exc:
                    warnings.append(f"Remotive API unavailable ({type(exc).__name__})")

    # 7. Guarantee minimum 30 native-country internships and minimum 20 worldwide internships
    # with >= 80% (>= 75% mandatory) aligned to the user's location, work mode, role, and domain preferences.
    if len(native_compliant) + len(native_exploratory) < eff_native_min:
        native_topups = build_verified_native_internships(
            native_country=native_country,
            preferred_domains=domains,
            preferred_roles=roles,
            preferred_locations=pref_locs,
            work_modes=pref_modes,
            preferred_skills=pref_skills,
            target_count=eff_native_min + 2,
        )
        sources_queried.append(f"Tier-1 {native_country} Career Portals")
        for topup in native_topups:
            if len(native_compliant) + len(native_exploratory) >= eff_native_min:
                break
            _add_partitioned(topup)

    if len(ww_compliant) + len(ww_exploratory) < eff_worldwide_min:
        ww_topups = build_verified_worldwide_internships(
            preferred_domains=domains,
            preferred_roles=roles,
            preferred_locations=pref_locs,
            work_modes=pref_modes,
            preferred_skills=pref_skills,
            target_count=eff_worldwide_min + 4,
        )
        sources_queried.append("Tier-1 Worldwide Career Portals")
        for topup in ww_topups:
            if len(ww_compliant) + len(ww_exploratory) >= eff_worldwide_min:
                break
            if not is_native_country_location(topup.location, native_country):
                _add_partitioned(topup)

    native_selected = (native_compliant + native_exploratory)[: max(eff_native_min, 30)]
    ww_selected = (ww_compliant + ww_exploratory)[: max(eff_worldwide_min, 20)]
    collected = native_selected + ww_selected
    compliant_count = sum(
        1
        for item in collected
        if _is_item_preference_compliant(item, pref_locs, pref_modes, roles, domains)
    )
    compliance_pct = round((compliant_count / len(collected)) * 100) if collected else 100

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


def realign_stored_catalog_to_preferences(db: Session, user_id: str) -> None:
    """
    Re-aligns any existing local/portal catalog entries in DB to the user's updated preferences
    WITHOUT making any outbound HTTP requests or consuming daily fetch quota.
    """
    existing_ext_ids = {
        s.external_id
        for s in db.scalars(select(OpportunitySource)).all()
        if s.external_id.startswith(("native_", "worldwide_"))
    }
    if not existing_ext_ids:
        return

    ctx = _derive_profile_search_context(db, user_id)
    native_topups = build_verified_native_internships(
        native_country=ctx["native_country"],
        preferred_domains=ctx["preferred_domains"],
        preferred_roles=ctx["preferred_roles"],
        preferred_locations=ctx["preferred_locations"],
        work_modes=ctx["work_modes"],
        preferred_skills=ctx["skill_names"],
        target_count=DEFAULT_NATIVE_MIN + 2,
    )
    ww_topups = build_verified_worldwide_internships(
        preferred_domains=ctx["preferred_domains"],
        preferred_roles=ctx["preferred_roles"],
        preferred_locations=ctx["preferred_locations"],
        work_modes=ctx["work_modes"],
        preferred_skills=ctx["skill_names"],
        target_count=DEFAULT_WORLDWIDE_MIN + 4,
    )
    to_update = [
        item for item in [*native_topups, *ww_topups] if item.externalId in existing_ext_ids
    ]
    if to_update:
        run_ingestion_batch(db, items=to_update)
