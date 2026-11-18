import re
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from app.modules.ingestion.freshness import is_specific_posting_url
from app.modules.intelligence.sanitizer import clean_html_to_text

TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "source",
    "fbclid",
    "gclid",
}

LEGAL_SUFFIX_PATTERN = re.compile(
    r"\b(pvt\.?\s*ltd\.?|private\s+limited|inc\.?|llc\.?|llp\.?|corp\.?|corporation|limited|ltd\.?)\b",
    re.IGNORECASE,
)


def normalize_organization_name(raw_name: str) -> str:
    """
    Normalizes organization names for deduplication while preserving core identity (PRD §11).
    Strips legal entity suffixes and collapses punctuation/whitespace.
    """
    cleaned = LEGAL_SUFFIX_PATTERN.sub("", raw_name.lower())
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or raw_name.strip().lower()


def normalize_role_title(raw_title: str) -> str:
    """
    Normalizes job titles by expanding common abbreviations and stripping parenthetical noise.
    """
    text = raw_title.lower().strip()
    text = re.sub(r"\bswe\b", "software engineering", text)
    text = re.sub(r"\bsde\b", "software development", text)
    text = re.sub(r"\bml\b", "machine learning", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_application_url(raw_url: str) -> str:
    """
    Canonicalizes application URLs by removing marketing/tracking parameters (utm_*, ref)
    and normalizing scheme/hostname/trailing slashes while preserving ATS job IDs.
    """
    trimmed = raw_url.strip()
    try:
        parsed = urlparse(trimmed)
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        port_suffix = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
        netloc = f"{host}{port_suffix}"
        path = parsed.path.rstrip("/") or "/"
        filtered_query = [
            (k, v)
            for k, v in parse_qsl(parsed.query, keep_blank_values=False)
            if k.lower() not in TRACKING_PARAMS
        ]
        filtered_query.sort()
        return urlunparse(
            (
                parsed.scheme.lower() or "https",
                netloc,
                path,
                "",
                urlencode(filtered_query),
                "",
            )
        )
    except Exception:
        return trimmed.lower().rstrip("/")


DURATION_EXPLICIT_PATTERN = re.compile(
    r"\b(\d+\s*(?:to|-|–)\s*\d+\s*(?:months?|weeks?)|\d+\s*(?:months?|weeks?))\b",
    re.IGNORECASE,
)

PLACEHOLDER_ORG_NAMES = {
    "unknown",
    "unknown organization",
    "company",
    "indian tech company",
    "unverified organization",
    "not available",
    "remote company",
    "remote organization",
    "tech organization",
}


def normalize_work_mode(
    raw_mode: str | None,
    location: str | None = None,
    title: str | None = None,
) -> Literal["remote", "hybrid", "onsite", "unknown"]:
    """
    Determines workMode strictly from explicit tokens in raw_mode first, then location/title.
    Never guesses remote/hybrid/onsite when unstated; returns 'unknown' instead.
    """
    for source_text in (raw_mode or "", f"{location or ''} {title or ''}"):
        text = source_text.lower().strip()
        if not text:
            continue
        if re.search(r"\bhybrid\b", text):
            return "hybrid"
        if re.search(
            r"\b(?:remote|work\s+from\s+home|wfh|telecommute|anywhere)\b", text
        ):
            return "remote"
        if re.search(
            r"\b(?:onsite|on-site|in-office|in\s+office|work\s+from\s+office)\b", text
        ):
            return "onsite"
    return "unknown"


def extract_explicit_duration(text: str | None) -> str:
    """
    Extracts an explicit duration (e.g. '3 to 6 months', '12 weeks') from source text.
    Returns 'Not available' when no explicit duration is stated.
    """
    if not text or not str(text).strip():
        return "Not available"
    m = DURATION_EXPLICIT_PATTERN.search(str(text))
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    return "Not available"


def has_minimum_listing_info(
    title: str | None,
    org_name: str | None,
    app_url: str | None,
    description: str | None,
) -> bool:
    """
    Ensures automated ingestion only admits listings with real title, real organization,
    specific posting URL, and sufficient source description text (>= 40 chars).
    """
    t = (title or "").strip()
    org = (org_name or "").strip()
    if len(t) < 4 or len(org) < 2:
        return False
    if org.lower() in PLACEHOLDER_ORG_NAMES:
        return False
    if not is_specific_posting_url(app_url):
        return False
    clean_desc = clean_html_to_text(description or "")
    return len(clean_desc) >= 40


def tokenize_text(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9+#]{2,}", text.lower())
    stopwords = {
        "the",
        "and",
        "for",
        "with",
        "you",
        "will",
        "our",
        "are",
        "join",
        "team",
        "work",
        "role",
        "intern",
        "internship",
    }
    return {w for w in words if w not in stopwords}


def jaccard_similarity(text_a: str, text_b: str) -> float:
    tokens_a = tokenize_text(text_a)
    tokens_b = tokenize_text(text_b)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return intersection / union if union > 0 else 0.0


NON_TECHNICAL_TITLE_PATTERN = re.compile(
    r"\b(?:market\s+access|sales|account\s+executive|business\s+development|"
    r"recruiter|talent\s+acquisition|human\s+resources|hr\s+manager|legal|"
    r"counsel|finance\s+manager|marketing\s+manager|customer\s+success|"
    r"payroll|nurse|physician|medical\s+science|clinical\s+trial|real\s+estate)\b",
    re.IGNORECASE,
)

TECHNICAL_ROLE_PATTERN = re.compile(
    r"\b(?:software|engineer|developer|programmer|data|machine\s+learning|ml|ai|"
    r"security|cyber|appsec|infosec|systems|cloud|devops|sre|frontend|backend|"
    r"full\s*stack|fullstack|mobile|ios|android|platform|research|intern|internship|"
    r"fellowship|python|typescript|react|rust|golang|kubernetes|distributed|quant|"
    r"quantitative|product\s+manag(?:er|ement)|apm|associate\s+product|"
    r"ui/ux|ux\s+design(?:er)?|ui\s+design(?:er)?|product\s+design(?:er)?|"
    r"interaction\s+design(?:er)?|embedded|vlsi|fpga|asic|silicon|firmware|"
    r"robotics|hardware|mechatronics|financial\s+analyst|risk\s+analyst|"
    r"business\s+analyst|equity\s+research|growth\s+(?:analyst|intern)|"
    r"marketing\s+intern|operations\s+intern|supply\s+chain|bioinformatics|biotech)\b",
    re.IGNORECASE,
)


def is_technical_career_role(title: str, tags: list[str] | None = None) -> bool:
    """
    Filters out non-technical commercial/clinical/HR postings when ingesting from
    broad job boards while preserving engineering, data, ML, security, and research roles.
    """
    clean_title = (title or "").strip()
    if not clean_title:
        return False
    has_tech_title = bool(TECHNICAL_ROLE_PATTERN.search(clean_title))
    if NON_TECHNICAL_TITLE_PATTERN.search(clean_title) and not has_tech_title:
        return False
    if has_tech_title:
        return True
    tags_blob = " ".join(str(t) for t in (tags or []))
    return bool(TECHNICAL_ROLE_PATTERN.search(tags_blob))


COUNTRY_HUB_KEYWORDS: dict[str, tuple[str, ...]] = {
    "india": (
        "india",
        "bengaluru",
        "bangalore",
        "hyderabad",
        "pune",
        "mumbai",
        "gurugram",
        "gurgaon",
        "noida",
        "delhi",
        "chennai",
        "kolkata",
        "kochi",
        "ahmedabad",
        "jaipur",
        "indore",
        "coimbatore",
        "trivandrum",
        "thiruvananthapuram",
        "kerala",
        "karnataka",
        "maharashtra",
        "tamil nadu",
        "telangana",
    ),
    "united states": ("united states", "usa", "u.s.", "san francisco", "new york", "seattle", "austin", "boston", "california", "bay area"),
    "united kingdom": ("united kingdom", "uk", "london", "manchester", "cambridge", "edinburgh"),
    "canada": ("canada", "toronto", "vancouver", "montreal", "waterloo", "ottawa"),
    "germany": ("germany", "berlin", "munich", "hamburg", "frankfurt", "deutschland"),
    "singapore": ("singapore",),
    "australia": ("australia", "sydney", "melbourne", "brisbane"),
    "netherlands": ("netherlands", "amsterdam", "rotterdam", "utrecht"),
    "france": ("france", "paris", "lyon"),
    "japan": ("japan", "tokyo", "osaka"),
}


def is_native_country_location(location: str, native_country: str = "India") -> bool:
    """
    Determines whether a job's location matches the user's native country (default: India).
    """
    loc = (location or "").strip().lower()
    if not loc:
        return False
    country_key = (native_country or "India").strip().lower()
    keywords = COUNTRY_HUB_KEYWORDS.get(country_key, (country_key,))
    if any(re.search(rf"\b{re.escape(k)}\b", loc) for k in keywords):
        return True
    if country_key == "india" and re.search(r",\s*in\b", loc):
        return True
    return False

