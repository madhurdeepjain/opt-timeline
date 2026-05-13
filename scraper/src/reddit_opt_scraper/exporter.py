"""Read/write the timeline CSV."""

import csv
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from .config import CSV_FIELDS, THREAD_YEAR_BY_POST_ID
from .parser import (
    _normalize_citizenship,
    _normalize_service_center,
    compute_derived,
    has_template_data,
    parse_comment,
)

# Fields that must be >= date_applied or are nulled out as typos.
_AFTER_APPLIED_FIELDS = (
    "rfie_date",
    "biometrics_requested_date",
    "biometrics_completed_date",
    "date_approved",
    "date_card_produced",
    "date_card_shipped",
    "date_card_received",
)

# Date fields that must not be in the future.
_FUTURE_NULLABLE_FIELDS = (
    "date_approved",
    "date_card_produced",
    "date_card_shipped",
    "date_card_received",
    "rfie_date",
    "biometrics_requested_date",
    "biometrics_completed_date",
    "pp_upgrade_date",
)

_POST_ID_RE = re.compile(r"/comments/([a-z0-9]+)/", re.I)


def _thread_year_from_permalink(permalink: str | None) -> int | None:
    if not permalink:
        return None
    m = _POST_ID_RE.search(permalink)
    if not m:
        return None
    return THREAD_YEAR_BY_POST_ID.get(m.group(1))


def _parse_iso_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _coerce_bool(v):
    if isinstance(v, bool) or v is None:
        return v
    s = str(v).strip().lower()
    if s == "true":
        return True
    if s == "false":
        return False
    return None


def _rehabilitate(row: dict) -> dict | None:
    """Re-apply current parser/null-out logic to a row loaded from CSV.

    Returns None if the row should be dropped (future-dated, no usable data).
    """
    r = dict(row)
    thread_year = _thread_year_from_permalink(r.get("permalink"))
    created_dt = _parse_iso_dt(r.get("created_utc"))

    # Re-parse from raw_text to pick up fields missed by older parser versions.
    raw = r.get("raw_text") or ""
    if raw:
        parsed = parse_comment(raw, thread_year=thread_year, created_utc=created_dt)
        for k, v in parsed.items():
            # Only fill if currently empty — never overwrite existing value
            # (the original parse may have caught something the re-parse misses).
            if not r.get(k) and v:
                r[k] = v
    # Coerce booleans back from the CSV strings
    for k in ("premium_processing", "noid", "pp_upgraded"):
        r[k] = _coerce_bool(r.get(k))
    # Re-normalize citizenship (cleans casing, demonyms, ban-list phrases).
    # Always re-derive ban_status from the (possibly updated) country list.
    citz = r.get("country_of_citizenship")
    if citz:
        country, ban = _normalize_citizenship(citz)
        r["country_of_citizenship"] = country
        if ban:
            r["ban_status"] = ban
    # Re-normalize service center (canonicalizes legacy lowercase / abbreviated
    # values and rejects parse artifacts like "on").
    sc = r.get("service_center")
    if sc:
        r["service_center"] = _normalize_service_center(sc)
    today_iso = date.today().isoformat()
    # Drop future-dated date_applied
    da = r.get("date_applied") or None
    if da and da > today_iso:
        return None
    # Null out impossibly-early downstream dates
    if da:
        for f in _AFTER_APPLIED_FIELDS:
            if r.get(f) and r[f] < da:
                r[f] = None
    # Null out future-dated downstream fields — events that can't have happened yet.
    for f in _FUTURE_NULLABLE_FIELDS:
        v = r.get(f)
        if v and v > today_iso:
            r[f] = None
    # Recompute derived fields
    r = compute_derived(r)
    if not has_template_data(r):
        return None
    return r


def load_existing(path: Path) -> dict[str, dict]:
    """Load CSV into dict keyed by comment_id. Returns {} if file absent.

    Re-validates each row against the current parser/null-out rules so stale
    rows that pre-date later fixes get cleaned on next save.
    """
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cid = row.get("comment_id")
            if not cid:
                continue
            cleaned = _rehabilitate(row)
            if cleaned is not None:
                out[cid] = cleaned
    return out


def merge(existing: dict[str, dict], fresh: list[dict]) -> list[dict]:
    """Overlay fresh records on top of existing; fresh always wins."""
    merged = dict(existing)
    for rec in fresh:
        cid = rec.get("comment_id")
        if cid:
            merged[cid] = rec
    return list(merged.values())


def dedupe_by_author_date(records: list[dict]) -> list[dict]:
    """Collapse multiple comments by the same author for the same date_applied.

    Keeps the record with the latest created_utc and unions in any non-null
    fields from earlier versions (latest wins on conflict). Records missing
    author or date_applied are kept as-is.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    standalone: list[dict] = []
    for r in records:
        author = r.get("author")
        applied = r.get("date_applied")
        if author and applied:
            groups[(author, applied)].append(r)
        else:
            standalone.append(r)

    result: list[dict] = list(standalone)
    for group in groups.values():
        if len(group) == 1:
            result.append(group[0])
            continue
        # Sort oldest → newest by created_utc (ISO strings sort lexicographically)
        group.sort(key=lambda x: x.get("created_utc") or "")
        merged = dict(group[-1])
        for earlier in group[:-1]:
            for k, v in earlier.items():
                if not merged.get(k) and v:
                    merged[k] = v
        merged = compute_derived(merged)
        result.append(merged)
    return result


def save(records: list[dict], path: Path) -> None:
    """Write records to CSV, newest date_applied first."""
    path.parent.mkdir(parents=True, exist_ok=True)

    def _sort_key(r: dict):
        return (r.get("date_applied") or "0000-00-00", r.get("created_utc") or "")

    rows = sorted(records, key=_sort_key, reverse=True)

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            row = dict(r)
            for k in ("premium_processing", "noid", "pp_upgraded"):
                if isinstance(row.get(k), bool):
                    row[k] = str(row[k]).lower()
            writer.writerow(row)
