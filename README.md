# opt-timeline

How long is OPT / STEM OPT taking right now? USCIS publishes a single slow-moving number. Meanwhile, thousands of applicants post their actual dates in Reddit megathreads. This repo scrapes those posts, parses the free-form timelines, and turns them into a dashboard.

**Live: [mdjain.com/opt-timeline](https://www.mdjain.com/opt-timeline)**

> Crowdsourced and self-reported. Not official USCIS data, not legal advice.

## How it works

```
Reddit megathreads ──▶ scraper (Python) ──▶ Postgres ──▶ dashboard (Next.js)
                        parse + dedupe       daily cron     filters + charts, all client-side
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

Almost nobody follows the template exactly. [`parser.py`](scraper/src/reddit_opt_scraper/parser.py) is a pile of regexes that pulls out the fields anyway. It handles mixed date formats, DD/MM vs MM/DD ambiguity, leftover `MM/DD/YYYY` placeholders, "N/A" / "pending" / "TBD", invisible copy-paste characters and comments that people edit weeks later to add their approval date. Records are deduped by author and applied date, and days-to-approval is computed from the parsed dates.

## Layout

```
scraper/     Python (uv). fetch → parse → merge → dedupe → save
  parser.py    the interesting part: free-form comment → structured record
  fetcher.py   pulls top-level comments from each thread
  config.py    which threads to scrape
dashboard/   Next.js single page. src/lib/data.ts holds all stats/chart math
supabase/    table schema
```

## Contributing

The parser is where help is most useful. If a comment was parsed wrong, or a real timeline didn't show up at all, open an issue with a link to the comment. Also useful: a PR that adds the failing comment body next to the regex that should have caught it.

Know of a new megathread? Open an issue with the link.

Want to run your own copy of the whole pipeline? See [docs/self-hosting.md](docs/self-hosting.md).

## License

GPL-3.0
