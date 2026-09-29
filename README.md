# opt-timeline

How long is OPT / STEM OPT taking right now? USCIS publishes a single slow-moving number. Meanwhile, thousands of applicants post their actual dates in Reddit megathreads. This repo scrapes those posts, parses the free-form timelines, and turns them into a dashboard.

**Live: [mdjain.com/opt-timeline](https://www.mdjain.com/opt-timeline)**

> Crowdsourced and self-reported. Not official USCIS data, not legal advice.

## How it works

```
Reddit megathreads ──▶ scraper (Python) ──▶ Postgres ──▶ dashboard (Next.js)
                        parse + merge        daily cron     filters + charts, all client-side
```

People post something like this in the threads:

```
• Type: Initial POST-COMPLETION OPT
• Premium Processing: NO
• Date Applied: 05/13/2026
• Biometrics Requested: 05/16/2026
• Biometrics Completed: 05/20/2026
• Date Approved: MM/DD/YYYY
• Date Card Received: MM/DD/YYYY
```

Almost nobody follows the template exactly. [`parser.py`](scraper/src/reddit_opt_scraper/parser.py) is a pile of regexes that pulls out the fields anyway. It handles a dozen date formats, dates without a year ("May 31", "7/9"), DD/MM vs MM/DD, mistyped years, values that Reddit's editor pushes onto the next line, leftover `MM/DD/YYYY` placeholders and "N/A" / "pending" / "TBD". A date must be on or before the last time the author edited their comment, which settles most of the ambiguity.

People also post the same application more than once (status updates, reposts in both threads). Each author's posts are merged into one record per application unless they contradict each other (different type, or dates more than a week apart).

## How the numbers work

A wait time is only known once someone reports their approval, so every wait statistic describes **cases approved in a recent window** (60 days by default; you can change it). This is also how USCIS reports its own processing times. Pending cases can't simply be added in: people tend to come back and post when they're approved and go quiet while they wait, so a silent "pending" post isn't evidence of still waiting.

Medians come with a 95% confidence interval and the number of cases behind them. Anything computed from fewer than 20 cases, or with fewer than 5 cases beyond a percentile, isn't shown. "Premium" means premium processing from the start; cases upgraded later are counted separately, from their original filing date.

## Layout

```
scraper/     Python (uv). fetch → parse → merge each author's posts → save
  parser.py    the interesting part: free-form comment → structured record
  fetcher.py   pulls top-level comments from each thread
  config.py    which threads to scrape
dashboard/   Next.js single page. src/lib/data.ts holds all stats/chart math
supabase/    table schema
```

## Contributing

The parser is where help is most useful. If a comment was parsed wrong, or a real timeline didn't show up at all, open an issue with a link to the comment. Even better, a PR that adds the comment as a case in [`scraper/tests/test_parser.py`](scraper/tests/test_parser.py) along with the fix (`uv run python -m unittest discover -s tests` from `scraper/`).

Know of a new megathread? Open an issue with the link.

Want to run your own copy of the whole pipeline? See [docs/self-hosting.md](docs/self-hosting.md).

## License

GPL-3.0
