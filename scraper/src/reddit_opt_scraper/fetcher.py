"""Fetch comments from Reddit JSON endpoints using cookie or bearer-token auth.

Reddit's public .json endpoints return 403 for unauthenticated traffic. Passing
a valid session cookie (extracted from a logged-in browser) or a bearer token
bypasses this. Set one of these in scraper/.env:

    REDDIT_COOKIE=<full Cookie header value from browser DevTools>
    REDDIT_TOKEN=<access_token from browser Network tab or localStorage>

Cookie auth  → requests go to www.reddit.com with a Cookie header.
Bearer auth  → requests go to oauth.reddit.com with Authorization: Bearer.
  (Reddit requires the oauth. subdomain when a bearer token is present.)
"""

import os
import time
from typing import Iterator

import httpx

from .config import USER_AGENT, REQUEST_DELAY

_MAX_RETRIES = 6
_RETRY_BASE = 60  # seconds for first 429 backoff if no Retry-After header

_BASE_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, */*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}


def _build_headers(cookie: str | None, token: str | None) -> dict:
    h = dict(_BASE_HEADERS)
    if token:
        h["Authorization"] = f"Bearer {token}"
    elif cookie:
        h["Cookie"] = cookie
    return h


def _reddit_url(path: str, token: str | None) -> str:
    """Return the correct Reddit base URL for the given auth type."""
    base = "https://oauth.reddit.com" if token else "https://www.reddit.com"
    # path already starts with /r/... or /api/...; strip trailing .json for oauth
    if token:
        path = path.removesuffix(".json")
    return base + path


def _get(client: httpx.Client, url: str, params: dict | None, headers: dict) -> dict:
    for attempt in range(_MAX_RETRIES):
        resp = client.get(url, params=params, headers=headers, follow_redirects=True, timeout=30.0)
        if resp.status_code == 403:
            raise RuntimeError(
                f"403 Forbidden — Reddit rejected the request to {url}.\n"
                "Check that REDDIT_COOKIE or REDDIT_TOKEN is set and not expired."
            )
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", _RETRY_BASE * (2 ** attempt)))
            print(f"  [rate-limit] 429 — sleeping {wait}s (attempt {attempt + 1}/{_MAX_RETRIES})", flush=True)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        _maybe_throttle(resp)
        return resp.json()
    raise RuntimeError(f"Gave up after {_MAX_RETRIES} retries: {url}")


def _maybe_throttle(resp: httpx.Response) -> None:
    try:
        remaining = float(resp.headers.get("X-Ratelimit-Remaining", 100))
        reset_secs = float(resp.headers.get("X-Ratelimit-Reset", 0))
        if remaining < 5 and reset_secs > 0:
            wait = min(reset_secs, 120)
            print(f"  [rate-limit] {remaining:.0f} requests left — sleeping {wait:.0f}s", flush=True)
            time.sleep(wait)
    except (ValueError, TypeError):
        pass


def _extract_top_level(listing_children: list) -> tuple[list[dict], list[str]]:
    comments: list[dict] = []
    more_ids: list[str] = []
    for child in listing_children:
        if child["kind"] == "t1":
            comments.append(child["data"])
        elif child["kind"] == "more":
            more_ids.extend(child["data"].get("children", []))
    return comments, more_ids


def _fetch_more_children(
    post_id: str,
    more_ids: list[str],
    client: httpx.Client,
    headers: dict,
    token: str | None,
    batch_size: int = 100,
) -> list[dict]:
    all_comments: list[dict] = []
    path = "/api/morechildren" if token else "/api/morechildren.json"
    url = ("https://oauth.reddit.com" if token else "https://www.reddit.com") + path
    total_batches = (len(more_ids) + batch_size - 1) // batch_size

    for batch_num, i in enumerate(range(0, len(more_ids), batch_size), start=1):
        batch = more_ids[i : i + batch_size]
        print(f"  [morechildren] batch {batch_num}/{total_batches} ({len(batch)} ids)…", flush=True)
        try:
            data = _get(
                client,
                url,
                params={"api_type": "json", "link_id": f"t3_{post_id}", "children": ",".join(batch)},
                headers=headers,
            )
            things = data.get("json", {}).get("data", {}).get("things", [])
            top_level = [
                t for t in things
                if t["kind"] == "t1" and t["data"].get("parent_id", "").startswith("t3_")
            ]
            all_comments.extend(t["data"] for t in top_level)
            print(
                f"  [morechildren] batch {batch_num}/{total_batches} → "
                f"{len(top_level)} top-level ({len(things)} total things)",
                flush=True,
            )
        except Exception as exc:
            print(f"  [warn] morechildren batch {batch_num} failed: {exc}", flush=True)
        time.sleep(REQUEST_DELAY)

    return all_comments


def fetch_all_comments(
    thread: dict,
    client: httpx.Client,
    *,
    cookie: str | None = None,
    token: str | None = None,
) -> Iterator[dict]:
    """Yield every top-level comment data dict from a thread.

    Pass exactly one of ``cookie`` or ``token``; raises 403 if neither is set
    and Reddit rejects the unauthenticated request.
    """
    headers = _build_headers(cookie, token)

    # Build the URL for the correct Reddit base (oauth. vs www.)
    post_id = thread["post_id"]
    subreddit = thread["subreddit"]
    path = f"/r/{subreddit}/comments/{post_id}.json"
    url = _reddit_url(path, token)

    print(f"  Fetching thread page…", flush=True)
    data = _get(client, url, params={"limit": 500, "raw_json": 1}, headers=headers)
    time.sleep(REQUEST_DELAY)

    comments_listing = data[1]["data"]
    comments, more_ids = _extract_top_level(comments_listing["children"])
    print(f"  First page: {len(comments)} comments, {len(more_ids)} more-ids to expand", flush=True)

    for c in comments:
        yield c

    if more_ids:
        for c in _fetch_more_children(post_id, more_ids, client, headers, token):
            yield c
