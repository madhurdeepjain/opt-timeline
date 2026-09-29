"""Parse OPT timeline template fields from Reddit comment bodies."""

import re
from datetime import date, datetime, timedelta
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
# Posters write dates every way imaginable: 05/19/2026, 5/19, 2026-05-19,
# 2026/05/19, May 19th, 2026, 19 May, 19th of May 2026, Mar. 4, 20/Mar, May 2026.
# Each pattern below yields candidate (year, month, day) readings in order of
# preference; parse_date takes the earliest match in the text and the first
# candidate that is a real date and fits the "must already have happened" bound.

_MON = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
_MONTH_NUM = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_ORD = r"(?:st|nd|rd|th)?"
_YEAR = r"(20\d\d)"

_P_YMD = re.compile(r"\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b")
_P_NUMERIC = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b")
_P_MON_DAY = re.compile(rf"\b{_MON}\s*(\d{{1,2}}){_ORD}(?!\d)(?:\s*,?\s*{_YEAR}\b)?", re.I)
_P_DAY_MON = re.compile(rf"\b(\d{{1,2}}){_ORD}\s*(?:of\s+)?{_MON}(?![a-z])(?:\s*,?\s*{_YEAR}\b)?", re.I)
_P_DAY_SLASH_MON = re.compile(rf"\b(\d{{1,2}})[/-]{_MON}(?![a-z])", re.I)
_P_NUMERIC_NO_YEAR = re.compile(r"\b(\d{1,2})/(\d{1,2})\b(?!/)")
_P_MON_YEAR = re.compile(rf"\b{_MON}\s+{_YEAR}\b", re.I)

# Normalise malformed slashes ("05 / 15 / 2025", "03//04/2026") before matching
_SLASH_NORMALIZE = re.compile(r"\s*/+\s*")

# An explicit year this far past the comment's date is last year's date with the
# current year typed ("24th Dec 2026" written in Feb 2026). Closer than this it's
# a scheduled or mistyped future event, which can't have been reported as done.
_YEAR_TYPO_MIN_DAYS = 90


def _mdy(month: int, day: int, year: int) -> Optional[date]:
    try:
        d = date(year, month, day)
    except ValueError:
        return None
    return d if 2020 <= d.year <= 2035 else None


def _candidates(m: re.Match, kind: str) -> list[tuple[int, int, Optional[int]]]:
    """(month, day, year-or-None) readings for a match, most likely first."""
    g = m.groups()
    if kind == "ymd":
        return [(int(g[1]), int(g[2]), int(g[0]))]
    if kind == "numeric":
        a, b, y = int(g[0]), int(g[1]), int(g[2])
        y = y + 2000 if y < 100 else y
        # MM/DD first (the template's format); DD/MM when MM/DD is impossible or
        # when both readings are valid months (resolved by the past-date bound).
        return [(a, b, y), (b, a, y)]
    if kind == "mon_day":
        return [(_MONTH_NUM[g[0][:3].lower()], int(g[1]), int(g[2]) if g[2] else None)]
    if kind == "day_mon":
        return [(_MONTH_NUM[g[1][:3].lower()], int(g[0]), int(g[2]) if g[2] else None)]
    if kind == "day_slash_mon":
        return [(_MONTH_NUM[g[1][:3].lower()], int(g[0]), None)]
    if kind == "numeric_no_year":
        a, b = int(g[0]), int(g[1])
        return [(a, b, None), (b, a, None)]
    if kind == "mon_year":
        return [(_MONTH_NUM[g[0][:3].lower()], 1, int(g[1]))]
    return []


_PATTERNS = [
    (_P_YMD, "ymd"),
    (_P_NUMERIC, "numeric"),
    (_P_MON_DAY, "mon_day"),
    (_P_DAY_MON, "day_mon"),
    (_P_DAY_SLASH_MON, "day_slash_mon"),
    (_P_NUMERIC_NO_YEAR, "numeric_no_year"),
]


def parse_date(value: str, *, as_of: Optional[datetime] = None, past: bool = True) -> Optional[str]:
    """Return ISO YYYY-MM-DD or None. Accepts values like 'YES | 02/14/2026'.

    ``as_of`` is the last moment the text could describe: the comment's latest
    edit, or its creation time if never edited. ``past`` marks events that must
    already have happened by then (everything except start/graduation dates):

    - a date without a year is the most recent such day on or before ``as_of``;
    - MM/DD is preferred, DD/MM used when MM/DD is impossible or in the future;
    - an explicit year far in the future is read as the year before (a typo);
    - a date that still lands in the future is rejected.

    Thread years aren't used: megathreads run across New Year, and an approval
    added in a January edit belongs to that January, not the previous one.
    """
    if not value:
        return None
    v = value.strip()
    if v.lower() in NULL_VALUES:
        return None
    v = _SLASH_NORMALIZE.sub("/", v)

    ref = (as_of or datetime.now()).date()
    # +1 day: the poster's local date can be ahead of UTC (up to UTC+14).
    ceiling = ref + timedelta(days=1)

    # The earliest date expression is the field's value ("05/19 (email); 05/21
    # (portal)" → 05/19). Later ones are usually notes about other events
    # ("02/18/2006 (PP on 5/11)"), so a garbled first date isn't replaced by them.
    first = min(
        ((m.start(), i, m, kind) for i, (pat, kind) in enumerate(_PATTERNS) if (m := pat.search(v))),
        default=None,
    )
    if first:
        _, _, m, kind = first
    else:
        m, kind = _P_MON_YEAR.search(v), "mon_year"  # "May 2026" → 1st of month
        if not m:
            return None
    d = _resolve(_candidates(m, kind), ref, ceiling, past)
    return d.isoformat() if d else None


def _resolve(readings: list[tuple[int, int, Optional[int]]], ref: date, ceiling: date, past: bool) -> Optional[date]:
    for month, day, year in readings:
        if year is None:
            # Yearless: nearest past occurrence (or, for future-allowed fields,
            # the occurrence closest to when it was written).
            years = (ref.year, ref.year - 1) if past else (ref.year + 1, ref.year, ref.year - 1)
            opts = [d for y in years if (d := _mdy(month, day, y))]
            if past:
                opts = [d for d in opts if d <= ceiling]
                if opts:
                    return max(opts)
            elif opts:
                return min(opts, key=lambda d: abs((d - ref).days))
            continue
        d = _mdy(month, day, year)
        if d and (not past or d <= ceiling):
            return d
    if past:
        # Explicit year but every reading is in the future: last year's date typed
        # with this year, if it's far enough ahead to not be a scheduled event.
        for month, day, year in readings:
            if year is None:
                continue
            d = _mdy(month, day, year)
            if d and (d - ceiling).days >= _YEAR_TYPO_MIN_DAYS and (prev := _mdy(month, day, year - 1)) and prev <= ceiling:
                return prev
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
    as_of: Optional[datetime] = None,
) -> Optional[str]:
    """Return the upgrade date from a PP value string.

    Priority: date in parentheses > date after upgrade keyword > bare date
    (the last is skipped if adjacent template field names are present, to
    avoid picking up dates from multiline bleeds).
    """
    for content in _PP_PAREN.findall(v):
        d = parse_date(content, as_of=as_of)
        if d:
            return d
    m = _PP_UPGRADE_RE.search(v)
    if m:
        d = parse_date(v[m.start():], as_of=as_of)
        if d:
            return d
    if not _PP_OTHER_FIELDS.search(v):
        return parse_date(v, as_of=as_of)
    return None


def parse_premium_processing(
    value: str,
    *,
    as_of: Optional[datetime] = None,
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
        return True, True, _pp_upgrade_date(v, as_of=as_of)

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
            return True, True, _pp_upgrade_date(v, as_of=as_of)
        # Date-only: nothing meaningful left after stripping slash-dates
        date_stripped = re.sub(r"\b\d{1,2}[/\-]\d{1,2}[/\-](?:\d{2}|\d{4})\b", "", bool_str).strip()
        d = parse_date(v, as_of=as_of)
        if d and not date_stripped:
            return True, None, d
        # Explicit negative phrasing
        if bool_str.lower().startswith(("no", "not", "nope")):
            return False, None, None
        return None, None, None

    if pp_bool is True:
        d = _pp_upgrade_date(v, as_of=as_of)
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
        return True, True, _pp_upgrade_date(v, as_of=as_of)
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
    (re.compile(r"r?equest\s+for\s+initial\s+evidence", re.I), "rfie_date"),
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
    # Bare "Applied:", "Filed:", and the common "Data Applied" typo
    (re.compile(r"^(?:\d+[.)]\s*)?(?:data\s+)?(?:applied|filed|filing\s+date)\b", re.I), "date_applied"),
    (re.compile(r"date\s+approved", re.I), "date_approved"),
    (re.compile(r"approved\s+date", re.I), "date_approved"),
    (re.compile(r"approval\s+date", re.I), "date_approved"),
    # Bare "Approved:", "Approved (email):", "Approval mail date:"
    (re.compile(r"^(?:\d+[.)]\s*)?approv(?:ed|al)\b", re.I), "date_approved"),
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

# Templates sometimes arrive flattened onto one line ("Type: OPT Premium
# Processing: NO Date Applied: 03/13/2026 ..."): break before each known label.
_TEMPLATE_LABELS = (
    r"application\s+type|type|premium\s+processing|date\s+applied|applied\s+date|receipt\s+date"
    r"|request\s+for\s+initial\s+evidence|biometrics\s+requested|biometrics\s+completed"
    r"|notice\s+of\s+intent\s+to\s+deny|date\s+approved|approved\s+date|approval\s+date"
    r"|date\s+card\s+produced|card\s+produced\s+date|date\s+card\s+shipped|date\s+card\s+received"
    r"|country\s+of\s+citizenship|service\s+cent(?:er|re)"
)
_MULTI_KEY_SPLIT = re.compile(
    rf"(?<=\S)[ \t\u00a0]+(?=(?:{_TEMPLATE_LABELS})\s*(?:\([^)]*\))?\s*:)", re.I
)
# A line without "key: value" only counts as a date field if a date follows the
# label ("Approved on 09/18/2026"), not prose ("approval without PP? I applied…").
_STARTS_WITH_DATE = re.compile(
    rf"^(?:on\s+|date\s*|yes\b\s*|\([^)]*\)\s*|[-–:|*]\s*)*(?:\d|{_MON}(?![a-z]))", re.I
)
_DENIED = re.compile(r"\bden(?:ied|ial)\b|\breject", re.I)
# Events that may legitimately be in the future when written.
_FUTURE_OK_FIELDS = frozenset({"employment_start_date", "graduation_date"})


def _line_key(line: str) -> tuple[Optional[str], Optional[str], bool]:
    """(key, value, via_fallback) for a line, or (None, None, False)."""
    key, value = _split_kv(line)
    if key:
        return key, value, False
    # No separator: the line may start with a field name ("Citizenship India").
    for pat, _ in _FIELD_PATTERNS:
        m = pat.match(line)
        if m:
            return line[: m.end()], line[m.end():].strip(), True
    return None, None, False


def parse_comment(
    body: str,
    *,
    as_of: Optional[datetime] = None,
) -> dict:
    """
    Parse a comment body into structured fields.
    Returns a dict of normalized field values (all optional — may be None).

    ``as_of`` (the comment's last edit or creation time) is passed down to
    date parsing so dates without a year resolve to the right one.
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

    text = _MULTI_KEY_SPLIT.sub("\n", _clean(body))
    lines = [ln.strip() for ln in _LINE_SPLIT_RE.split(text)]
    lines = [ln for ln in lines if ln]

    i = 0
    while i < len(lines):
        key, value, via_fallback = _line_key(lines[i])
        i += 1
        if not key or value is None:
            continue

        field = _normalize_key(key)
        if field is None:
            continue
        is_date_field = field in _DATE_FIELDS or field == "biometrics_completed_date"
        if via_fallback and is_date_field and not _STARTS_WITH_DATE.match(value):
            continue

        # Reddit's rich-text editor often puts the value in the next paragraph:
        # "**Date Approved:**" then "06/11/2026".
        if not value.strip(" *\u00a0") and i < len(lines):
            next_key, _, _ = _line_key(lines[i])
            if not (next_key and _normalize_key(next_key)):
                value = lines[i]
                i += 1

        if field == "type":
            if result["type"] is None:
                raw_t, norm_t = parse_type(value)
                result["type"] = raw_t
                result["normalized_type"] = norm_t

        elif field == "premium_processing":
            if result["premium_processing"] is None:
                pp_bool, pp_upgraded, pp_date = parse_premium_processing(
                    value, as_of=as_of
                )
                result["premium_processing"] = pp_bool
                result["pp_upgraded"] = pp_upgraded
                result["pp_upgrade_date"] = pp_date

        elif field == "biometrics_completed_date":
            # May include location after the date, e.g. "3/2/2026 - ASC Boston"
            if result["biometrics_completed_date"] is None:
                result["biometrics_completed_date"] = parse_date(
                    value, as_of=as_of
                )
                m = _LOC_DATE_RE.search(value)
                if m:
                    suffix = value[m.end():].strip(" -|,")
                    if suffix and suffix.lower() not in NULL_VALUES and ":" not in suffix:
                        result["biometrics_location"] = suffix

        elif field in _DATE_FIELDS:
            if field == "date_approved" and _DENIED.search(value):
                continue  # "Date Approved: DENIED on May 13th" is not an approval
            if result[field] is None:
                result[field] = parse_date(
                    value, as_of=as_of, past=field not in _FUTURE_OK_FIELDS
                )

        elif field == "noid":
            if result["noid"] is None:
                b = parse_bool(value)
                result["noid"] = b
                if b:
                    result["noid_date"] = parse_date(
                        value, as_of=as_of
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


# Events that follow the application: a date before date_applied is a typo.
_AFTER_APPLIED_FIELDS = (
    "rfie_date",
    "biometrics_requested_date",
    "biometrics_completed_date",
    "date_approved",
    "date_card_produced",
    "date_card_shipped",
    "date_card_received",
)
# Events that must already have happened when the comment was last written.
_PAST_EVENT_FIELDS = _AFTER_APPLIED_FIELDS + ("pp_upgrade_date",)


def validate_dates(record: dict, as_of: Optional[datetime]) -> Optional[dict]:
    """Null out impossible dates, recompute derived fields.

    ``as_of`` is the comment's last edit (or creation) time; an event dated
    after it can't have been reported in it, so it's a misparse or a typo.
    Returns None when date_applied itself is impossible.
    """
    r = dict(record)
    # +1 day: the poster's local date can be ahead of UTC (up to UTC+14).
    ceiling = ((as_of or datetime.now()) + timedelta(days=1)).date().isoformat()
    applied = r.get("date_applied")
    if applied and applied > ceiling:
        return None
    for f in _PAST_EVENT_FIELDS:
        v = r.get(f)
        if not v:
            continue
        if applied and f in _AFTER_APPLIED_FIELDS and v < applied:
            # Must fall between applying and writing. If a year off fits both,
            # the year was mistyped ("approved 10th Jan 2025" for Jan 2026).
            shifted = f"{int(v[:4]) + 1}{v[4:]}"
            v = shifted if applied <= shifted <= ceiling else None
        if v and v > ceiling:
            v = None
        r[f] = v
    return compute_derived(r)


def has_template_data(parsed: dict) -> bool:
    """Return True if the parsed result has at least one usable timeline date."""
    key_fields = ("date_applied", "date_approved", "biometrics_completed_date")
    return any(parsed.get(f) for f in key_fields)
