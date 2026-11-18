import html as html_lib
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SanitizationResult:
    cleaned_text: str
    injection_detected: bool
    matched_patterns: list[str]


def clean_html_to_text(raw: str | None) -> str:
    """
    Decodes single- or double-encoded HTML entities (e.g. &lt;div&gt; / &amp;quot;)
    and strips HTML markup while preserving clean sentence and line boundaries.
    """
    if not raw:
        return ""
    text = str(raw)
    for _ in range(3):
        decoded = html_lib.unescape(text)
        if decoded == text:
            break
        text = decoded

    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"</(?:p|div|li|h[1-6]|tr)\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<(?:br|p|div|li|h[1-6]|tr)[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)

    # Decode once more in case entities appeared inside text nodes after tag removal
    text = html_lib.unescape(text).replace("\xa0", " ")

    lines: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"[ \t\r\f\v]+", " ", raw_line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


# Adversarial patterns embedded in untrusted external listing descriptions
# that attempt to override system instructions, spoof trust scores, or invoke tools.
PROMPT_INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "ignore_previous_instructions",
        re.compile(
            r"\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules|directives)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "override_trust_verdict",
        re.compile(
            r"\b(mark|classify|declare|set|label)\s+this\s+(listing|opportunity|company|organization)\s+as\s+(100%\s+)?(safe|legitimate|verified|no_major_warnings|low\s+risk)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "system_prompt_spoof",
        re.compile(
            r"(<\s*system\s*>|\[\s*system\s+instruction\s*\]|###\s*system\s+prompt\s*:)",
            re.IGNORECASE,
        ),
    ),
    (
        "tool_call_spoof",
        re.compile(
            r"\b(execute_sql|drop\s+table|call_tool|run_command)\s*\(",
            re.IGNORECASE,
        ),
    ),
]


def sanitize_untrusted_listing_text(raw_text: str) -> SanitizationResult:
    """
    Treats external internship descriptions as untrusted data (AGENTS.md §7.3, PRD §15).
    Strips HTML tags/entities, detects instruction-override attempts, and neutralizes
    adversarial directives before text reaches any downstream LLM or structured extractor.
    """
    matched: list[str] = []
    cleaned = clean_html_to_text(raw_text)

    for name, pattern in PROMPT_INJECTION_PATTERNS:
        found = pattern.search(cleaned)
        if found:
            matched.append(f"{name}: '{found.group(0)}'")
            cleaned = pattern.sub("[REDACTED_ADVERSARIAL_DIRECTIVE]", cleaned)

    return SanitizationResult(
        cleaned_text=cleaned,
        injection_detected=len(matched) > 0,
        matched_patterns=matched,
    )

