"""Fetch comments from the Arctic Shift archive (no Reddit auth needed).

Reddit's public ``.json`` endpoints now return 403 for unauthenticated /
non-browser traffic, so we source comments from Arctic Shift
(https://arctic-shift.photon-reddit.com), a near-real-time Pushshift-style
mirror. It serves the same comment schema (``id``, ``author``, ``body``,
``created_utc``), so the parser/exporter are unchanged.

Caveat that shapes the merge policy: Arctic Shift snapshots each comment ~once
at post-time and does **not** re-ingest later edits. So it returns the original
"Pending" body even for comments the author later edited to add an approval.
That is why the scraper treats Arctic data as *add-only* (see exporter.merge).

We query each thread with ``link_id`` + an empty ``parent_id`` (top-level
comments only — every OPT template comment is top-level), paginated forward by
the ``created_utc`` cursor. The ``link_id`` lookup is heavy server-side and
rides Arctic Shift's hard ~10 s timeout, which surfaces as an HTTP 422 with an
``{"error": "Timeout…"}`` body; we retry those with backoff.
"""

import time
from typing import Iterator

import httpx

from .config import USER_AGENT, REQUEST_DELAY, ARCTIC_SHIFT_SEARCH_URL

_MAX_RETRIES = 6
_RETRY_BASE = 5  # seconds for first backoff
_PAGE_SIZE = 100  # Arctic Shift caps comments/search at 100 per request

_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
}

# Only the fields the parser/exporter actually consume. Keeping the payload
# small lightens the server-side query that sits right on the timeout cliff.
_FIELDS = "id,author,created_utc,body"


def _get(client: httpx.Client, params: dict) -> dict:
    """GET comments/search, retrying Arctic Shift's timeout + rate-limit errors.

    Arctic Shift signals an over-budget query with HTTP 422 and a JSON body of
    ``{"data": null, "error": "Timeout. Maybe slow down a bit"}`` — so a 422 here
    is transient, not a client bug. A real rate-limit is HTTP 429. Validation
    errors (a genuinely bad param) are permanent and raise immediately.
    """
    for attempt in range(_MAX_RETRIES):
        resp = client.get(
            ARCTIC_SHIFT_SEARCH_URL,
            params=params,
            headers=_HEADERS,
            follow_redirects=True,
            timeout=60.0,
        )

        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", _RETRY_BASE * (2 ** attempt)))
            print(f"  [rate-limit] 429 — sleeping {wait}s (attempt {attempt + 1}/{_MAX_RETRIES})", flush=True)
            time.sleep(wait)
            continue

        try:
            payload = resp.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict) and payload.get("error"):
            err = str(payload["error"])
            if "timeout" not in err.lower() and "slow down" not in err.lower():
                raise RuntimeError(f"Arctic Shift rejected query: {err} — {params}")
            wait = _RETRY_BASE * (2 ** attempt)
            print(
                f"  [arctic-shift] {err!r} — retrying in {wait}s "
                f"(attempt {attempt + 1}/{_MAX_RETRIES})",
                flush=True,
            )
            time.sleep(wait)
            continue

        resp.raise_for_status()
        if payload is None:
            payload = resp.json()
        _maybe_throttle(resp)
        return payload

    raise RuntimeError(f"Gave up after {_MAX_RETRIES} retries: {params}")


def _maybe_throttle(resp: httpx.Response) -> None:
    """Sleep if Arctic Shift's rate-limit headers say we're running low."""
    try:
        remaining = float(resp.headers.get("X-RateLimit-Remaining", 100))
        reset_secs = float(resp.headers.get("X-RateLimit-Reset", 0))
        if remaining < 3 and reset_secs > 0:
            wait = min(reset_secs, 60)
            print(f"  [rate-limit] {remaining:.0f} left in window — sleeping {wait:.0f}s", flush=True)
            time.sleep(wait)
    except (ValueError, TypeError):
        pass


def fetch_all_comments(thread: dict, client: httpx.Client) -> Iterator[dict]:
    """Yield every top-level comment data dict from a thread via Arctic Shift.

    Pages forward through ``created_utc`` using ``sort=asc`` and the ``after``
    cursor. Arctic Shift omits ``permalink``, so we synthesize one in the shape
    the rest of the pipeline expects (``/r/{sub}/comments/{post}/_/{id}/``).
    """
    post_id = thread["post_id"]
    subreddit = thread["subreddit"]
    link_id = f"t3_{post_id}"
    after: int | None = None  # omit on the first page; Arctic Shift rejects 0
    seen: set[str] = set()
    total = 0

    while True:
        params = {
            "link_id": link_id,
            "parent_id": "",  # empty ⇒ top-level comments only
            "limit": _PAGE_SIZE,
            "sort": "asc",
            "fields": _FIELDS,
        }
        if after is not None:
            params["after"] = after
        data = _get(client, params)
        rows = data.get("data") or []
        if not rows:
            break

        page_new = 0
        last_ts: int | None = None
        for c in rows:
            cid = c.get("id")
            if not cid:
                continue
            last_ts = int(c["created_utc"])
            if cid in seen:
                continue
            seen.add(cid)
            c["created_utc"] = last_ts
            c["permalink"] = f"/r/{subreddit}/comments/{post_id}/_/{cid}/"
            yield c
            page_new += 1

        total += page_new
        print(f"  [arctic-shift] page: +{page_new} new (total {total})", flush=True)

        if len(rows) < _PAGE_SIZE or last_ts is None:
            break

        # Advance the cursor. ``after`` is inclusive, so the boundary comment
        # repeats and is dropped by ``seen``. If a whole page shares one second
        # (no forward progress) bump past it to avoid stalling.
        next_after = last_ts
        if after is not None and next_after <= after:
            next_after = after + 1
        after = next_after
        time.sleep(REQUEST_DELAY)
