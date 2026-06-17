"""Parse OPT timeline template fields from Reddit comment bodies."""

import re
from datetime import datetime, timedelta
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
    # Day-first month-name formats: "16 Oct 2025" / "16 October 2025"
    ("%d %b %Y", re.compile(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b")),
    ("%d %B %Y", re.compile(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b")),
]

# Normalize "Sept" → "Sep" since strptime's %b only accepts the 3-letter abbreviation.
_SEPT_FIX = re.compile(r"\bSept\b", re.I)

# Month-year only formats checked LAST — after ordinal checks — to avoid intercepting
# "30th Jan 2026" and returning Jan 1 instead of Jan 30.
_MONTH_YEAR_FORMATS = [
    ("%b %Y", re.compile(r"\b[A-Za-z]{3,9}\s+\d{4}\b")),
    ("%B %Y", re.compile(r"\b[A-Za-z]{3,9}\s+\d{4}\b")),
]

_SLASH_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
# Normalise malformed slashes ("05 / 15 / 2025", "03//04/2026") before matching
_SLASH_NORMALIZE = re.compile(r"\s*/+\s*")

# Ordinal date with year: "13th Oct 2025", "2nd Nov 2025", "1st Jan 2026"
_ORDINAL_DATE = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3,9})\s+(\d{4})\b", re.I
)
# Ordinal date without year: "3rd May", "28th Jan" — year inferred from context
_ORDINAL_DATE_NO_YEAR = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3,9})\b(?!\s*\d{4})", re.I
)


def parse_date(
    value: str,
    *,
    thread_year: Optional[int] = None,
    created_utc: Optional[datetime] = None,
) -> Optional[str]:
    """Return ISO YYYY-MM-DD or None. Accepts values like 'YES | 02/14/2026'.

    For dates without a year ("6th April"), the year is inferred from
    ``thread_year`` (the OPT cycle the thread is about) first, falling back to
    the year of ``created_utc`` if no thread context was given. When both
    candidates parse, prefers the latest one that is not after ``created_utc``
    (the event must have already happened by the time the comment was written).
    """
    if not value:
        return None
    v = value.strip()
    if v.lower() in NULL_VALUES:
        return None

    # Normalise malformed slashes: "05 / 15 / 2025" → "05/15/2025", "03//04" → "03/04"
    v = _SLASH_NORMALIZE.sub("/", v)
    # "Sept" → "Sep" so %b parses cleanly.
    v = _SEPT_FIX.sub("Sep", v)

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

    # Ordinal with year: "13th Oct 2025", "2nd Nov 2025", "21st March 2025"
    m = _ORDINAL_DATE.search(v)
    if m:
        candidate = f"{m.group(1)} {m.group(2)} {m.group(3)}"
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                d = datetime.strptime(candidate, fmt)
                if 2020 <= d.year <= 2035:
                    return d.strftime("%Y-%m-%d")
            except ValueError:
                continue

    # Ordinal without year: "3rd May", "28th Jan". Anchor inference to the
    # thread year (the OPT cycle) when known; otherwise the comment's
    # created_utc year. Try the anchor and the year before it, and pick the
    # latest candidate that's not after the comment was written.
    m = _ORDINAL_DATE_NO_YEAR.search(v)
    if m:
        if thread_year is not None:
            anchor = thread_year
        elif created_utc is not None:
            anchor = created_utc.year
        else:
            anchor = datetime.now().year
        ceiling = created_utc or datetime.now()

        candidates: list[datetime] = []
        for yr in (anchor, anchor - 1):
            cand_text = f"{m.group(1)} {m.group(2)} {yr}"
            for fmt in ("%d %b %Y", "%d %B %Y"):
                try:
                    d = datetime.strptime(cand_text, fmt)
                except ValueError:
                    continue
                if 2020 <= d.year <= 2035:
                    candidates.append(d)
                    break

        if candidates:
            # Prefer the most recent candidate that's not in the future
            # relative to when the comment was posted.
            plausible = [d for d in candidates if d.date() <= ceiling.date()]
            chosen = max(plausible) if plausible else min(candidates)
            return chosen.strftime("%Y-%m-%d")

    # Month-year only: "May 2026", "December 2025" → 1st of month.
    # Checked last so ordinal dates ("30th Jan 2026") are never intercepted.
    for fmt, pat in _MONTH_YEAR_FORMATS:
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
    if v in ("no", "n", "false", "0", "nope"):
        return False
    return None


# ── Premium-processing helpers ────────────────────────────────────────────────
# Phrases that signal an upgrade from regular → PP after the initial application.
_PP_UPGRADE_RE = re.compile(
    r"\b(?:"
    r"switch(?:ed)?\s+to"
    r"|convert(?:ed)?\s+to"
    r"|transfer(?:red)?\s+to"
    r"|upgrade[d]?\s+(?:to\b|on\b|later\b)"
    r"|opted\s+for"
    r"|applied\s+pp"
    r"|added\s+(?:on\b|pp\b|premium\b)"
    r"|updated\s+(?:on\b|to\b)"
    r"|pp\s+on\b"
    r")",
    re.I,
)

# Arrow upgrade: "no -> yes", "no → yes" (HTML &gt; is decoded by _clean before we get here)
_PP_ARROW = re.compile(r"no\s*(?:->|→|=>)\s*yes", re.I)

# Paren/bracket content (ASCII and Unicode full-width variants)
_PP_PAREN = re.compile(r"[（(]([^）)]*)[）)]")

# Field names that indicate a multiline bleed from adjacent template fields
_PP_OTHER_FIELDS = re.compile(
    r"\b(?:receipt|approved|card\s+(?:produced|shipped|delivered|received)|start\s+date)\b",
    re.I,
)


def _pp_upgrade_date(
    v: str,
    *,
    thread_year: Optional[int] = None,
    created_utc: Optional[datetime] = None,
) -> Optional[str]:
    """Return the upgrade date from a PP value string.

    Priority: date in parentheses > date after upgrade keyword > bare date
    (the last is skipped if adjacent template field names are present, to
    avoid picking up dates from multiline bleeds).
    """
    for content in _PP_PAREN.findall(v):
        d = parse_date(content, thread_year=thread_year, created_utc=created_utc)
        if d:
            return d
    m = _PP_UPGRADE_RE.search(v)
    if m:
        d = parse_date(v[m.start():], thread_year=thread_year, created_utc=created_utc)
        if d:
            return d
    if not _PP_OTHER_FIELDS.search(v):
        return parse_date(v, thread_year=thread_year, created_utc=created_utc)
    return None


def parse_premium_processing(
    value: str,
    *,
    thread_year: Optional[int] = None,
    created_utc: Optional[datetime] = None,
) -> tuple[Optional[bool], Optional[bool], Optional[str]]:
    """Parse a PP field value into (premium_processing, pp_upgraded, pp_upgrade_date).

    Handles all patterns seen in practice:
      YES / NO / nope
      YES (date) — applied with or upgraded to PP, date noted
      NO (switched to PP on date) / No(PP:date) / no -> yes
      Switched to PP on date / Opted for Premium / Upgraded on date
      date-only — bare date means PP was used
    """
    if not value:
        return None, None, None
    v = value.strip()
    if v.lower() in NULL_VALUES:
        return None, None, None

    # Arrow upgrade: "no -> yes"
    if _PP_ARROW.search(v):
        return True, True, _pp_upgrade_date(v, thread_year=thread_year, created_utc=created_utc)

    # Strip parens (ASCII + full-width) for the boolean portion
    bool_str = _PP_PAREN.sub("", v).strip(" ,.*-/\\")

    pp_bool = parse_bool(bool_str)

    # Lenient: accept "yes" / "no" as a leading word even with trailing junk
    if pp_bool is None:
        m = re.match(r"(yes|no|y|n)\b", bool_str, re.I)
        if m:
            pp_bool = parse_bool(m.group(1))

    if pp_bool is None:
        # Keyword-only upgrade value: "Switched to PP on …", "Opted for Premium", "Upgraded on"
        if _PP_UPGRADE_RE.search(bool_str):
            return True, True, _pp_upgrade_date(v, thread_year=thread_year, created_utc=created_utc)
        # Date-only: nothing meaningful left after stripping slash-dates
        date_stripped = re.sub(r"\b\d{1,2}[/\-]\d{1,2}[/\-](?:\d{2}|\d{4})\b", "", bool_str).strip()
        d = parse_date(v, thread_year=thread_year, created_utc=created_utc)
        if d and not date_stripped:
            return True, None, d
        # Explicit negative phrasing
        if bool_str.lower().startswith(("no", "not", "nope")):
            return False, None, None
        return None, None, None

    if pp_bool is True:
        d = _pp_upgrade_date(v, thread_year=thread_year, created_utc=created_utc)
        if d:
            return True, True, d
        return True, None, None

    # pp_bool is False — look for upgrade signals in the full string
    m_no = re.match(r"(?:no|nope|n)\b", v, re.I)
    suffix = v[m_no.end():] if m_no else v
    has_upgrade = (
        _PP_UPGRADE_RE.search(v)
        or re.search(r"\byes\b", suffix, re.I)
        or re.search(r"\bpp\s*:", v, re.I)
    )
    if has_upgrade:
        return True, True, _pp_upgrade_date(v, thread_year=thread_year, created_utc=created_utc)
    return False, None, None


def parse_type(value: str) -> tuple[str, str]:
    """Return (raw_type, 'OPT' | 'STEM')."""
    raw = value.strip()
    up = raw.upper()
    if "STEM" in up:
        return raw, "STEM"
    return raw, "OPT"


# ── Citizenship normalization ────────────────────────────────────────────────
# Posters often write ban-list status (e.g. "one of the 75 countries") in place
# of an actual nationality. We split that signal into a separate ban_status
# field so the citizenship column stays clean.

_KNOWN_COUNTRIES = (
    "India", "Nepal", "Canada", "Brazil", "Ghana", "South Korea", "Vietnam",
    "China", "Colombia", "Indonesia", "Pakistan", "Singapore", "Bangladesh",
    "Cameroon", "Egypt", "Germany", "Luxembourg", "Mexico", "Myanmar",
    "New Zealand", "Senegal", "Turkey", "United Kingdom", "United States",
    "Philippines", "Thailand", "Japan", "Taiwan", "Hong Kong", "Malaysia",
    "Sri Lanka", "Iran", "Nigeria", "Kenya", "France", "Italy", "Spain",
    "Russia", "Ukraine", "Argentina", "Chile", "Peru", "Venezuela",
    "Saudi Arabia", "United Arab Emirates", "Israel", "Australia",
    "South Africa", "Ethiopia", "Morocco", "Jordan", "Lebanon", "Poland",
    "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Finland",
    "Switzerland", "Austria", "Portugal", "Greece", "North Korea",
)

_DEMONYMS = {
    "indian": "India",
    "brazilian": "Brazil",
    "nepali": "Nepal",
    "nepalese": "Nepal",
    "np": "Nepal",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "us": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "usa": "United States",
    "korean": "South Korea",
    "korea": "South Korea",
    "chinese": "China",
    "mainland china": "China",
    "vietnamese": "Vietnam",
    "japanese": "Japan",
    "thai": "Thailand",
    "burmese": "Myanmar",
    "singaporean": "Singapore",
    "malaysian": "Malaysia",
    "sri lankan": "Sri Lanka",
    "filipino": "Philippines",
    "filipina": "Philippines",
    "pakistani": "Pakistan",
    "bangladeshi": "Bangladesh",
    "german": "Germany",
    "french": "France",
    "italian": "Italy",
    "mexican": "Mexico",
    "canadian": "Canada",
    "australian": "Australia",
    "british": "United Kingdom",
    "indonesian": "Indonesia",
    "colombian": "Colombia",
}

_RESTRICTED_PHRASES = (
    "75 ban", "75 countries", "75 country", "among 75", "one of the 75",
    "one of 75", "partial ban", "east asia country", "restricted country",
)
_NON_RESTRICTED_PHRASES = (
    "non-restricted", "non restricted", "none of any banned",
    "none of the banned", "not banned", "unbanned",
)

# Countries on the June 2025 presidential proclamation (full ban + partial
# restriction) that r/f1visa posters refer to as "the 75 countries". Edit this
# set as the policy list evolves.
_RESTRICTED_COUNTRIES = frozenset({
    # Full ban
    "Afghanistan", "Myanmar", "Chad", "Republic of the Congo",
    "Equatorial Guinea", "Eritrea", "Haiti", "Iran", "Libya", "Somalia",
    "Sudan", "Yemen",
    # Partial restriction
    "Burundi", "Cuba", "Laos", "Sierra Leone", "Togo", "Turkmenistan",
    "Venezuela",
})

_CITZ_NOISE_CUTS = (
    "//", ";", "service center", "silent api", "start date", " / ", "\n",
)


def _normalize_citizenship(raw: str) -> tuple[Optional[str], Optional[str]]:
    """Return (country, ban_status). ban_status ∈ {'restricted','non_restricted',None}."""
    if not raw:
        return None, None
    v = raw.strip().lower()
    # Strip common markdown/prefix noise
    v = re.sub(r"^[\\/\-\s.|*]+", "", v)
    for cut in _CITZ_NOISE_CUTS:
        idx = v.find(cut)
        if idx != -1:
            v = v[:idx]
    v = v.strip(" -,.;:|()[]")
    if not v or v in NULL_VALUES:
        return None, None

    if any(p in v for p in _NON_RESTRICTED_PHRASES):
        return None, "non_restricted"
    has_restricted = any(p in v for p in _RESTRICTED_PHRASES)

    def _ban_for(country: str) -> str:
        if has_restricted or country in _RESTRICTED_COUNTRIES:
            return "restricted"
        return "non_restricted"

    # 1. Exact match against demonyms or known countries
    if v in _DEMONYMS:
        c = _DEMONYMS[v]
        return c, _ban_for(c)
    for c in _KNOWN_COUNTRIES:
        if c.lower() == v:
            return c, _ban_for(c)

    # 2. Word-boundary search for longer names first (to avoid "Korea" matching "North Korea")
    sorted_countries = sorted(_KNOWN_COUNTRIES, key=len, reverse=True)
    for c in sorted_countries:
        if re.search(r"\b" + re.escape(c.lower()) + r"\b", v):
            return c, _ban_for(c)

    # 3. Word-boundary search for demonyms
    # Sort demonyms by length to handle things like "South Korean" before "Korean"
    sorted_demonyms = sorted(_DEMONYMS.items(), key=lambda x: len(x[0]), reverse=True)
    for d, c in sorted_demonyms:
        if re.search(r"\b" + re.escape(d) + r"\b", v):
            return c, _ban_for(c)

    if has_restricted:
        return None, "restricted"
    return None, None


# ── Markdown / HTML cleanup ───────────────────────────────────────────────────
_MD_BOLD = re.compile(r"\*{1,3}(.*?)\*{1,3}", re.DOTALL)
_MD_ITALIC = re.compile(r"_{1,2}(.*?)_{1,2}", re.DOTALL)
_BULLET = re.compile(r"^\s*[*\-•]\s*", re.MULTILINE)

_HTML_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&nbsp;": " ", "&#x200B;": "", "\u200b": "", "\u2060": "",
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
    (re.compile(r"date\s+card\s+rec(?:ei|ie)ved", re.I), "date_card_received"),
    (re.compile(r"card\s+(?:rec(?:ei|ie)ved|delivered)", re.I), "date_card_received"),
    (re.compile(r"country\s+of\s+citizenship", re.I), "country_of_citizenship"),
    (re.compile(r"\b(country|citizenship|nationality)\b", re.I), "country_of_citizenship"),
    (re.compile(r"(?:opt|stem\s+opt|employment|job|intended)\s+start\s+date", re.I), "employment_start_date"),
    (re.compile(r"start\s+date", re.I), "employment_start_date"),
    (re.compile(r"service\s+cent(?:er|re)", re.I), "service_center"),
    (re.compile(r"processing\s+cent(?:er|re)", re.I), "service_center"),
    (re.compile(r"graduat(?:ion\s+date|ion\s*$|ed\s+date|date\s+of\s+graduation)", re.I), "graduation_date"),
    (re.compile(r"a[#\-]?\s*number", re.I), "a_number_date"),
]

_PAREN_NOTE = re.compile(r"\s*\(.*?\)")  # strip "(if applicable)" etc.

# Splits "Key - value" / "Key – value" / "Key — value" only when surrounded by spaces,
# so dates like "12-01-2026" and key fragments like "Bio-metrics" are not split.
_KV_DASH = re.compile(r"^([^\d][^\-–—]*?)\s+[-–—]\s+(.+)$")


def _normalize_key(raw_key: str) -> Optional[str]:
    key = _PAREN_NOTE.sub("", raw_key.strip().lower()).strip()
    for pat, field in _FIELD_PATTERNS:
        if pat.search(key):
            return field
    return None


def _split_kv(line: str) -> tuple[Optional[str], Optional[str]]:
    """Try `key: value` first; fall back to `key - value` (space-dash-space)."""
    if ":" in line:
        k, _, v = line.partition(":")
        return k.strip(), v.strip()
    m = _KV_DASH.match(line)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, None


# ── Main parser ───────────────────────────────────────────────────────────────

_DATE_FIELDS = frozenset({
    "date_applied", "rfie_date", "biometrics_requested_date",
    "date_approved", "date_card_produced", "date_card_shipped",
    "date_card_received", "employment_start_date", "graduation_date",
    "a_number_date",
})

# ── Service-center normalization ──────────────────────────────────────────────
_SC_CANONICAL = {
    "potomac": "Potomac",
    "glenmont": "Potomac",      # Potomac SC is physically in Glenmont, MD
    "irving": "Irving, TX",
    "texas": "Irving, TX",
    "nebraska": "Nebraska",
    "california": "California",
    "york": "York, SC",
    "ysc": "York, SC",
}

# Phrases that mean the poster doesn't know their service center → treat as unspecified
_SC_UNCERTAIN = re.compile(
    r"\b(?:not\s+sure|don'?t\s+know|no\s+idea|unsure|uncertain)\b", re.I
)


def _normalize_service_center(raw: str) -> Optional[str]:
    v = re.sub(r"\(.*?\)", "", raw).strip(" .,;:-")
    if not v or v.lower() in NULL_VALUES:
        return None
    # Uncertainty phrases → unspecified
    if _SC_UNCERTAIN.search(v):
        return None
    # ASC entries are biometrics appointment locations, not processing service centers
    if re.match(r"asc\b", v, re.I) or re.search(r"\basc\s*[@#]", v, re.I):
        return None
    lower = v.lower()
    for key, canonical in _SC_CANONICAL.items():
        if re.search(r"\b" + re.escape(key) + r"\b", lower):
            return canonical
    # Unrecognised center: return cleaned value truncated at noise characters
    v = re.split(r"\s{2,}|\d+\.\s", v)[0].strip(" .,;:-")
    if not v:
        return None
    # Reject obvious parse artifacts: too short, no real word, or stop-words
    # like "on" that bled in from line wrapping.
    if len(v) < 4:
        return None
    if not re.search(r"[A-Za-z]{4,}", v):
        return None
    return v


_LOC_DATE_RE = re.compile(r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}")

# Splitting on newlines OR common bullet/separators (*, •, |) when they look like field starts.
# We avoid splitting on '-' in the middle of a line to prevent breaking hyphenated words or KV pairs.
_LINE_SPLIT_RE = re.compile(r"\n|\s{3,}|(?<=\s)[•*]\s*|^\s*[*\-•|]\s*", re.MULTILINE)


def parse_comment(
    body: str,
    *,
    thread_year: Optional[int] = None,
    created_utc: Optional[datetime] = None,
) -> dict:
    """
    Parse a comment body into structured fields.
    Returns a dict of normalized field values (all optional — may be None).

    ``thread_year`` and ``created_utc`` are passed down to date parsing so
    ordinal dates without a year ("6th April") can be anchored to the OPT
    cycle the thread is about, not to wall-clock ``now()``.
    """
    result: dict = {
        "type": None,
        "normalized_type": None,
        "premium_processing": None,
        "pp_upgraded": None,
        "pp_upgrade_date": None,
        "date_applied": None,
        "employment_start_date": None,
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
        "ban_status": None,
        "service_center": None,
        "graduation_date": None,
        "a_number_date": None,
    }

    if not body:
        return result

    text = _clean(body)

    for raw_line in _LINE_SPLIT_RE.split(text):
        line = raw_line.strip()
        if not line:
            continue

        key, value = _split_kv(line)
        
        # Fallback: if no KV separator found, see if the line starts with a known field name
        # followed by text (e.g. "Citizenship India").
        if not key:
            for pat, field in _FIELD_PATTERNS:
                m = pat.match(line)
                if m:
                    key = line[:m.end()]
                    value = line[m.end():].strip()
                    break

        if not key or value is None:
            continue

        field = _normalize_key(key)
        if field is None:
            continue

        if field == "type":
            if result["type"] is None:
                raw_t, norm_t = parse_type(value)
                result["type"] = raw_t
                result["normalized_type"] = norm_t

        elif field == "premium_processing":
            if result["premium_processing"] is None:
                pp_bool, pp_upgraded, pp_date = parse_premium_processing(
                    value, thread_year=thread_year, created_utc=created_utc
                )
                result["premium_processing"] = pp_bool
                result["pp_upgraded"] = pp_upgraded
                result["pp_upgrade_date"] = pp_date

        elif field == "biometrics_completed_date":
            # May include location after the date, e.g. "3/2/2026 - ASC Boston"
            if result["biometrics_completed_date"] is None:
                result["biometrics_completed_date"] = parse_date(
                    value, thread_year=thread_year, created_utc=created_utc
                )
                m = _LOC_DATE_RE.search(value)
                if m:
                    suffix = value[m.end():].strip(" -|,")
                    if suffix and suffix.lower() not in NULL_VALUES and ":" not in suffix:
                        result["biometrics_location"] = suffix

        elif field in _DATE_FIELDS:
            if result[field] is None:
                result[field] = parse_date(
                    value, thread_year=thread_year, created_utc=created_utc
                )

        elif field == "noid":
            if result["noid"] is None:
                b = parse_bool(value)
                result["noid"] = b
                if b:
                    result["noid_date"] = parse_date(
                        value, thread_year=thread_year, created_utc=created_utc
                    )

        elif field == "country_of_citizenship":
            # Extract country and ban status. We allow setting them independently
            # across different lines if they were initially None.
            country, ban = _normalize_citizenship(value)
            if country and result["country_of_citizenship"] is None:
                result["country_of_citizenship"] = country
            if ban and result["ban_status"] is None:
                result["ban_status"] = ban

        elif field == "service_center":
            if result["service_center"] is None:
                sc = _normalize_service_center(value)
                if sc:
                    result["service_center"] = sc

    # Fallback: posters often write "Initial POST-COMPLETION OPT" or
    # "STEM OPT EXTENSION" on its own bulleted line with no "Type:" prefix.
    # If the type field never matched, infer from the body keywords.
    if result["normalized_type"] is None:
        up = text.upper()
        if re.search(r"\bSTEM\s+OPT\b", up) or "STEM EXTENSION" in up:
            result["type"] = result["type"] or "STEM OPT"
            result["normalized_type"] = "STEM"
        elif re.search(r"\b(?:POST[\s\-‑–—]*COMPLETION\s+)?OPT\b", up):
            result["type"] = result["type"] or "OPT"
            result["normalized_type"] = "OPT"

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

    # If the upgrade date equals the applied date, they applied with PP from the start — not an upgrade.
    if r.get("pp_upgrade_date") and r.get("date_applied") and r["pp_upgrade_date"] == r["date_applied"]:
        r["pp_upgraded"] = None
        r["pp_upgrade_date"] = None

    return r


def has_template_data(parsed: dict) -> bool:
    """Return True if the parsed result has at least one usable timeline date."""
    key_fields = ("date_applied", "date_approved", "biometrics_completed_date")
    return any(parsed.get(f) for f in key_fields)
