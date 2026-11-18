import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SanitizationResult:
    cleaned_text: str
    injection_detected: bool
    matched_patterns: list[str]


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
    Detects instruction-override attempts and neutralizes adversarial directives
    before the text reaches any downstream LLM or structured extractor.
    """
    matched: list[str] = []
    cleaned = raw_text

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

