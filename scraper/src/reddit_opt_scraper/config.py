THREADS = [
    {
        "url": "https://www.reddit.com/r/f1visa/comments/1r6p9k0/optstem_opt_processing_timelines_megathread.json",
        "post_id": "1r6p9k0",
        "subreddit": "f1visa",
        "template": 1,
    },
    {
        "url": "https://www.reddit.com/r/USCIS/comments/1qz1n7j/2026_opt_and_stem_opt_processing_timeline.json",
        "post_id": "1qz1n7j",
        "subreddit": "USCIS",
        "template": 2,
    },
]

DEFAULT_OUTPUT = "../data/timeline.csv"

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
    "days_to_approval",
    "days_to_card",
    "raw_text",
    "parse_errors",
]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_DELAY = 1.5  # seconds between requests — stay well under Reddit's rate limit
