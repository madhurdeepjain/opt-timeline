from pathlib import Path

THREADS = [
    # ── 2026 ────────────────────────────────────────────────────────────────────
    {
        "post_id": "1r6p9k0",
        "subreddit": "f1visa",
    },
    {
        "post_id": "1qz1n7j",
        "subreddit": "USCIS",
    },
    # ── 2025 ────────────────────────────────────────────────────────────────────
    {
        "post_id": "1i6230k",
        "subreddit": "USCIS",
    },
    {
        "post_id": "1m84yfm",
        "subreddit": "USCIS",
    },
    {
        "post_id": "1of7n45",
        "subreddit": "f1visa",
    },
]

# Megathreads found by `scrape --check-threads` that aren't worth scraping
# (post IDs). Keeps them out of the daily "new megathreads" issue.
IGNORED_THREADS: set[str] = set()

DEFAULT_OUTPUT = str(Path(__file__).resolve().parents[3] / "dashboard" / "data" / "timeline.csv")

CSV_FIELDS = [
    "comment_id",
    "author",
    "created_utc",
    "last_seen_utc",
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

# A unique, self-identifying UA — good etiquette for any public data API.
USER_AGENT = "python:reddit-opt-scraper:2.0 (timeline aggregation; +https://github.com/madhurdeepjain/opt-timeline)"
# Pause between Reddit requests (thread pages and morechildren batches).
REQUEST_DELAY = 2.0
