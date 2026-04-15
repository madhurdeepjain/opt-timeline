# OPT Timeline Tracker

Community-sourced OPT and STEM OPT EAD processing timelines, aggregated from Reddit megathreads and visualised in a dashboard.

**Data sources**
- [r/f1visa megathread](https://www.reddit.com/r/f1visa/comments/1r6p9k0/)
- [r/USCIS megathread](https://www.reddit.com/r/USCIS/comments/1qz1n7j/)

> Data is crowdsourced — not official USCIS processing times.

---

## Project structure

```
opt-timeline/
├── scraper/        Python package (uv) — fetches & parses Reddit comments → CSV
├── dashboard/      Next.js app — visualises the CSV
└── data/           Shared data directory
    └── timeline.csv
```

## Local development

**1. Run the scraper**
```bash
cd scraper
uv sync
uv run scrape          # writes to scraper/out/timeline.csv
```

**2. Copy data to dashboard**
```bash
cp scraper/out/timeline.csv dashboard/data/timeline.csv
```

**3. Start the dashboard**
```bash
cd dashboard
npm install
npm run dev            # → http://localhost:3000
```

## Automated updates (GitHub Actions + Vercel)

The workflow in `.github/workflows/update-data.yml` runs the scraper daily at 06:00 UTC, commits the updated CSV, and triggers a Vercel redeploy automatically.

## Contributing

Contributions welcome — especially improvements to the comment parser (`scraper/src/reddit_opt_scraper/parser.py`) for edge cases and non-standard template formats.
