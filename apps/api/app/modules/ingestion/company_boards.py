from datetime import datetime, timezone
import re
from typing import Any, Literal
import httpx
from pydantic import BaseModel
from app.modules.ingestion.freshness import (
    is_listing_text_closed,
    is_opportunity_expired,
)
from app.modules.ingestion.normalizer import (
    extract_explicit_duration,
    has_minimum_listing_info,
    is_native_country_location,
    is_technical_career_role,
    normalize_work_mode,
)
from app.modules.ingestion.service import RawFeedItemSchema
from app.modules.intelligence.sanitizer import clean_html_to_text


class Tier1CompanyBoard(BaseModel):
    name: str
    ats: Literal["greenhouse", "ashby", "lever"]
    slug: str
    website: str
    domain: str
    default_role: str


TIER1_COMPANY_BOARDS: list[Tier1CompanyBoard] = [
    # Developer Tools & Cloud
    Tier1CompanyBoard(
        name="Cloudflare",
        ats="greenhouse",
        slug="cloudflare",
        website="https://www.cloudflare.com",
        domain="Developer Tools & Cloud",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Datadog",
        ats="greenhouse",
        slug="datadog",
        website="https://www.datadoghq.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Vercel",
        ats="greenhouse",
        slug="vercel",
        website="https://vercel.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Postman",
        ats="greenhouse",
        slug="postman",
        website="https://www.postman.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    # AI & Machine Learning
    Tier1CompanyBoard(
        name="Anthropic",
        ats="greenhouse",
        slug="anthropic",
        website="https://www.anthropic.com",
        domain="AI & Machine Learning",
        default_role="machine_learning",
    ),
    Tier1CompanyBoard(
        name="Scale AI",
        ats="greenhouse",
        slug="scaleai",
        website="https://scale.com",
        domain="AI & Machine Learning",
        default_role="machine_learning",
    ),
    Tier1CompanyBoard(
        name="Linear",
        ats="ashby",
        slug="linear",
        website="https://linear.app",
        domain="AI & Machine Learning",
        default_role="software_engineering",
    ),
    # Distributed Systems
    Tier1CompanyBoard(
        name="Grafana Labs",
        ats="greenhouse",
        slug="grafanalabs",
        website="https://grafana.com",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Supabase",
        ats="ashby",
        slug="supabase",
        website="https://supabase.com",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    # Fintech & Payments
    Tier1CompanyBoard(
        name="Stripe",
        ats="greenhouse",
        slug="stripe",
        website="https://stripe.com",
        domain="Fintech & Payments",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Razorpay",
        ats="greenhouse",
        slug="razorpay",
        website="https://razorpay.com",
        domain="Fintech & Payments",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Ramp",
        ats="ashby",
        slug="ramp",
        website="https://ramp.com",
        domain="Fintech & Payments",
        default_role="software_engineering",
    ),
    # Cybersecurity
    Tier1CompanyBoard(
        name="Snyk",
        ats="greenhouse",
        slug="snyk",
        website="https://snyk.io",
        domain="Cybersecurity",
        default_role="security",
    ),
    Tier1CompanyBoard(
        name="Wiz",
        ats="greenhouse",
        slug="wiz",
        website="https://www.wiz.io",
        domain="Cybersecurity",
        default_role="security",
    ),
    # Data Engineering
    Tier1CompanyBoard(
        name="Databricks",
        ats="greenhouse",
        slug="databricks",
        website="https://www.databricks.com",
        domain="Data Engineering",
        default_role="data_science",
    ),
    Tier1CompanyBoard(
        name="dbt Labs",
        ats="greenhouse",
        slug="dbtlabsinc",
        website="https://www.getdbt.com",
        domain="Data Engineering",
        default_role="data_science",
    ),
    # Open Source Ecosystem
    Tier1CompanyBoard(
        name="Mozilla",
        ats="greenhouse",
        slug="mozilla",
        website="https://www.mozilla.org",
        domain="Open Source Ecosystem",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="GitLab",
        ats="greenhouse",
        slug="gitlab",
        website="https://about.gitlab.com",
        domain="Open Source Ecosystem",
        default_role="software_engineering",
    ),
    # Scientific Computing
    Tier1CompanyBoard(
        name="Figma",
        ats="greenhouse",
        slug="figma",
        website="https://www.figma.com",
        domain="Scientific Computing",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="DeepMind",
        ats="greenhouse",
        slug="deepmind",
        website="https://deepmind.google",
        domain="Scientific Computing",
        default_role="research",
    ),
    Tier1CompanyBoard(
        name="BrowserStack",
        ats="greenhouse",
        slug="browserstack",
        website="https://www.browserstack.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Chargebee",
        ats="greenhouse",
        slug="chargebee",
        website="https://www.chargebee.com",
        domain="Fintech & Payments",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Rubrik",
        ats="greenhouse",
        slug="rubrik",
        website="https://www.rubrik.com",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Cockroach Labs",
        ats="greenhouse",
        slug="cockroachlabs",
        website="https://www.cockroachlabs.com",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Coinbase",
        ats="greenhouse",
        slug="coinbase",
        website="https://www.coinbase.com",
        domain="Fintech & Payments",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Discord",
        ats="greenhouse",
        slug="discord",
        website="https://discord.com",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Dropbox",
        ats="greenhouse",
        slug="dropbox",
        website="https://www.dropbox.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Airbyte",
        ats="ashby",
        slug="airbyte",
        website="https://airbyte.com",
        domain="Data Engineering",
        default_role="data_science",
    ),
    Tier1CompanyBoard(
        name="PostHog",
        ats="ashby",
        slug="posthog",
        website="https://posthog.com",
        domain="Developer Tools & Cloud",
        default_role="software_engineering",
    ),
    Tier1CompanyBoard(
        name="Temporal",
        ats="ashby",
        slug="temporal",
        website="https://temporal.io",
        domain="Distributed Systems",
        default_role="systems_infrastructure",
    ),
    Tier1CompanyBoard(
        name="Langfuse",
        ats="ashby",
        slug="langfuse",
        website="https://langfuse.com",
        domain="AI & Machine Learning",
        default_role="machine_learning",
    ),
    Tier1CompanyBoard(
        name="Retell AI",
        ats="ashby",
        slug="retellai",
        website="https://www.retellai.com",
        domain="AI & Machine Learning",
        default_role="machine_learning",
    ),
    Tier1CompanyBoard(
        name="Composio",
        ats="ashby",
        slug="composio",
        website="https://composio.dev",
        domain="AI & Machine Learning",
        default_role="machine_learning",
    ),
]


def _clean_html(raw: str) -> str:
    return clean_html_to_text(raw)


def _normalize_timestamp(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        secs = val / 1000.0 if val > 10_000_000_000 else float(val)
        return datetime.fromtimestamp(secs, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = str(val).strip()
    return text or None


def _matches_terms(title: str, description: str, query_terms: list[str]) -> bool:
    if not is_technical_career_role(title) or is_listing_text_closed(title, description):
        return False
    if not query_terms:
        return True
    blob = f"{title} {description[:1500]}".lower()
    if any(t in blob for t in query_terms):
        return True
    # Also accept technical intern / early-career roles
    return any(
        k in title.lower()
        for k in (
            "intern",
            "junior",
            "associate",
            "graduate",
            "engineer",
            "developer",
            "research",
            "scientist",
            "analyst",
            "security",
            "designer",
            "product",
            "hardware",
            "robotics",
        )
    )


def _infer_role(title: str, fallback: str) -> str:
    t = title.lower()
    if any(k in t for k in ("verilog", "vlsi", "fpga", "embedded", "firmware", "hardware", "robotics", "mechanical", "electrical", "solidworks")):
        return "core_engineering"
    if any(k in t for k in ("ui/ux", "ux design", "ui design", "product design", "interaction design", "designer")):
        return "ui_ux_design"
    if any(k in t for k in ("product manager", "product management", "associate product", "apm")):
        return "product_management"
    if any(k in t for k in ("quant", "financial", "investment", "risk analyst", "business analyst", "equity")):
        return "finance_business"
    if any(k in t for k in ("marketing", "growth", "seo", "operations", "supply chain")):
        return "marketing_operations"
    if any(k in t for k in ("machine learning", "ml ", "ai ", "llm", "deep learning")):
        return "machine_learning"
    if any(k in t for k in ("data scien", "data engineer", "analytics")):
        return "data_science"
    if any(k in t for k in ("security", "appsec", "infosec", "cyber")):
        return "security"
    if any(k in t for k in ("infrastructure", "sre", "devops", "platform", "distributed", "kernel")):
        return "systems_infrastructure"
    if "research" in t:
        return "research"
    return fallback


def _select_boards_for_domains(preferred_domains: list[str], max_boards: int = 34) -> list[Tier1CompanyBoard]:
    pref_set = {d.strip().lower() for d in preferred_domains if d.strip()}
    prioritized = [b for b in TIER1_COMPANY_BOARDS if b.domain.lower() in pref_set]
    rest = [b for b in TIER1_COMPANY_BOARDS if b.domain.lower() not in pref_set]
    return (prioritized + rest)[:max_boards]


def fetch_tier1_company_jobs(
    http: httpx.Client,
    preferred_domains: list[str],
    query_terms: list[str],
    max_total: int = 80,
    native_country: str = "India",
) -> tuple[list[RawFeedItemSchema], list[str], list[str]]:
    """
    Fetches live roles directly from Tier-1 company ATS career boards (Greenhouse, Ashby, Lever),
    prioritizing native-country hubs, preferred domains, and internship tracks.
    Strictly preserves 'Not available' / 'unknown' for omitted location, duration, compensation, and workMode.
    Filters out closed postings, expired deadlines, generic URLs, and listings > 90 days old.
    """
    boards = _select_boards_for_domains(preferred_domains, max_boards=34)
    terms = [t.strip().lower() for t in query_terms if len(t.strip()) >= 2]
    collected: list[RawFeedItemSchema] = []
    sources_queried: list[str] = []
    warnings: list[str] = []

    for board in boards:
        if len(collected) >= max_total:
            break
        try:
            board_items: list[RawFeedItemSchema] = []
            if board.ats == "greenhouse":
                res = http.get(
                    f"https://boards-api.greenhouse.io/v1/boards/{board.slug}/jobs",
                    params={"content": "true"},
                )
                if res.status_code == 200:
                    sources_queried.append(f"{board.name} Careers (Greenhouse)")
                    for job in res.json().get("jobs", []):
                        title = str(job.get("title") or "").strip()
                        desc = _clean_html(str(job.get("content") or ""))
                        job_url = str(job.get("absolute_url") or "").strip()
                        if not has_minimum_listing_info(title, board.name, job_url, desc):
                            continue
                        if not _matches_terms(title, desc, terms):
                            continue
                        posted_at = _normalize_timestamp(
                            job.get("updated_at") or job.get("first_published")
                        )
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        raw_loc = str((job.get("location") or {}).get("name") or "").strip()
                        loc = raw_loc or "Not available"
                        work_mode = normalize_work_mode(None, raw_loc, title)
                        board_items.append(
                            RawFeedItemSchema(
                                sourceName=f"{board.name} Careers (Greenhouse)",
                                externalId=f"gh_{board.slug}_{job.get('id')}",
                                title=title,
                                organizationName=board.name,
                                officialWebsite=board.website,
                                location=loc,
                                workMode=work_mode,
                                opportunityType="internship"
                                if "intern" in title.lower()
                                else ("research" if "research" in title.lower() else "graduate"),
                                roleCategory=_infer_role(title, board.default_role),
                                domain=board.domain,
                                compensationCurrency=None,
                                compensationPeriod="unknown",
                                duration=extract_explicit_duration(f"{title} {desc}"),
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=job_url,
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
            elif board.ats == "ashby":
                res = http.get(f"https://api.ashbyhq.com/posting-api/job-board/{board.slug}")
                if res.status_code == 200:
                    sources_queried.append(f"{board.name} Careers (Ashby)")
                    for job in res.json().get("jobs", []):
                        title = str(job.get("title") or "").strip()
                        desc = _clean_html(
                            str(job.get("descriptionPlain") or job.get("descriptionHtml") or "")
                        )
                        job_url = str(job.get("jobUrl") or job.get("applyUrl") or "").strip()
                        if not has_minimum_listing_info(title, board.name, job_url, desc):
                            continue
                        if not _matches_terms(title, desc, terms):
                            continue
                        posted_at = _normalize_timestamp(job.get("publishedAt"))
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        raw_loc = str(job.get("location") or "").strip()
                        loc = raw_loc or "Not available"
                        raw_wp = str(job.get("workplaceType") or "").strip().lower()
                        if job.get("isRemote") is True or raw_wp == "remote":
                            work_mode = "remote"
                        elif raw_wp == "hybrid":
                            work_mode = "hybrid"
                        elif raw_wp in ("onsite", "on-site"):
                            work_mode = "onsite"
                        else:
                            work_mode = normalize_work_mode(raw_wp or None, raw_loc, title)
                        board_items.append(
                            RawFeedItemSchema(
                                sourceName=f"{board.name} Careers (Ashby)",
                                externalId=f"ashby_{board.slug}_{job.get('id') or title[:24]}",
                                title=title,
                                organizationName=board.name,
                                officialWebsite=board.website,
                                location=loc,
                                workMode=work_mode,
                                opportunityType="internship"
                                if "intern" in title.lower()
                                else "graduate",
                                roleCategory=_infer_role(title, board.default_role),
                                domain=board.domain,
                                compensationCurrency=None,
                                compensationPeriod="unknown",
                                duration=extract_explicit_duration(f"{title} {desc}"),
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=job_url,
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )
            elif board.ats == "lever":
                res = http.get(
                    f"https://api.lever.co/v0/postings/{board.slug}",
                    params={"mode": "json"},
                )
                if res.status_code == 200 and isinstance(res.json(), list):
                    sources_queried.append(f"{board.name} Careers (Lever)")
                    for job in res.json():
                        title = str(job.get("text") or "").strip()
                        desc = _clean_html(str(job.get("descriptionPlain") or job.get("description") or ""))
                        job_url = str(job.get("hostedUrl") or "").strip()
                        if not has_minimum_listing_info(title, board.name, job_url, desc):
                            continue
                        if not _matches_terms(title, desc, terms):
                            continue
                        posted_at = _normalize_timestamp(job.get("createdAt"))
                        expired, _ = is_opportunity_expired(None, posted_at)
                        if expired:
                            continue
                        raw_loc = str((job.get("categories") or {}).get("location") or "").strip()
                        loc = raw_loc or "Not available"
                        board_items.append(
                            RawFeedItemSchema(
                                sourceName=f"{board.name} Careers (Lever)",
                                externalId=f"lever_{board.slug}_{job.get('id')}",
                                title=title,
                                organizationName=board.name,
                                officialWebsite=board.website,
                                location=loc,
                                workMode=normalize_work_mode(
                                    str(job.get("workplaceType") or ""), raw_loc, title
                                ),
                                opportunityType="internship"
                                if "intern" in title.lower()
                                else "graduate",
                                roleCategory=_infer_role(title, board.default_role),
                                domain=board.domain,
                                compensationCurrency=None,
                                compensationPeriod="unknown",
                                duration=extract_explicit_duration(f"{title} {desc}"),
                                postedAt=posted_at,
                                deadline=None,
                                applicationUrl=job_url,
                                description=desc[:4000],
                                httpReachable=True,
                            )
                        )

            # Prioritize native country, matching terms, and internships
            board_items.sort(
                key=lambda it: (
                    0 if is_native_country_location(it.location, native_country) else 1,
                    0 if any(t in it.title.lower() for t in terms) else 1,
                    0 if it.opportunityType == "internship" else 1,
                )
            )
            collected.extend(board_items[:12])
        except Exception as exc:
            warnings.append(f"{board.name} careers board unavailable ({type(exc).__name__})")

    return collected[:max_total], sources_queried, warnings


def _infer_domain(title: str, desc: str) -> str:
    blob = f"{title} {desc[:1000]}".lower()
    if any(k in blob for k in ("verilog", "vlsi", "fpga", "embedded", "firmware", "robotics")):
        return "Embedded, Robotics & VLSI"
    if any(k in blob for k in ("solidworks", "autocad", "ansys", "mechanical", "civil engineering")):
        return "Mechanical, Civil & Core Engineering"
    if any(k in blob for k in ("ui/ux", "ux design", "ui design", "product design", "figma")):
        return "UI/UX & Product Design"
    if any(k in blob for k in ("product manager", "product management", "product strategy")):
        return "Product & Strategy"
    if any(k in blob for k in ("financial modeling", "valuation", "quant", "corporate finance")):
        return "Quantitative Finance & Consulting"
    if any(k in blob for k in ("digital marketing", "seo", "growth analytics", "supply chain")):
        return "Growth, Marketing & Operations"
    if any(k in blob for k in ("bioinformatics", "biotechnology", "biomedical")):
        return "Biotech & Healthcare Tech"
    if any(k in blob for k in ("machine learning", "ml ", "ai ", "pytorch", "llm", "rag")):
        return "AI & Machine Learning"
    if any(k in blob for k in ("data scien", "data engineer", "analytics", "pandas")):
        return "Data Engineering"
    if any(k in blob for k in ("security", "cyber", "appsec", "infosec")):
        return "Cybersecurity"
    if any(k in blob for k in ("distributed", "kubernetes", "kafka")):
        return "Distributed Systems"
    if any(k in blob for k in ("research", "scientific", "simulation")):
        return "Scientific Computing"
    return "Developer Tools & Cloud"


def fetch_internshala_internships(
    http: httpx.Client,
    preferred_roles: list[str],
    max_items: int = 12,
) -> tuple[list[RawFeedItemSchema], list[str], list[str]]:
    """
    Fetches public category internship listings from Internshala and verifies each candidate
    detail page before admitting it. Never fabricates missing city, company, duration, or stipend.
    """
    slug_map = {
        "machine_learning": "machine-learning-internship",
        "data_science": "data-science-internship",
        "security": "cyber-security-internship",
        "systems_infrastructure": "cloud-computing-internship",
        "research": "computer-science-internship",
        "software_engineering": "software-development-internship",
        "product_management": "product-management-internship",
        "ui_ux_design": "ui-ux-design-internship",
        "core_engineering": "embedded-systems-internship",
        "finance_business": "finance-internship",
        "marketing_operations": "digital-marketing-internship",
    }
    preferred_slugs = [slug_map.get(r, "software-development-internship") for r in preferred_roles if r in slug_map]
    fallback_slugs = (
        ["software-development-internship", "computer-science-internship"]
        if not preferred_slugs
        else []
    )
    categories = list(dict.fromkeys([*preferred_slugs, *fallback_slugs]))[:2]

    items: list[RawFeedItemSchema] = []
    sources: list[str] = []
    warnings: list[str] = []
    detail_checks = 0
    max_detail_checks = min(max_items, 6)

    for cat_slug in categories:
        if len(items) >= max_items or detail_checks >= max_detail_checks:
            break
        try:
            res = http.get(f"https://internshala.com/internships/{cat_slug}/")
            if res.status_code >= 400 or "text/html" not in res.headers.get("content-type", "text/html"):
                warnings.append(f"Internshala feed ({cat_slug}) returned HTTP {res.status_code}")
                continue
            sources.append("Internshala Public Category Feed")
            links = re.findall(
                r'<a[^>]+href="(/internship/detail/[^"]+)"[^>]*>(.*?)</a>',
                res.text,
                flags=re.I | re.S,
            )
            seen_hrefs: set[str] = set()
            for idx, (rel_href, inner_html) in enumerate(links):
                if len(items) >= max_items or detail_checks >= max_detail_checks:
                    break
                if rel_href in seen_hrefs:
                    continue
                raw_title = clean_html_to_text(inner_html)
                if (
                    len(raw_title) < 5
                    or raw_title.lower() in {"view details", "apply now", "know more"}
                    or not is_technical_career_role(raw_title)
                    or is_listing_text_closed(raw_title, inner_html)
                ):
                    continue
                seen_hrefs.add(rel_href)
                detail_checks += 1
                detail_url = f"https://internshala.com{rel_href}"

                try:
                    detail_res = http.get(detail_url)
                except Exception:
                    continue
                if (
                    detail_res.status_code >= 400
                    or "text/html" not in detail_res.headers.get("content-type", "text/html")
                ):
                    continue
                final_url = str(getattr(detail_res, "url", "") or detail_url)
                if "/internship/detail/" not in final_url:
                    continue

                detail_html = detail_res.text[:40000]
                detail_clean = clean_html_to_text(detail_html)
                if is_listing_text_closed(raw_title, detail_clean[:4000]):
                    continue

                # Extract genuine company name from DOM or slug (never invent placeholder)
                org_dom = re.search(
                    r'<div[^>]*class="[^"]*company_name[^"]*"[^>]*>(.*?)</div>',
                    detail_html,
                    flags=re.I | re.S,
                )
                slug_clean = rel_href.split("/detail/")[-1].rstrip("/")
                org_match = re.search(r"-at-([a-z0-9\-]+?)\d*$", slug_clean, re.I)
                org_name = (
                    clean_html_to_text(org_dom.group(1))
                    if org_dom
                    else (
                        org_match.group(1).replace("-", " ").title()
                        if org_match
                        else ""
                    )
                )
                if not org_name:
                    continue

                desc_dom = re.search(
                    r'<div[^>]*class="[^"]*internship_details[^"]*"[^>]*>(.*?)</div>\s*<div',
                    detail_html,
                    flags=re.I | re.S,
                )
                real_desc = clean_html_to_text(desc_dom.group(1)) if desc_dom else detail_clean[:3000]
                if not has_minimum_listing_info(raw_title, org_name, detail_url, real_desc):
                    continue

                is_wfh = bool(
                    re.search(
                        r"\b(?:work\s+from\s+home|remote|wfh)\b",
                        f"{raw_title} {slug_clean.replace('-', ' ')}",
                        re.I,
                    )
                )
                loc_match = re.search(r"-in-([a-z0-9\-]+?)-at-", slug_clean, re.I)
                if is_wfh:
                    loc_name = "Remote (India)"
                    work_mode = "remote"
                elif loc_match:
                    loc_name = f"{loc_match.group(1).replace('-', ' ').title()}, India"
                    work_mode = normalize_work_mode(None, loc_name, raw_title)
                else:
                    loc_name = "Not available"
                    work_mode = normalize_work_mode(None, "", raw_title)

                comp_min: int | None = None
                comp_curr: str | None = None
                comp_period = "unknown"
                stipend_m = re.search(
                    r"(?:₹|INR|Rs\.?)\s*([\d,]{3,7})\s*(?:/\s*month|per\s+month|/month)?",
                    detail_clean[:3000],
                    flags=re.I,
                )
                if stipend_m:
                    try:
                        comp_min = int(stipend_m.group(1).replace(",", ""))
                        comp_curr = "INR"
                        comp_period = "monthly"
                    except ValueError:
                        comp_min = None
                elif re.search(r"\bstipend\b.{0,30}\bunpaid\b", detail_clean[:3000], flags=re.I):
                    comp_period = "unpaid"

                role_cat = _infer_role(raw_title, "software_engineering")
                items.append(
                    RawFeedItemSchema(
                        sourceName="Internshala",
                        externalId=f"internshala_{cat_slug}_{idx}_{slug_clean[:32]}",
                        title=raw_title,
                        organizationName=org_name,
                        location=loc_name,
                        workMode=work_mode,
                        opportunityType="internship",
                        roleCategory=role_cat,
                        domain=_infer_domain(raw_title, real_desc),
                        compensationMin=comp_min,
                        compensationMax=comp_min,
                        compensationCurrency=comp_curr,
                        compensationPeriod=comp_period,
                        duration=extract_explicit_duration(detail_clean[:3000]),
                        postedAt=None,
                        deadline=None,
                        applicationUrl=detail_url,
                        description=real_desc[:4000],
                        httpReachable=True,
                    )
                )
        except Exception as exc:
            warnings.append(f"Internshala feed unavailable ({type(exc).__name__})")

    return items[:max_items], sources, warnings


def build_verified_native_internships(*_args: Any, **_kwargs: Any) -> list[RawFeedItemSchema]:
    """
    Synthetic native-country top-ups are permanently disabled (Option A: show only
    100% real, verified-open listings).
    """
    return []


def build_verified_worldwide_internships(*_args: Any, **_kwargs: Any) -> list[RawFeedItemSchema]:
    """
    Synthetic worldwide top-ups are permanently disabled (Option A: show only
    100% real, verified-open listings).
    """
    return []

