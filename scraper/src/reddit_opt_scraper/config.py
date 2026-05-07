from pathlib import Path

THREADS = [
    # ── 2026 ────────────────────────────────────────────────────────────────────
    {
        "url": "https://www.reddit.com/r/f1visa/comments/1r6p9k0/optstem_opt_processing_timelines_megathread.json",
        "post_id": "1r6p9k0",
        "subreddit": "f1visa",
    },
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1qz1n7j/2026_opt_and_stem_opt_processing_timeline.json",
        "post_id": "1qz1n7j",
        "subreddit": "USCIS",
    },
    # ── 2025 ────────────────────────────────────────────────────────────────────
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1i6230k/2025_opt_processing_timeline.json",
        "post_id": "1i6230k",
        "subreddit": "USCIS",
    },
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1m84yfm/2025_opt_timeline_continued.json",
        "post_id": "1m84yfm",
        "subreddit": "USCIS",
    },
    {
        "url": "https://www.reddit.com/r/f1visa/comments/1of7n45/opt_processing_timelines_fall_2025.json",
        "post_id": "1of7n45",
        "subreddit": "f1visa",
    },
]

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
    "date_applied",
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
    "days_to_approval",
    "days_to_card",
    "raw_text",
]

# Reddit's API guidelines ask for a unique, descriptive UA. We hit public .json
# endpoints unauthenticated (no OAuth), but a self-identifying UA still complies
# better than a generic browser string and is less likely to be filtered.
USER_AGENT = "python:reddit-opt-scraper:1.1 (timeline aggregation; +https://github.com/madhurdjain/reddit-opt)"
REQUEST_DELAY = 6.0  # seconds between requests — Reddit unauthenticated limit is 10 req/min (6s/req)
