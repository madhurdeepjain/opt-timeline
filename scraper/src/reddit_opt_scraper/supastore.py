"""Supabase storage backend for the timeline.

Mirrors exporter.py's CSV functions (``load_existing`` / ``save``) but against a
Supabase Postgres table via PostgREST. Writes use the *secret* key (read from
the env), which bypasses RLS; it must never be exposed to the browser.

Stale-row handling: every upserted row carries ``updated_at = run_start``. After
upserting the final deduped set we delete any row whose ``updated_at`` is older
than ``run_start`` — i.e. rows that existed before but weren't re-emitted this
run (collapsed by dedupe). This reproduces the CSV backend's whole-file rewrite.
"""

import os
from datetime import datetime, timezone

import httpx

from .config import CSV_FIELDS
from .exporter import _rehabilitate

TABLE = "timeline"
META_TABLE = "meta"
_PAGE = 1000          # PostgREST default max rows per response
_UPSERT_BATCH = 500


def supabase_config() -> tuple[str | None, str | None]:
    """Return (url, secret_key) from the environment, or (None, None)."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    return (url or None), (key or None)


def _headers(key: str, *, write: bool = False) -> dict:
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if write:
        # Upsert on conflict + don't send rows back.
        h["Prefer"] = "resolution=merge-duplicates,return=minimal"
    return h


def _to_db_row(record: dict, updated_at: str) -> dict:
    """Project a pipeline record onto the table columns.

    Empty strings become NULL so typed (date/int/bool) columns accept them.
    Booleans pass through as real booleans.
    """
    row = {}
    for k in CSV_FIELDS:
        v = record.get(k)
        row[k] = None if v == "" else v
    row["updated_at"] = updated_at
    return row


def load_existing(url: str, key: str) -> dict[str, dict]:
    """Load all rows, re-validated through the current parser/null-out rules.

    Keyed by comment_id, matching exporter.load_existing's contract.
    """
    out: dict[str, dict] = {}
    offset = 0
    with httpx.Client(timeout=60.0) as client:
        while True:
            resp = client.get(
                f"{url}/rest/v1/{TABLE}",
                headers={**_headers(key), "Range": f"{offset}-{offset + _PAGE - 1}"},
                params={"select": "*"},
            )
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                break
            for row in rows:
                cid = row.get("comment_id")
                if not cid:
                    continue
                cleaned = _rehabilitate(row)
                if cleaned is not None:
                    out[cid] = cleaned
            if len(rows) < _PAGE:
                break
            offset += _PAGE
    return out


def save(records: list[dict], url: str, key: str) -> None:
    """Upsert the final record set and delete rows not seen this run."""
    run_start = datetime.now(tz=timezone.utc).isoformat()
    rows = [_to_db_row(r, run_start) for r in records if r.get("comment_id")]

    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(rows), _UPSERT_BATCH):
            batch = rows[i : i + _UPSERT_BATCH]
            resp = client.post(
                f"{url}/rest/v1/{TABLE}",
                headers=_headers(key, write=True),
                params={"on_conflict": "comment_id"},
                json=batch,
            )
            resp.raise_for_status()

        # Delete stale rows: anything not re-stamped with this run's timestamp.
        resp = client.delete(
            f"{url}/rest/v1/{TABLE}",
            headers=_headers(key),
            params={"updated_at": f"lt.{run_start}"},
        )
        resp.raise_for_status()

    save_meta(url, key, run_start)


def save_meta(url: str, key: str, scraped_at: str) -> None:
    """Upsert the single meta row with the scrape timestamp."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{url}/rest/v1/{META_TABLE}",
            headers=_headers(key, write=True),
            params={"on_conflict": "id"},
            json=[{"id": 1, "scraped_at": scraped_at}],
        )
        resp.raise_for_status()
