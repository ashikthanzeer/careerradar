import base64
import html as html_lib
import importlib.util
import io
import re
from typing import Any
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import zipfile
import zlib
import httpx
from app.schemas.api_schemas import (
    ProfileProjectSchema,
    RoleCategory,
    UserSkillSchema,
)

SKILL_CATALOG: list[tuple[str, str, list[re.Pattern[str]]]] = [
    ("Python", "language", [re.compile(r"\bpython\b", re.I)]),
    ("TypeScript", "language", [re.compile(r"\btypescript\b", re.I)]),
    ("JavaScript", "language", [re.compile(r"\bjavascript\b|\becmascript\b", re.I)]),
    ("Java", "language", [re.compile(r"\bjava\b(?!script)", re.I)]),
    ("Go", "language", [re.compile(r"\bgolang\b|\bgo\s+programming\b|\bin\s+go\b", re.I)]),
    ("Rust", "language", [re.compile(r"\brust\b", re.I)]),
    ("C++", "language", [re.compile(r"\bc\+\+\b|\bcpp\b", re.I)]),
    ("SQL", "language", [re.compile(r"\bsql\b", re.I)]),
    ("React", "framework", [re.compile(r"\breact(?:\.js|js)?\b", re.I)]),
    ("Next.js", "framework", [re.compile(r"\bnext\.?js\b", re.I)]),
    ("Node.js", "framework", [re.compile(r"\bnode\.?js\b", re.I)]),
    ("FastAPI", "framework", [re.compile(r"\bfastapi\b", re.I)]),
    ("Django", "framework", [re.compile(r"\bdjango\b", re.I)]),
    ("PostgreSQL", "systems", [re.compile(r"\bpostgresql\b|\bpostgres\b", re.I)]),
    ("Redis", "systems", [re.compile(r"\bredis\b", re.I)]),
    ("Docker", "tooling", [re.compile(r"\bdocker\b", re.I)]),
    ("Kubernetes", "systems", [re.compile(r"\bkubernetes\b|\bk8s\b", re.I)]),
    ("AWS", "systems", [re.compile(r"\baws\b|\bamazon web services\b", re.I)]),
    ("Terraform", "tooling", [re.compile(r"\bterraform\b", re.I)]),
    ("Linux", "systems", [re.compile(r"\blinux\b", re.I)]),
    ("Git", "tooling", [re.compile(r"\bgit\b", re.I)]),
    ("PyTorch", "data_ml", [re.compile(r"\bpytorch\b", re.I)]),
    ("TensorFlow", "data_ml", [re.compile(r"\btensorflow\b", re.I)]),
    ("Machine Learning", "data_ml", [re.compile(r"\bmachine\s+learning\b|\bdeep\s+learning\b", re.I)]),
    ("Pandas", "data_ml", [re.compile(r"\bpandas\b", re.I)]),
    ("Distributed Systems", "systems", [re.compile(r"\bdistributed\s+systems\b|\bmicroservices\b", re.I)]),
    ("Cybersecurity", "fundamentals", [re.compile(r"\bcybersecurity\b|\bappsec\b|\bsecurity engineering\b", re.I)]),
]


def _extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            if "word/document.xml" not in zf.namelist():
                return ""
            xml_bytes = zf.read("word/document.xml")
        root = ET.fromstring(xml_bytes)
        paragraphs: list[str] = []
        for p in root.iter():
            if p.tag.endswith("}p"):
                texts = [t.text for t in p.iter() if t.tag.endswith("}t") and t.text]
                if texts:
                    paragraphs.append("".join(texts).strip())
        if paragraphs:
            return "\n".join(paragraphs)
        all_text = [t.text for t in root.iter() if t.tag.endswith("}t") and t.text]
        return " ".join(all_text)
    except Exception:
        return ""


def _extract_pdf_text(data: bytes) -> str:
    if importlib.util.find_spec("pypdf") is not None:
        try:
            import pypdf  # type: ignore[import-not-found]

            reader = pypdf.PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            joined = "\n".join(pages).strip()
            if joined:
                return joined
        except Exception:
            pass

    # Pure-Python fallback: decompress FlateDecode streams and collect Tj / TJ literals
    chunks: list[str] = []
    raw_chunks = [data]
    for m in re.finditer(rb"stream[\r\n]+(.*?)[\r\n]+endstream", data, flags=re.DOTALL):
        stream_bytes = m.group(1)
        try:
            raw_chunks.append(zlib.decompress(stream_bytes))
        except Exception:
            raw_chunks.append(stream_bytes)

    for chunk in raw_chunks:
        text_chunk = chunk.decode("latin-1", errors="ignore")
        for lit in re.findall(r"\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|\"|\))", text_chunk):
            cleaned = (
                lit.replace("\\(", "(")
                .replace("\\)", ")")
                .replace("\\n", "\n")
                .replace("\\r", " ")
                .strip()
            )
            if cleaned and any(ch.isalpha() for ch in cleaned):
                chunks.append(cleaned)

    if chunks:
        return " ".join(chunks)

    # Last fallback for uncompressed plain text runs inside PDF bytes
    plain = data.decode("utf-8", errors="ignore")
    readable = re.findall(r"[A-Za-z0-9][A-Za-z0-9\s,.;:+/#@()\-]{8,}", plain)
    return "\n".join(readable)


def extract_text_from_file_bytes(filename: str, data: bytes) -> str:
    lower = (filename or "").lower().strip()
    if lower.endswith(".docx") or data[:2] == b"PK":
        text = _extract_docx_text(data)
        if text.strip():
            return text
    if lower.endswith(".pdf") or data[:4] == b"%PDF":
        text = _extract_pdf_text(data)
        if text.strip():
            return text
    return data.decode("utf-8", errors="ignore")


def _extract_skills(
    text: str, source_type: str, source_reference: str
) -> list[UserSkillSchema]:
    found: list[UserSkillSchema] = []
    for idx, (canonical, category, patterns) in enumerate(SKILL_CATALOG):
        if any(p.search(text) for p in patterns):
            found.append(
                UserSkillSchema(
                    id=f"sk_{source_type}_{idx}_{canonical.lower().replace(' ', '_').replace('+', 'p')}",
                    canonicalName=canonical,
                    category=category,  # type: ignore[arg-type]
                    proficiency="intermediate",
                    yearsExperience=1.0,
                    sourceType=source_type,  # type: ignore[arg-type]
                    sourceReference=source_reference,
                )
            )
    return found


def _infer_roles_and_domains(text: str, skills: list[UserSkillSchema]) -> tuple[list[RoleCategory], list[str]]:
    blob = f"{text} {' '.join(s.canonicalName for s in skills)}".lower()
    roles: list[RoleCategory] = []
    domains: list[str] = []

    if any(k in blob for k in ("pytorch", "tensorflow", "machine learning", "deep learning", "llm", "rag", "ai ")):
        roles.append("machine_learning")
        domains.append("AI & Machine Learning")
    if any(k in blob for k in ("pandas", "sql", "analytics", "data engineer", "data science", "spark")):
        roles.append("data_science")
        domains.append("Data Engineering")
    if any(k in blob for k in ("kubernetes", "docker", "terraform", "linux", "aws", "distributed systems", "rust", "go")):
        roles.append("systems_infrastructure")
        domains.append("Developer Tools & Cloud")
        if "distributed systems" in blob or "rust" in blob or "go" in blob:
            domains.append("Distributed Systems")
    if any(k in blob for k in ("security", "appsec", "cybersecurity", "pentest", "vulnerability")):
        roles.append("security")
        domains.append("Cybersecurity")
    if any(k in blob for k in ("fintech", "payment", "stripe", "razorpay", "banking")):
        domains.append("Fintech & Payments")
    if any(k in blob for k in ("open source", "contributor", "maintainer")):
        domains.append("Open Source Ecosystem")
    if any(k in blob for k in ("research", "thesis", "publication", "lab")):
        roles.append("research")
        domains.append("Scientific Computing")
    if any(k in blob for k in ("react", "typescript", "python", "fastapi", "django", "node.js", "software", "backend", "frontend")):
        if "software_engineering" not in roles:
            roles.insert(0, "software_engineering")
        if "Developer Tools & Cloud" not in domains:
            domains.append("Developer Tools & Cloud")

    if not roles:
        roles = ["software_engineering"]
    if not domains:
        domains = ["Developer Tools & Cloud"]
    return list(dict.fromkeys(roles)), list(dict.fromkeys(domains))


def _infer_education(text: str) -> dict[str, Any]:
    lower = text.lower()
    edu_level = "undergraduate"
    if any(k in lower for k in ("ph.d", "phd", "doctorate")):
        edu_level = "phd"
    elif any(k in lower for k in ("master", "m.sc", "m.s.", "m.tech", "ms in ")):
        edu_level = "masters"
    elif any(k in lower for k in ("graduated", "alumni", "working full-time")):
        edu_level = "recent_graduate"

    field = "Computer Science"
    field_patterns = [
        (r"\b(?:computer science|cs|software engineering)\b", "Computer Science & Engineering"),
        (r"\b(?:artificial intelligence|machine learning|data science)\b", "AI & Data Science"),
        (r"\b(?:electronics|electrical|ece|eee)\b", "Electrical & Computer Engineering"),
        (r"\b(?:information technology|it)\b", "Information Technology"),
        (r"\b(?:mathematics|statistics|computational)\b", "Mathematics & Computing"),
    ]
    for pat, label in field_patterns:
        if re.search(pat, lower):
            field = label
            break

    inst_match = re.search(
        r"([A-Z][A-Za-z0-9&.,\s]{3,60}(?:University|Institute of Technology|College|IIT|NIT|IIIT|School of [A-Za-z\s]+))",
        text,
    )
    institution = inst_match.group(1).strip() if inst_match else "University"

    year_matches = [int(y) for y in re.findall(r"\b(202[0-9]|203[0-5])\b", text)]
    grad_year = max(year_matches) if year_matches else 2027
    grad_year = min(2035, max(2020, grad_year))

    return {
        "educationLevel": edu_level,
        "fieldOfStudy": field,
        "institution": institution,
        "graduationYear": grad_year,
    }


def _strip_html_body(raw_html: str) -> str:
    clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw_html, flags=re.I | re.S)
    clean = re.sub(r"<(br|p|div|li|h[1-6]|tr)[^>]*>", "\n", clean, flags=re.I)
    clean = html_lib.unescape(re.sub(r"<[^>]+>", " ", clean))
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in clean.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def extract_profile_from_resume(
    text: str | None = None,
    filename: str | None = None,
    file_base64: str | None = None,
) -> dict[str, Any]:
    parts: list[str] = []
    if text and text.strip():
        parts.append(text.strip())
    if file_base64 and file_base64.strip():
        raw_b64 = file_base64.split(",", 1)[-1].strip()
        file_bytes = base64.b64decode(raw_b64)
        extracted_file_text = extract_text_from_file_bytes(filename or "resume.txt", file_bytes)
        if extracted_file_text.strip():
            parts.append(extracted_file_text.strip())

    combined = "\n".join(parts).strip()
    if len(combined) < 10:
        return {
            "extractedTextLength": len(combined),
            "skills": [],
            "projects": [],
            "preferredRoles": ["software_engineering"],
            "preferredDomains": ["Developer Tools & Cloud"],
            "extractionNotice": "Could not read enough readable text from the resume. Try pasting resume text or uploading a text-based PDF/DOCX.",
        }

    src_label = f"Resume ({filename})" if filename else "Resume Text"
    skills = _extract_skills(combined, "resume", src_label)
    roles, domains = _infer_roles_and_domains(combined, skills)
    edu = _infer_education(combined)

    # Extract candidate name from first clean header line if it looks like a person's name
    first_lines = [ln.strip() for ln in combined.splitlines() if ln.strip()][:5]
    display_name = None
    for ln in first_lines:
        words = ln.split()
        if (
            2 <= len(words) <= 4
            and "@" not in ln
            and "http" not in ln.lower()
            and all(w[0].isalpha() for w in words if w)
            and not any(k in ln.lower() for k in ("resume", "curriculum", "experience", "education", "skills"))
        ):
            display_name = ln
            break

    li_m = re.search(r"https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?", combined, re.I)
    gh_m = re.search(r"https?://(?:www\.)?github\.com/[A-Za-z0-9\-_]+/?", combined, re.I)
    url_m = re.findall(r"https?://[A-Za-z0-9.\-_/~?=&%]+", combined)
    portfolio_url = next(
        (u for u in url_m if "linkedin.com" not in u.lower() and "github.com" not in u.lower()),
        gh_m.group(0) if gh_m else None,
    )

    projects: list[dict[str, Any]] = []
    if skills:
        projects.append(
            ProfileProjectSchema(
                id="proj_resume_1",
                title="Resume Technical Experience",
                description=combined[:280].replace("\n", " "),
                technologiesUsed=[s.canonicalName for s in skills[:6]],
            ).model_dump()
        )

    return {
        "displayName": display_name,
        "educationLevel": edu["educationLevel"],
        "fieldOfStudy": edu["fieldOfStudy"],
        "institution": edu["institution"],
        "graduationYear": edu["graduationYear"],
        "preferredRoles": roles,
        "preferredDomains": domains,
        "linkedinUrl": li_m.group(0) if li_m else None,
        "portfolioUrl": portfolio_url,
        "skills": [s.model_dump() for s in skills],
        "projects": projects,
        "careerInterestsSummary": (
            f"Interested in {', '.join(domains[:2])} roles leveraging "
            f"{', '.join(s.canonicalName for s in skills[:5]) or edu['fieldOfStudy']}."
        ),
        "extractedTextLength": len(combined),
        "extractionNotice": f"Extracted {len(skills)} skill(s) and aligned your field ({domains[0]}) from {src_label}.",
    }


def extract_profile_from_sources(
    linkedin_url: str | None = None,
    portfolio_url: str | None = None,
    github_url: str | None = None,
    pasted_text: str | None = None,
    html_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    all_skills: dict[str, UserSkillSchema] = {}
    projects: list[dict[str, Any]] = []
    notices: list[str] = []
    text_blobs: list[str] = []
    display_name: str | None = None

    if pasted_text and pasted_text.strip():
        text_blobs.append(pasted_text.strip())
        for sk in _extract_skills(pasted_text, "linkedin", "LinkedIn / Bio Text"):
            all_skills.setdefault(sk.canonicalName.lower(), sk)

    with httpx.Client(
        timeout=6.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 CareerRadar-Profile-Extractor/1.0"},
    ) as http:
        # 1. LinkedIn Profile URL (or public meta + /in/<slug> + pasted LinkedIn text)
        if linkedin_url and linkedin_url.strip():
            clean_li = linkedin_url.strip()
            li_html = (html_overrides or {}).get("linkedin")
            if li_html is None:
                try:
                    res = http.get(clean_li)
                    if res.status_code < 400:
                        li_html = res.text
                    else:
                        notices.append(
                            f"LinkedIn returned HTTP {res.status_code} (login wall); extracted slug details and bio text."
                        )
                except Exception:
                    notices.append("LinkedIn page restricted direct fetch; using profile link and pasted bio.")

            if li_html:
                body = _strip_html_body(li_html)
                title_m = re.search(r"<title[^>]*>(.*?)</title>", li_html, re.I | re.S)
                if title_m:
                    raw_title = html_lib.unescape(title_m.group(1)).split("|")[0].split("-")[0].strip()
                    if raw_title and len(raw_title.split()) <= 4:
                        display_name = display_name or raw_title
                text_blobs.append(body[:4000])
                li_skills = _extract_skills(body, "linkedin", f"LinkedIn ({clean_li})")
                for sk in li_skills:
                    all_skills.setdefault(sk.canonicalName.lower(), sk)
                notices.append(f"Scanned LinkedIn profile metadata ({len(li_skills)} skills found).")

            slug_m = re.search(r"linkedin\.com/in/([A-Za-z0-9\-_%]+)", clean_li, re.I)
            if slug_m and not display_name:
                slug_clean = re.sub(r"-[0-9a-f]{6,}$", "", slug_m.group(1)).replace("-", " ").title()
                if len(slug_clean.split()) <= 4:
                    display_name = slug_clean

        # 2. Personal Portfolio Website URL
        if portfolio_url and portfolio_url.strip():
            clean_port = portfolio_url.strip()
            port_html = (html_overrides or {}).get("portfolio")
            if port_html is None:
                try:
                    res = http.get(clean_port)
                    if res.status_code < 400:
                        port_html = res.text
                    else:
                        notices.append(f"Portfolio site returned HTTP {res.status_code}.")
                except Exception as exc:
                    notices.append(f"Could not reach portfolio site ({type(exc).__name__}).")

            if port_html:
                body = _strip_html_body(port_html)
                title_m = re.search(r"<title[^>]*>(.*?)</title>", port_html, re.I | re.S)
                port_title = html_lib.unescape(title_m.group(1)).strip() if title_m else urlparse(clean_port).netloc
                if not display_name and port_title:
                    candidate = port_title.split("|")[0].split("-")[0].strip()
                    if 1 < len(candidate.split()) <= 4:
                        display_name = candidate
                text_blobs.append(body[:6000])
                port_skills = _extract_skills(body, "portfolio", f"Portfolio ({clean_port})")
                for sk in port_skills:
                    all_skills.setdefault(sk.canonicalName.lower(), sk)
                projects.append(
                    ProfileProjectSchema(
                        id="proj_portfolio_1",
                        title=port_title[:80] or "Portfolio Website",
                        description=body[:280].replace("\n", " "),
                        technologiesUsed=[s.canonicalName for s in port_skills[:6]],
                    ).model_dump()
                )
                notices.append(f"Extracted {len(port_skills)} skill(s) from Portfolio Website.")

        # 3. GitHub Profile URL (optional bonus if supplied alongside or as portfolio)
        effective_gh = github_url.strip() if github_url and github_url.strip() else None
        if not effective_gh and portfolio_url and "github.com/" in portfolio_url.lower():
            effective_gh = portfolio_url.strip()

        if effective_gh:
            gh_match = re.search(r"github\.com/([A-Za-z0-9\-_]+)", effective_gh, re.I)
            if gh_match:
                username = gh_match.group(1)
                try:
                    u_res = http.get(f"https://api.github.com/users/{username}")
                    r_res = http.get(
                        f"https://api.github.com/users/{username}/repos",
                        params={"sort": "updated", "per_page": 10},
                    )
                    if u_res.status_code == 200:
                        u_json = u_res.json()
                        display_name = display_name or u_json.get("name") or username
                        if u_json.get("bio"):
                            text_blobs.append(str(u_json["bio"]))
                    if r_res.status_code == 200 and isinstance(r_res.json(), list):
                        repo_texts: list[str] = []
                        gh_langs: list[str] = []
                        for repo in r_res.json()[:6]:
                            lang = repo.get("language")
                            if lang:
                                gh_langs.append(str(lang))
                            repo_texts.append(
                                f"{repo.get('name', '')} {repo.get('description') or ''} {' '.join(repo.get('topics') or [])}"
                            )
                        gh_blob = "\n".join([*gh_langs, *repo_texts])
                        text_blobs.append(gh_blob)
                        gh_skills = _extract_skills(gh_blob, "github", f"GitHub (@{username})")
                        for sk in gh_skills:
                            all_skills.setdefault(sk.canonicalName.lower(), sk)
                        notices.append(f"Extracted {len(gh_skills)} skill(s) from GitHub (@{username}).")
                except Exception:
                    notices.append("GitHub API unavailable right now.")

    combined = "\n".join(text_blobs)
    skills_list = list(all_skills.values())
    roles, domains = _infer_roles_and_domains(combined, skills_list)
    edu = _infer_education(combined)

    return {
        "displayName": display_name,
        "educationLevel": edu["educationLevel"],
        "fieldOfStudy": edu["fieldOfStudy"],
        "institution": edu["institution"],
        "graduationYear": edu["graduationYear"],
        "preferredRoles": roles,
        "preferredDomains": domains,
        "linkedinUrl": linkedin_url.strip() if linkedin_url and linkedin_url.strip() else None,
        "portfolioUrl": portfolio_url.strip() if portfolio_url and portfolio_url.strip() else None,
        "skills": [s.model_dump() for s in skills_list],
        "projects": projects,
        "careerInterestsSummary": (
            f"Targeting {', '.join(domains[:2])} opportunities matching "
            f"{', '.join(s.canonicalName for s in skills_list[:5]) or edu['fieldOfStudy']}."
        ),
        "extractionNotice": " ".join(notices) or "Processed LinkedIn and portfolio inputs.",
    }

