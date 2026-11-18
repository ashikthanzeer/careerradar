import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

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


def normalize_work_mode(raw_mode: str | None, raw_location: str | None = None) -> str:
    combined = f"{raw_mode or ''} {raw_location or ''}".lower()
    if any(k in combined for k in ("remote", "wfh", "work from home", "distributed", "anywhere")):
        if "hybrid" in combined:
            return "hybrid"
        return "remote"
    if "hybrid" in combined:
        return "hybrid"
    if any(k in combined for k in ("onsite", "on-site", "in-office", "in person", "campus")):
        return "onsite"
    return "unknown"


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
    r"fellowship|python|typescript|react|rust|golang|kubernetes|distributed|quant)\b",
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

