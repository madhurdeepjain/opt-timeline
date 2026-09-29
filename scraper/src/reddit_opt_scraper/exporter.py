"""Read/write the timeline CSV."""

import csv
import hashlib
import hmac
import os
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from .config import CSV_FIELDS
from .parser import (
    _normalize_citizenship,
    _normalize_service_center,
    compute_derived,
    has_template_data,
    parse_comment,
    validate_dates,
)


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
    # Rows stored before last_seen_utc existed have no known edit time, so the
    # only safe bound is now (their creation time would drop edited-in dates).
    as_of = _parse_iso_dt(r.get("last_seen_utc"))

    # Re-parse from raw_text to pick up fields missed by older parser versions.
    raw = r.get("raw_text") or ""
    if raw:
        parsed = parse_comment(raw, as_of=as_of)
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
    r = validate_dates(r, as_of)
    if r is None:
        return None
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
    """Fresh always wins: new records are inserted, existing records are overwritten.

    Reddit returns current comment bodies (including edits), so the fresh value
    is always authoritative. Existing records not seen in this run are kept.
    """
    merged = dict(existing)
    for rec in fresh:
        cid = rec.get("comment_id")
        if cid:
            merged[cid] = rec
    return list(merged.values())


# Two posts by one author describe the same application unless they contradict:
# dates this far apart are different events, not a receipt-vs-filing gap or typo.
_SAME_DATE_TOLERANCE_DAYS = 7
# An application doesn't stay open this long; posts further apart are separate.
_MAX_SPAN_DAYS = 300


def _days_apart(a: str, b: str) -> int:
    return abs((date.fromisoformat(a[:10]) - date.fromisoformat(b[:10])).days)


def _touched(r: dict) -> str:
    return r.get("last_seen_utc") or r.get("created_utc") or ""


def _compatible(app: dict, r: dict) -> bool:
    if app.get("normalized_type") and r.get("normalized_type") and app["normalized_type"] != r["normalized_type"]:
        return False
    for f in ("date_applied", "date_approved"):
        if app.get(f) and r.get(f) and _days_apart(app[f], r[f]) > _SAME_DATE_TOLERANCE_DAYS:
            return False
    return _days_apart(_touched(app), r.get("created_utc") or _touched(app)) <= _MAX_SPAN_DAYS


def merge_by_author(records: list[dict], gone: frozenset[str] = frozenset()) -> list[dict]:
    """Collapse each author's posts about the same application into one record.

    People post status updates as new comments ("approved today!") and repost
    across threads, so one application can span several comments, some without
    an applied date. Each post joins the author's most recently touched
    application it doesn't contradict (see _compatible); otherwise it starts a
    new one. Within an application the most recently touched post wins on each
    field and fills gaps from the others. The merged record takes its
    comment_id, permalink and text from the latest post that still exists, and
    the latest last_seen_utc.

    ``gone`` holds comment ids confirmed deleted or removed on Reddit. An
    application whose posts are all gone is kept, de-linked (see anonymize).
    """
    by_author: dict[str, list[dict]] = defaultdict(list)
    result: list[dict] = []
    for r in records:
        # "[deleted]" is many different people, never one author.
        if r.get("author") and r["author"] != "[deleted]":
            by_author[r["author"]].append(r)
        else:
            result.append(r)

    for posts in by_author.values():
        apps: list[list[dict]] = []  # each: posts oldest → newest
        views: list[dict] = []       # merged view of each app, for compatibility checks
        for r in sorted(posts, key=lambda x: x.get("created_utc") or ""):
            candidates = [i for i, v in enumerate(views) if _compatible(v, r)]
            if candidates:
                i = max(candidates, key=lambda j: _touched(views[j]))
                apps[i].append(r)
                views[i] = _combine(apps[i], gone)
            else:
                apps.append([r])
                views.append(dict(r))
        for app, view in zip(apps, views):
            if len(app) > 1:
                as_of = datetime.fromisoformat(view["last_seen_utc"]) if view.get("last_seen_utc") else None
                view = validate_dates(view, as_of)
                if view is None:
                    continue
            result.append(anonymize(view) if all(p["comment_id"] in gone for p in app) else view)
    return result


_LINK_FIELDS = ("comment_id", "permalink", "raw_text", "created_utc", "subreddit")


def _combine(posts: list[dict], gone: frozenset[str]) -> dict:
    ordered = sorted(posts, key=_touched)
    merged = dict(ordered[-1])
    for earlier in reversed(ordered[:-1]):
        for k, v in earlier.items():
            if merged.get(k) in (None, "") and v not in (None, ""):
                merged[k] = v
    # Point the record at a post that still exists, so its live posts keep
    # joining this record instead of reappearing as a separate one.
    live = [p for p in ordered if p["comment_id"] not in gone]
    if live and merged["comment_id"] in gone:
        merged.update({k: live[-1].get(k) for k in _LINK_FIELDS})
    seen = [p["last_seen_utc"] for p in posts if p.get("last_seen_utc")]
    merged["last_seen_utc"] = max(seen) if seen else None
    return compute_derived(merged)


def anonymize(record: dict) -> dict:
    """Strip everything that points back to a deleted comment or its author.

    Keeps the timeline fields for the statistics; drops the username, the comment
    link (the thread link stays, for the thread filter) and text, free-text
    fields, and timestamps finer than a day. The new id is an HMAC of the Reddit
    id keyed with the Supabase secret key: a plain hash could be reversed
    (comment ids are sequential), and a stable id keeps a rerun after a failed
    save from creating a duplicate. Already-anonymized records pass through.
    """
    if record["comment_id"].startswith(ANON_PREFIX):
        return record
    r = dict(record)
    thread = _THREAD_URL.match(r.get("permalink") or "")
    r.update({
        "comment_id": ANON_PREFIX + _anon_id(r["comment_id"]),
        "author": None,
        "permalink": thread.group(0) if thread else None,
        "raw_text": "",
        "type": None,
        "biometrics_location": None,
        "created_utc": _day(r.get("created_utc")),
        "last_seen_utc": _day(r.get("last_seen_utc")),
    })
    return r


ANON_PREFIX = "anon-"
_THREAD_URL = re.compile(r"^https?://[^/]+/r/[^/]+/comments/[a-z0-9]+/")


def _anon_id(comment_id: str) -> str:
    key = os.environ.get("SUPABASE_SECRET_KEY", "").encode() or _RUN_KEY
    return hmac.new(key, comment_id.encode(), hashlib.sha256).hexdigest()[:16]


_RUN_KEY = os.urandom(32)  # CSV mode without Supabase: random, but stable within a run


def _day(ts: str | None) -> str | None:
    return f"{ts[:10]}T00:00:00+00:00" if ts else None


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
