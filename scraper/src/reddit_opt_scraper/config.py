from pathlib import Path

THREADS = [
    # ── 2026 ────────────────────────────────────────────────────────────────────
    {
        "url": "https://www.reddit.com/r/f1visa/comments/1r6p9k0/optstem_opt_processing_timelines_megathread.json",
        "post_id": "1r6p9k0",
        "subreddit": "f1visa",
        "year": 2026,
    },
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1qz1n7j/2026_opt_and_stem_opt_processing_timeline.json",
        "post_id": "1qz1n7j",
        "subreddit": "USCIS",
        "year": 2026,
    },
    # ── 2025 ────────────────────────────────────────────────────────────────────
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1i6230k/2025_opt_processing_timeline.json",
        "post_id": "1i6230k",
        "subreddit": "USCIS",
        "year": 2025,
    },
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1m84yfm/2025_opt_timeline_continued.json",
        "post_id": "1m84yfm",
        "subreddit": "USCIS",
        "year": 2025,
    },
    {
        "url": "https://www.reddit.com/r/f1visa/comments/1of7n45/opt_processing_timelines_fall_2025.json",
        "post_id": "1of7n45",
        "subreddit": "f1visa",
        "year": 2025,
    },
]

THREAD_YEAR_BY_POST_ID = {t["post_id"]: t["year"] for t in THREADS}

DEFAULT_OUTPUT = str(Path(__file__).resolve().parents[3] / "dashboard" / "data" / "timeline.csv")

CSV_FIELDS = [
    "comment_id",
    "author",
    "created_utc",
    "subreddit",
    "permalink",
    "type",
    "normalized_type",
    "premium_processing",
    "pp_upgraded",
    "pp_upgrade_date",
    "date_applied",
    "employment_start_date",
    "rfie_date",
    "biometrics_requested_date",
    "biometrics_completed_date",
    "biometrics_location",
    "noid",
    "noid_date",
    "date_approved",
    "date_card_produced",
    "date_card_shipped",
    "date_card_received",
    "country_of_citizenship",
    "ban_status",
    "service_center",
    "graduation_date",
    "a_number_date",
    "days_to_approval",
    "days_to_card",
    "raw_text",
]

# Arctic Shift comment search endpoint — a near-real-time Pushshift-style mirror
# of Reddit data, used because Reddit's public .json endpoints now 403 all
# unauthenticated/script traffic. See fetcher.py for the query strategy.
ARCTIC_SHIFT_SEARCH_URL = "https://arctic-shift.photon-reddit.com/api/comments/search"

# A unique, self-identifying UA — good etiquette for any public data API.
USER_AGENT = "python:reddit-opt-scraper:2.0 (timeline aggregation; +https://github.com/madhurdjain/reddit-opt)"
# Arctic Shift only asks that you "not make more than a couple requests per
# second." Each link_id page already costs ~7-9s server-side, so a short
# inter-page/-thread pause is plenty.
REQUEST_DELAY = 2.0
