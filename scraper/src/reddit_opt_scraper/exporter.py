"""Read/write the timeline CSV."""

import csv
from collections import defaultdict
from datetime import date
from pathlib import Path

from .config import CSV_FIELDS
from .parser import compute_derived, has_template_data, parse_comment

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
    # Re-parse from raw_text if it still carries newlines (post-fix records).
    # Old records were stored as a single line — re-parsing won't recover keys
    # but the existing parsed columns are kept intact.
    raw = r.get("raw_text") or ""
    if raw and "\n" in raw:
        parsed = parse_comment(raw)
        for k, v in parsed.items():
            # Only fill if currently empty — never overwrite existing value
            # (the original parse may have caught something the re-parse misses).
            if not r.get(k) and v:
                r[k] = v
    # Coerce booleans back from the CSV strings
    for k in ("premium_processing", "noid"):
        r[k] = _coerce_bool(r.get(k))
    # Drop future-dated date_applied
    da = r.get("date_applied") or None
    if da and da > date.today().isoformat():
        return None
    # Null out impossibly-early downstream dates
    if da:
        for f in _AFTER_APPLIED_FIELDS:
            if r.get(f) and r[f] < da:
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
            for k in ("premium_processing", "noid"):
                if isinstance(row.get(k), bool):
                    row[k] = str(row[k]).lower()
            writer.writerow(row)
