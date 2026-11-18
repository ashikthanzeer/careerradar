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

