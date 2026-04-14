"""Read/write the timeline CSV."""

import csv
import json
from pathlib import Path

from .config import CSV_FIELDS


def load_existing(path: Path) -> dict[str, dict]:
    """Load CSV into dict keyed by comment_id. Returns {} if file absent."""
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {row["comment_id"]: row for row in csv.DictReader(f)}


def merge(existing: dict[str, dict], fresh: list[dict]) -> list[dict]:
    """Overlay fresh records on top of existing; fresh always wins."""
    merged = dict(existing)
    for rec in fresh:
        cid = rec.get("comment_id")
        if cid:
            merged[cid] = rec
    return list(merged.values())


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
            # Serialize list fields to JSON strings
            if isinstance(row.get("parse_errors"), list):
                row["parse_errors"] = json.dumps(row["parse_errors"])
            # Normalise booleans to lowercase strings for readability
            for k in ("premium_processing", "noid"):
                if isinstance(row.get(k), bool):
                    row[k] = str(row[k]).lower()
            writer.writerow(row)
