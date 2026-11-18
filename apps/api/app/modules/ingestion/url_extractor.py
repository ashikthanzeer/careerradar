import html as html_lib
import json
import re
from typing import Any
from urllib.parse import urlparse
import httpx
from app.modules.ingestion.normalizer import (
    extract_explicit_duration,
    normalize_application_url,
    normalize_work_mode,
)


def _strip_html(raw: str) -> str:
    text = re.sub(r"<(br|p|div|li|tr|h[1-6])[^>]*>", "\n", raw, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _detect_source_platform(host: str) -> str:
    h = host.lower()
    if "linkedin.com" in h:
        return "LinkedIn"
    if "internshala.com" in h:
        return "Internshala"
    if "indeed." in h:
        return "Indeed"
    if "wellfound.com" in h or "angel.co" in h:
        return "Wellfound"
    if "greenhouse.io" in h:
        return "Greenhouse"
    if "lever.co" in h:
        return "Lever"
    if "ashbyhq.com" in h:
        return "Ashby"
    if "workatastartup.com" in h:
        return "YC Work at a Startup"
    return host or "External Website"


def _infer_role_and_domain(text: str) -> tuple[str, str]:
    lower = text.lower()
    if any(k in lower for k in ("verilog", "vlsi", "fpga", "embedded", "firmware", "robotics", "solidworks", "autocad", "mechanical", "hardware")):
        return "core_engineering", "Embedded, Robotics & VLSI"
    if any(k in lower for k in ("ui/ux", "ux design", "ui design", "product design", "figma", "wireframing", "prototyping")):
        return "ui_ux_design", "UI/UX & Product Design"
    if any(k in lower for k in ("product manager", "product management", "associate product", "apm", "product strategy")):
        return "product_management", "Product & Strategy"
    if any(k in lower for k in ("financial modeling", "valuation", "quantitative", "equity research", "investment banking", "business analyst")):
        return "finance_business", "Quantitative Finance & Consulting"
    if any(k in lower for k in ("digital marketing", "seo", "sem", "growth analytics", "supply chain", "operations intern")):
        return "marketing_operations", "Growth, Marketing & Operations"
    if any(k in lower for k in ("machine learning", "pytorch", "tensorflow", "llm", "ai ", "rag")):
        return "machine_learning", "AI & Machine Learning"
    if any(k in lower for k in ("data scientist", "data analyst", "analytics", "pandas")):
        return "data_science", "Data Engineering"
    if any(k in lower for k in ("security", "appsec", "cyber", "vulnerability", "pentest")):
        return "security", "Cybersecurity"
    if any(k in lower for k in ("kubernetes", "devops", "sre", "cloud", "terraform", "linux kernel")):
        return "systems_infrastructure", "Developer Tools & Cloud"
    if any(k in lower for k in ("bioinformatics", "biotech", "biomedical", "genomics")):
        return "research", "Biotech & Healthcare Tech"
    if any(k in lower for k in ("research", "fellowship", "lab")):
        return "research", "Scientific Computing"
    return "software_engineering", "Developer Tools & Cloud"


def _infer_opportunity_type(text: str) -> str:
    lower = text.lower()
    if "fellowship" in lower:
        return "fellowship"
    if "research" in lower and "intern" not in lower:
        return "research"
    if "open source" in lower or "mentorship" in lower:
        return "open_source"
    if "intern" in lower or "stipend" in lower:
        return "internship"
    return "graduate"


def _parse_json_ld_job(raw_html: str) -> dict[str, Any] | None:
    scripts = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        raw_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for block in scripts:
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        candidates = data if isinstance(data, list) else [data]
        expanded: list[dict[str, Any]] = []
        for item in candidates:
            if isinstance(item, dict):
                if "@graph" in item and isinstance(item["@graph"], list):
                    expanded.extend(g for g in item["@graph"] if isinstance(g, dict))
                else:
                    expanded.append(item)
        for node in expanded:
            node_type = node.get("@type")
            is_job = node_type == "JobPosting" or (
                isinstance(node_type, list) and "JobPosting" in node_type
            )
            if not is_job:
                continue

            org_obj = node.get("hiringOrganization") or {}
            if isinstance(org_obj, str):
                org_name = org_obj
                org_site = None
            elif isinstance(org_obj, dict):
                org_name = str(org_obj.get("name") or "")
                org_site = org_obj.get("sameAs") or org_obj.get("url")
            else:
                org_name = ""
                org_site = None

            location_str = ""
            job_loc = node.get("jobLocation")
            if isinstance(job_loc, list) and job_loc:
                job_loc = job_loc[0]
            if isinstance(job_loc, dict):
                addr = job_loc.get("address") or {}
                if isinstance(addr, dict):
                    parts = [
                        addr.get("addressLocality"),
                        addr.get("addressRegion"),
                        addr.get("addressCountry"),
                    ]
                    location_str = ", ".join(str(p) for p in parts if p)
                elif isinstance(addr, str):
                    location_str = addr

            title_clean = _strip_html(str(node.get("title") or ""))
            desc_clean = _strip_html(str(node.get("description") or ""))
            loc_type = str(node.get("jobLocationType", "")).upper()
            if "TELECOMMUTE" in loc_type:
                work_mode = "remote"
                location_str = location_str or "Remote"
            else:
                work_mode = normalize_work_mode(None, location_str, title_clean)

            comp_min: int | None = None
            comp_max: int | None = None
            comp_curr: str | None = None
            comp_period: str = "unknown"
            salary = node.get("baseSalary")
            if isinstance(salary, dict):
                raw_curr = str(salary.get("currency") or "").strip().upper()
                if raw_curr in ("INR", "USD", "EUR"):
                    comp_curr = raw_curr
                val = salary.get("value")
                if isinstance(val, dict):
                    raw_min = val.get("minValue") or val.get("value")
                    raw_max = val.get("maxValue") or val.get("value")
                    if raw_min is not None:
                        try:
                            comp_min = int(float(raw_min))
                        except Exception:
                            comp_min = None
                    if raw_max is not None:
                        try:
                            comp_max = int(float(raw_max))
                        except Exception:
                            comp_max = comp_min
                    if comp_min is not None:
                        comp_curr = comp_curr or "USD"
                        unit = str(val.get("unitText") or "").upper()
                        if unit == "HOUR":
                            comp_period = "hourly"
                        elif unit == "MONTH":
                            comp_period = "monthly"
                        else:
                            comp_period = "total_stipend"

            return {
                "title": title_clean,
                "organizationName": _strip_html(org_name),
                "officialWebsite": str(org_site) if org_site else None,
                "location": location_str or ("Remote" if work_mode == "remote" else "Not available"),
                "workMode": work_mode,
                "compensationMin": comp_min,
                "compensationMax": comp_max,
                "compensationCurrency": comp_curr,
                "compensationPeriod": comp_period,
                "duration": extract_explicit_duration(f"{title_clean} {desc_clean}"),
                "deadline": str(node.get("validThrough") or "")[:10] or None,
                "description": desc_clean,
            }
    return None


def _extract_meta(raw_html: str, prop: str) -> str:
    pattern = re.compile(
        rf'<meta[^>]+(?:property|name)=["\']{re.escape(prop)}["\'][^>]+content=["\'](.*?)["\']',
        flags=re.IGNORECASE | re.DOTALL,
    )
    m = pattern.search(raw_html)
    if m:
        return html_lib.unescape(m.group(1)).strip()
    pattern_rev = re.compile(
        rf'<meta[^>]+content=["\'](.*?)["\'][^>]+(?:property|name)=["\']{re.escape(prop)}["\']',
        flags=re.IGNORECASE | re.DOTALL,
    )
    m2 = pattern_rev.search(raw_html)
    return html_lib.unescape(m2.group(1)).strip() if m2 else ""


def _parse_platform_dom(raw_html: str, source_name: str) -> dict[str, Any]:
    title = ""
    org_name = ""
    location = ""
    description = ""

    if source_name == "LinkedIn":
        t_m = re.search(
            r'<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>(.*?)</h1>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        o_m = re.search(
            r'<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>(.*?)</a>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        l_m = re.search(
            r'<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>(.*?)</span>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        d_m = re.search(
            r'<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>(.*?)</div>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        title = _strip_html(t_m.group(1)) if t_m else ""
        org_name = _strip_html(o_m.group(1)) if o_m else ""
        location = _strip_html(l_m.group(1)) if l_m else ""
        description = _strip_html(d_m.group(1)) if d_m else ""

    elif source_name == "Internshala":
        t_m = re.search(
            r'<div[^>]*class="[^"]*heading_4_5[^"]*profile[^"]*"[^>]*>(.*?)</div>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        o_m = re.search(
            r'<div[^>]*class="[^"]*heading_6[^"]*company_name[^"]*"[^>]*>(.*?)</div>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        d_m = re.search(
            r'<div[^>]*class="[^"]*internship_details[^"]*"[^>]*>(.*?)</div>\s*<div',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        title = _strip_html(t_m.group(1)) if t_m else ""
        org_name = _strip_html(o_m.group(1)) if o_m else ""
        description = _strip_html(d_m.group(1)) if d_m else ""

    elif source_name == "Indeed":
        t_m = re.search(
            r'<h1[^>]*class="[^"]*jobsearch-JobInfoHeader-title[^"]*"[^>]*>(.*?)</h1>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        o_m = re.search(
            r'<(?:div|span|a)[^>]*(?:data-company-name=["\']true["\']|data-testid=["\']inlineHeader-companyName["\'])[^>]*>(.*?)</(?:div|span|a)>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        l_m = re.search(
            r'<(?:div|span)[^>]*data-testid=["\']inlineHeader-companyLocation["\'][^>]*>(.*?)</(?:div|span)>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        d_m = re.search(
            r'<div[^>]*id=["\']jobDescriptionText["\'][^>]*>(.*?)</div>',
            raw_html,
            flags=re.IGNORECASE | re.DOTALL,
        )
        title = _strip_html(t_m.group(1)) if t_m else ""
        org_name = _strip_html(o_m.group(1)) if o_m else ""
        location = _strip_html(l_m.group(1)) if l_m else ""
        description = _strip_html(d_m.group(1)) if d_m else ""

    # Fallback to OpenGraph / <title> / <h1> / <main>
    title_tag_m = re.search(r"<title[^>]*>(.*?)</title>", raw_html, flags=re.IGNORECASE | re.DOTALL)
    og_title = _extract_meta(raw_html, "og:title") or (_strip_html(title_tag_m.group(1)) if title_tag_m else "")
    og_desc = _extract_meta(raw_html, "og:description") or _extract_meta(
        raw_html, "description"
    )
    if (not title or not org_name) and og_title:
        # Often formatted like "Backend Intern - Stripe | LinkedIn" or "Stripe hiring Backend Intern in Remote"
        hiring_m = re.match(r"^(.*?)\s+hiring\s+(.*?)(?:\s+in\s+(.*?))?(?:\s*\||$)", og_title, re.I)
        if hiring_m:
            org_name = org_name or hiring_m.group(1).strip()
            title = title or hiring_m.group(2).strip()
            location = location or (hiring_m.group(3) or "").strip()
        else:
            parts = [p.strip() for p in re.split(r"\s*[|\-–]\s*", og_title) if p.strip()]
            if parts and not title:
                title = parts[0]
            if len(parts) >= 2 and parts[1].lower() not in ("linkedin", "indeed", "internshala"):
                org_name = org_name or parts[1]

    if not title:
        h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", raw_html, flags=re.IGNORECASE | re.DOTALL)
        if h1_m:
            title = _strip_html(h1_m.group(1))

    if not description:
        description = og_desc

    return {
        "title": title,
        "organizationName": org_name,
        "location": location,
        "description": description,
    }


def _parse_url_slug_fallback(url: str, source_name: str) -> dict[str, Any]:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    title = ""
    org_name = ""
    location = ""

    if source_name == "LinkedIn" and "jobs/view/" in path:
        slug = path.split("jobs/view/")[-1]
        slug = re.sub(r"-\d+$", "", slug)
        m = re.match(r"^(.+?)-at-(.+)$", slug, flags=re.IGNORECASE)
        if m:
            title = m.group(1).replace("-", " ").title()
            org_name = m.group(2).replace("-", " ").title()
        else:
            title = slug.replace("-", " ").title()

    elif source_name == "Internshala" and "detail/" in path:
        slug = path.split("detail/")[-1]
        slug = re.sub(r"\d+$", "", slug).strip("-")
        m = re.match(r"^(.+?)-in-(.+?)-at-(.+)$", slug, flags=re.IGNORECASE)
        if m:
            title = m.group(1).replace("-", " ").title()
            location = m.group(2).replace("-", " ").title()
            org_name = m.group(3).replace("-", " ").title()
        else:
            m2 = re.match(r"^(.+?)-at-(.+)$", slug, flags=re.IGNORECASE)
            if m2:
                title = m2.group(1).replace("-", " ").title()
                org_name = m2.group(2).replace("-", " ").title()
            else:
                title = slug.replace("-", " ").title()
    else:
        segments = [s for s in path.split("/") if s and not s.isdigit()]
        if segments:
            last = re.sub(r"[-_]+", " ", segments[-1]).strip()
            if len(last) > 3:
                title = last.title()

    return {
        "title": title,
        "organizationName": org_name,
        "location": location,
    }


def extract_job_from_url(
    raw_url: str, html_override: str | None = None
) -> dict[str, Any]:
    """
    Fetches and extracts structured job details from a LinkedIn, Internshala, Indeed,
    Greenhouse, Lever, Ashby, or company career page URL.
    Handles auth-walled job boards gracefully by extracting metadata from the URL slug
    and indicating partial extraction when full HTML is blocked.
    """
    canonical_url = normalize_application_url(raw_url)
    parsed = urlparse(canonical_url)
    host = (parsed.hostname or "").lower()
    source_name = _detect_source_platform(host)

    html_content = html_override
    fetch_error: str | None = None

    if html_content is None:
        try:
            with httpx.Client(
                follow_redirects=True,
                timeout=10.0,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            ) as client:
                res = client.get(raw_url.strip())
                if res.status_code < 400 and "text/html" in res.headers.get("content-type", "text/html"):
                    html_content = res.text
                else:
                    fetch_error = f"Site returned HTTP {res.status_code} (login wall or anti-bot block)"
        except Exception as exc:
            fetch_error = f"Could not reach site directly ({type(exc).__name__})"

    extracted: dict[str, Any] = {
        "title": "",
        "organizationName": "",
        "officialWebsite": None,
        "location": "Not available",
        "workMode": "unknown",
        "compensationMin": None,
        "compensationMax": None,
        "compensationCurrency": None,
        "compensationPeriod": "unknown",
        "duration": "Not available",
        "deadline": None,
        "description": "",
    }

    def _is_missing_field(val: Any) -> bool:
        if val is None:
            return True
        s = str(val).strip()
        return s == "" or s.lower() in ("not available", "unknown", "unspecified")

    if html_content:
        ld_job = _parse_json_ld_job(html_content)
        dom_job = _parse_platform_dom(html_content, source_name)
        if ld_job:
            for k, v in ld_job.items():
                if not _is_missing_field(v):
                    extracted[k] = v
        for k in ("title", "organizationName", "location", "description"):
            if _is_missing_field(extracted.get(k)) and not _is_missing_field(dom_job.get(k)):
                extracted[k] = dom_job[k]

    slug_data = _parse_url_slug_fallback(raw_url, source_name)
    if _is_missing_field(extracted["title"]) and slug_data["title"]:
        extracted["title"] = slug_data["title"]
    if _is_missing_field(extracted["organizationName"]) and slug_data["organizationName"]:
        extracted["organizationName"] = slug_data["organizationName"]
    if _is_missing_field(extracted["location"]) and slug_data["location"]:
        extracted["location"] = slug_data["location"]

    combined_text = f"{extracted['title']} {extracted['description']} {extracted['location']}"
    role_category, domain = _infer_role_and_domain(combined_text)
    opp_type = _infer_opportunity_type(combined_text)

    if extracted.get("workMode") in (None, "", "unknown"):
        extracted["workMode"] = normalize_work_mode(
            None,
            "" if _is_missing_field(extracted["location"]) else extracted["location"],
            extracted["title"],
        )

    if _is_missing_field(extracted.get("duration")):
        extracted["duration"] = extract_explicit_duration(
            f"{extracted['title']} {extracted['description']}"
        )

    if (
        extracted["compensationMin"] is None
        and extracted["compensationPeriod"] == "unknown"
        and re.search(r"\bunpaid\b", combined_text, flags=re.IGNORECASE)
    ):
        extracted["compensationPeriod"] = "unpaid"

    final_location = (
        extracted["location"]
        if not _is_missing_field(extracted["location"])
        else ("Remote" if extracted["workMode"] == "remote" else "Not available")
    )

    partial = len(str(extracted.get("description", "")).strip()) < 30
    if partial:
        notice = (
            f"{source_name} restricted full page scraping ({fetch_error or 'JavaScript-rendered listing'}). "
            "Title/company details were extracted from the link—please paste the job description text below to complete the scam & skill check."
        )
    else:
        notice = f"Successfully fetched job details from {source_name}."

    return {
        "title": extracted["title"],
        "organizationName": extracted["organizationName"],
        "officialWebsite": extracted["officialWebsite"],
        "opportunityType": opp_type,
        "roleCategory": role_category,
        "domain": domain,
        "location": final_location,
        "workMode": extracted["workMode"],
        "compensationMin": extracted["compensationMin"],
        "compensationMax": extracted["compensationMax"],
        "compensationCurrency": extracted["compensationCurrency"],
        "compensationPeriod": extracted["compensationPeriod"],
        "duration": extracted["duration"],
        "deadline": extracted["deadline"],
        "applicationUrl": canonical_url,
        "sourceName": source_name,
        "description": extracted["description"],
        "partialExtraction": partial,
        "extractionNotice": notice,
    }

