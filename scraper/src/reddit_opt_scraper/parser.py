"""Parse OPT timeline template fields from Reddit comment bodies."""

import re
from datetime import datetime
from typing import Optional

# ── Null/empty sentinel values ────────────────────────────────────────────────
NULL_VALUES = frozenset(
    {
        "", "-", "--", "n/a", "na", "none", "tbd", "pending",
        "not yet", "not received", "n\\a", "still pending",
        "waiting", "?", "unknown", "in progress", "not applicable",
        "no date yet", "not yet received", "not yet approved",
    }
)

# ── Date parsing ──────────────────────────────────────────────────────────────
# Pairs of (strptime format, regex to locate candidate in string)
_DATE_FORMATS = [
    ("%m/%d/%Y", re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b")),
    ("%Y-%m-%d", re.compile(r"\b\d{4}-\d{2}-\d{2}\b")),
    ("%m-%d-%Y", re.compile(r"\b\d{1,2}-\d{1,2}-\d{4}\b")),
    ("%m/%d/%y", re.compile(r"\b\d{1,2}/\d{1,2}/\d{2}\b")),
    # Month-name formats: "Feb 2, 2026" / "February 2, 2026"
    ("%b %d, %Y", re.compile(r"\b[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\b")),
    ("%B %d, %Y", re.compile(r"\b[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\b")),
]

_SLASH_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")


def parse_date(value: str) -> Optional[str]:
    """Return ISO YYYY-MM-DD or None. Accepts values like 'YES | 02/14/2026'."""
    if not value:
        return None
    v = value.strip()
    if v.lower() in NULL_VALUES:
        return None

    # Detect DD/MM/YYYY: if the first segment > 12 it can't be a month
    m = _SLASH_DATE.search(v)
    if m:
        a, b, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a > 12 and b <= 12:
            try:
                d = datetime(year, b, a)
                if 2020 <= d.year <= 2035:
                    return d.strftime("%Y-%m-%d")
            except ValueError:
                pass

    for fmt, pat in _DATE_FORMATS:
        m = pat.search(v)
        if m:
            try:
                d = datetime.strptime(m.group(), fmt)
                if 2020 <= d.year <= 2035:
                    return d.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def parse_bool(value: str) -> Optional[bool]:
    v = value.strip().lower()
    if v in ("yes", "y", "true", "1"):
        return True
    if v in ("no", "n", "false", "0"):
        return False
    return None


def parse_type(value: str) -> tuple[str, str]:
    """Return (raw_type, 'OPT' | 'STEM')."""
    raw = value.strip()
    up = raw.upper()
    if "STEM" in up:
        return raw, "STEM"
    return raw, "OPT"


# ── Markdown / HTML cleanup ───────────────────────────────────────────────────
_MD_BOLD = re.compile(r"\*{1,3}(.*?)\*{1,3}", re.DOTALL)
_MD_ITALIC = re.compile(r"_{1,2}(.*?)_{1,2}", re.DOTALL)
_BULLET = re.compile(r"^\s*[*\-•]\s*", re.MULTILINE)

_HTML_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&nbsp;": " ", "&#x200B;": "", "\u200b": "",
    "\u2011": "-", "\u2013": "-", "\u2014": "-",
}


def _clean(text: str) -> str:
    text = _MD_BOLD.sub(r"\1", text)
    text = _MD_ITALIC.sub(r"\1", text)
    for ent, rep in _HTML_ENTITIES.items():
        text = text.replace(ent, rep)
    text = _BULLET.sub("", text)
    return text


# ── Field-name → normalized key mapping ──────────────────────────────────────
# Each tuple: (compiled regex, normalized_key).
# Ordered from most-specific to least-specific so the first match wins.
_FIELD_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"request\s+for\s+initial\s+evidence", re.I), "rfie_date"),
    (re.compile(r"\brfie\b", re.I), "rfie_date"),
    (re.compile(r"rfe\s+for\s+biometrics", re.I), "biometrics_requested_date"),
    (re.compile(r"biometrics\s+requested", re.I), "biometrics_requested_date"),
    (re.compile(r"biometrics\s+date.*?location", re.I), "biometrics_completed_date"),
    (re.compile(r"biometrics\s+(date|completed|appointment)", re.I), "biometrics_completed_date"),
    (re.compile(r"^biometrics$", re.I), "biometrics_completed_date"),
    (re.compile(r"notice\s+of\s+intent\s+to\s+deny", re.I), "noid"),
    (re.compile(r"\bnoid\b", re.I), "noid"),
    (re.compile(r"application\s+type", re.I), "type"),
    (re.compile(r"opt\s+type", re.I), "type"),
    (re.compile(r"^type$", re.I), "type"),
    (re.compile(r"premium\s+processing", re.I), "premium_processing"),
    (re.compile(r"\bpp\b", re.I), "premium_processing"),
    (re.compile(r"date\s+applied", re.I), "date_applied"),
    (re.compile(r"applied\s+date", re.I), "date_applied"),
    (re.compile(r"receipt\s+date", re.I), "date_applied"),
    (re.compile(r"application\s+date", re.I), "date_applied"),
    (re.compile(r"submission\s+date", re.I), "date_applied"),
    (re.compile(r"date\s+approved", re.I), "date_approved"),
    (re.compile(r"approved\s+date", re.I), "date_approved"),
    (re.compile(r"approval\s+date", re.I), "date_approved"),
    (re.compile(r"date\s+card\s+produced", re.I), "date_card_produced"),
    (re.compile(r"card\s+produced\s+date", re.I), "date_card_produced"),
    (re.compile(r"card\s+produced", re.I), "date_card_produced"),
    (re.compile(r"card\s+shipped", re.I), "date_card_shipped"),
    (re.compile(r"card\s+mailed", re.I), "date_card_shipped"),
    (re.compile(r"date\s+card\s+received", re.I), "date_card_received"),
    (re.compile(r"card\s+(received|delivered)", re.I), "date_card_received"),
    (re.compile(r"country\s+of\s+citizenship", re.I), "country_of_citizenship"),
    (re.compile(r"\b(country|citizenship|nationality)\b", re.I), "country_of_citizenship"),
]

_PAREN_NOTE = re.compile(r"\s*\(.*?\)")  # strip "(if applicable)" etc.


def _normalize_key(raw_key: str) -> Optional[str]:
    key = _PAREN_NOTE.sub("", raw_key.strip().lower()).strip()
    for pat, field in _FIELD_PATTERNS:
        if pat.search(key):
            return field
    return None


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_comment(body: str) -> dict:
    """
    Parse a comment body into structured fields.
    Returns a dict of normalized field values (all optional — may be None).
    """
    result: dict = {
        "type": None,
        "normalized_type": None,
        "premium_processing": None,
        "date_applied": None,
        "rfie_date": None,
        "biometrics_requested_date": None,
        "biometrics_completed_date": None,
        "biometrics_location": None,
        "noid": None,
        "noid_date": None,
        "date_approved": None,
        "date_card_produced": None,
        "date_card_shipped": None,
        "date_card_received": None,
        "country_of_citizenship": None,
        "parse_errors": [],
    }

    if not body:
        return result

    text = _clean(body)

    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line or ":" not in line:
            continue

        key_part, _, value_part = line.partition(":")
        key = key_part.strip()
        value = value_part.strip()

        if not key:
            continue

        field = _normalize_key(key)
        if field is None:
            continue

        # Dispatch
        if field == "type":
            if result["type"] is None:  # first match wins
                raw_t, norm_t = parse_type(value)
                result["type"] = raw_t
                result["normalized_type"] = norm_t

        elif field == "premium_processing":
            if result["premium_processing"] is None:
                result["premium_processing"] = parse_bool(value)

        elif field in (
            "date_applied", "rfie_date", "biometrics_requested_date",
            "biometrics_completed_date", "date_approved",
            "date_card_produced", "date_card_shipped", "date_card_received",
        ):
            if result[field] is None:
                result[field] = parse_date(value)

        elif field == "noid":
            if result["noid"] is None:
                b = parse_bool(value)
                result["noid"] = b
                if b:
                    result["noid_date"] = parse_date(value)

        elif field == "country_of_citizenship":
            if result["country_of_citizenship"] is None:
                v = value.strip()
                if v.lower() not in NULL_VALUES and v:
                    result["country_of_citizenship"] = v

        elif field == "biometrics_completed_date":
            # May include location after the date, e.g. "3/2/2026 - ASC Boston"
            if result["biometrics_completed_date"] is None:
                result["biometrics_completed_date"] = parse_date(value)
                # Extract location suffix
                date_pat = re.search(r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", value)
                if date_pat:
                    suffix = value[date_pat.end():].strip(" -|,")
                    if suffix:
                        result["biometrics_location"] = suffix

    return result


def compute_derived(record: dict) -> dict:
    """Add days_to_approval and days_to_card."""
    r = dict(record)

    def diff(d1: Optional[str], d2: Optional[str]) -> Optional[int]:
        if not d1 or not d2:
            return None
        try:
            a = datetime.strptime(d1, "%Y-%m-%d")
            b = datetime.strptime(d2, "%Y-%m-%d")
            delta = (b - a).days
            return delta if 0 <= delta <= 730 else None
        except ValueError:
            return None

    r["days_to_approval"] = diff(record.get("date_applied"), record.get("date_approved"))
    r["days_to_card"] = diff(record.get("date_applied"), record.get("date_card_received"))
    return r


def has_template_data(parsed: dict) -> bool:
    """Return True if the parsed result looks like a template response."""
    key_fields = ("date_applied", "type", "date_approved", "biometrics_completed_date")
    return any(parsed.get(f) for f in key_fields)
