"""Fetch comments from Reddit JSON endpoints (no API credentials needed)."""

import time
from typing import Iterator

import httpx

from .config import USER_AGENT, REQUEST_DELAY

_MAX_RETRIES = 6
_RETRY_BASE = 60  # seconds for first 429 backoff if no Retry-After header

_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}


def _get(client: httpx.Client, url: str, params: dict | None = None) -> dict:
    for attempt in range(_MAX_RETRIES):
        resp = client.get(
            url,
            params=params,
            headers=_HEADERS,
            follow_redirects=True,
            timeout=30.0,
        )
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", _RETRY_BASE * (2 ** attempt)))
            print(f"  [rate-limit] 429 — sleeping {wait}s (attempt {attempt + 1}/{_MAX_RETRIES})", flush=True)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Gave up after {_MAX_RETRIES} retries: {url}")


def _extract_top_level(listing_children: list) -> tuple[list[dict], list[str]]:
    """Split a children list into (comment_data_list, more_ids)."""
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
    batch_size: int = 20,
) -> list[dict]:
    """Fetch additional comments via morechildren API (no auth needed)."""
    all_comments: list[dict] = []
    url = "https://www.reddit.com/api/morechildren.json"
    total_batches = (len(more_ids) + batch_size - 1) // batch_size

    for batch_num, i in enumerate(range(0, len(more_ids), batch_size), start=1):
        batch = more_ids[i : i + batch_size]
        print(f"  [morechildren] batch {batch_num}/{total_batches} ({len(batch)} ids)…", flush=True)
        try:
            data = _get(
                client,
                url,
                params={
                    "api_type": "json",
                    "link_id": f"t3_{post_id}",
                    "children": ",".join(batch),
                },
            )
            things = data.get("json", {}).get("data", {}).get("things", [])
            fetched = sum(1 for t in things if t["kind"] == "t1")
            for thing in things:
                if thing["kind"] == "t1":
                    all_comments.append(thing["data"])
            print(f"  [morechildren] batch {batch_num}/{total_batches} → {fetched} comments", flush=True)
        except Exception as exc:
            print(f"  [warn] morechildren batch {batch_num} failed: {exc}", flush=True)
        time.sleep(REQUEST_DELAY)

    return all_comments


def fetch_all_comments(thread: dict, client: httpx.Client) -> Iterator[dict]:
    """Yield every top-level comment data dict from a thread."""
    print(f"  Fetching thread page…", flush=True)
    data = _get(client, thread["url"], params={"limit": 500})
    time.sleep(REQUEST_DELAY)

    # Reddit returns [post_listing, comments_listing]
    comments_listing = data[1]["data"]
    comments, more_ids = _extract_top_level(comments_listing["children"])
    print(f"  First page: {len(comments)} comments, {len(more_ids)} more-ids to expand", flush=True)

    for c in comments:
        yield c

    if more_ids:
        for c in _fetch_more_children(thread["post_id"], more_ids, client):
            yield c
