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

import re
import time
from typing import Iterator

import httpx

from .config import USER_AGENT, REQUEST_DELAY

_MAX_RETRIES = 6
_RETRY_BASE = 60  # seconds for first 429 backoff if no Retry-After header
_MAX_EXPAND_ATTEMPTS = 3  # times a single `more` id is requested before giving up

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


def is_gone(comment: dict) -> bool:
    """True when the author deleted the comment or their account, or a mod removed it."""
    return comment.get("author") == "[deleted]" or comment.get("body") in ("[deleted]", "[removed]")


def _fetch_by_ids(client: httpx.Client, ids: list[str], headers: dict, token: str | None) -> dict[str, dict]:
    """Top-level comments by id via api/info (100 per call). Missing ids are omitted."""
    url = ("https://oauth.reddit.com" if token else "https://www.reddit.com") + ("/api/info" if token else "/api/info.json")
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 100):
        try:
            data = _get(client, url, params={"id": ",".join(f"t1_{c}" for c in ids[i : i + 100]), "raw_json": 1}, headers=headers)
        except Exception as exc:
            print(f"  [warn] api/info lookup failed: {exc}", flush=True)
            continue
        for t in data.get("data", {}).get("children", []):
            d = t["data"]
            if d.get("parent_id", "").startswith("t3_"):
                out[d["id"]] = d
        time.sleep(REQUEST_DELAY)
    return out


def lookup_comments(
    client: httpx.Client, ids: list[str], *, cookie: str | None = None, token: str | None = None
) -> dict[str, dict]:
    """Current state of specific comments, keyed by id (ids Reddit doesn't return are omitted)."""
    return _fetch_by_ids(client, ids, _build_headers(cookie, token), token)


def _fetch_more_children(
    post_id: str,
    more_ids: list[str],
    client: httpx.Client,
    headers: dict,
    token: str | None,
    batch_size: int = 100,
) -> list[dict]:
    """Expand top-level `more` stubs into comments.

    Reddit answers a batch of ids with only some of them expanded; the rest come
    back wrapped in a nested top-level `more` stub (roughly a third per batch).
    Those ids go back on the queue until every top-level id has been seen.
    Each id is requested at most _MAX_EXPAND_ATTEMPTS times; leftovers are reported.
    """
    all_comments: list[dict] = []
    path = "/api/morechildren" if token else "/api/morechildren.json"
    url = ("https://oauth.reddit.com" if token else "https://www.reddit.com") + path

    queue = list(dict.fromkeys(more_ids))
    in_queue = set(queue)
    got: set[str] = set()
    attempts: dict[str, int] = {}
    batch_num = 0

    def enqueue(cid: str) -> None:
        if cid not in got and cid not in in_queue and attempts.get(cid, 0) < _MAX_EXPAND_ATTEMPTS:
            in_queue.add(cid)
            queue.append(cid)

    while queue:
        batch, queue = queue[:batch_size], queue[batch_size:]
        in_queue.difference_update(batch)
        for cid in batch:
            attempts[cid] = attempts.get(cid, 0) + 1
        batch_num += 1
        print(f"  [morechildren] batch {batch_num} ({len(batch)} ids, {len(queue)} queued)…", flush=True)
        try:
            data = _get(
                client,
                url,
                params={"api_type": "json", "link_id": f"t3_{post_id}", "children": ",".join(batch)},
                headers=headers,
            )
        except Exception as exc:
            print(f"  [warn] morechildren batch {batch_num} failed: {exc}", flush=True)
            for cid in batch:
                enqueue(cid)
            time.sleep(REQUEST_DELAY)
            continue

        new = 0
        for t in data.get("json", {}).get("data", {}).get("things", []):
            d = t["data"]
            if not d.get("parent_id", "").startswith("t3_"):
                continue  # replies and reply stubs: we only want top-level comments
            if t["kind"] == "t1" and d["id"] not in got:
                got.add(d["id"])
                all_comments.append(d)
                new += 1
            elif t["kind"] == "more":
                for cid in d.get("children", []):
                    enqueue(cid)
        print(f"  [morechildren] batch {batch_num} → {new} top-level", flush=True)
        time.sleep(REQUEST_DELAY)

    # morechildren silently drops some ids. Most are deleted/removed comments, but
    # not all, so look the rest up directly.
    missing = sorted(set(attempts) - got)
    if missing:
        print(f"  [info] looking up {len(missing)} ids morechildren didn't return…", flush=True)
        found = [d for d in _fetch_by_ids(client, missing, headers, token).values() if not is_gone(d)]
        all_comments.extend(found)
        print(f"  [info] recovered {len(found)}; the other {len(missing) - len(found)} are deleted or removed", flush=True)
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


# Megathread titles look like "OPT/STEM OPT Processing Timelines Megathread",
# "2026 OPT and STEM OPT Processing Timeline" or "2025 OPT Timeline Continued".
# Questions like "OPT card delivery timeline after approval?" match none of these
# and rarely reach the comment floor.
_MEGATHREAD_TITLE = re.compile(
    r"\bmegathread\b|\bprocessing\s+timelines?\b|\b20\d\d\b.*\bOPT\b.*\btimelines?\b", re.I
)
_MEGATHREAD_MIN_COMMENTS = 200


def find_new_megathreads(
    client: httpx.Client,
    subreddits: list[str],
    known_post_ids: set[str],
    *,
    cookie: str | None = None,
    token: str | None = None,
) -> list[dict]:
    """Search each subreddit for OPT timeline megathreads not in the config."""
    headers = _build_headers(cookie, token)
    found: dict[str, dict] = {}
    for sub in subreddits:
        data = _get(
            client,
            _reddit_url(f"/r/{sub}/search.json", token),
            params={"q": "OPT timeline", "restrict_sr": 1, "sort": "new", "t": "year", "limit": 100, "raw_json": 1},
            headers=headers,
        )
        for child in data.get("data", {}).get("children", []):
            post = child["data"]
            if (
                post["id"] not in known_post_ids
                and post.get("num_comments", 0) >= _MEGATHREAD_MIN_COMMENTS
                and _MEGATHREAD_TITLE.search(post.get("title", ""))
            ):
                found[post["id"]] = {
                    "post_id": post["id"],
                    "subreddit": post["subreddit"],
                    "title": post["title"],
                    "num_comments": post["num_comments"],
                    "url": f"https://www.reddit.com{post['permalink']}",
                }
        time.sleep(REQUEST_DELAY)
    return sorted(found.values(), key=lambda t: -t["num_comments"])
