# OPT Timeline Tracker

Community-sourced OPT and STEM OPT EAD processing timelines, aggregated from Reddit megathreads and visualised in a dashboard.

**Data sources**

- [r/f1visa megathread](https://www.reddit.com/r/f1visa/comments/1r6p9k0/)
- [r/USCIS megathread](https://www.reddit.com/r/USCIS/comments/1qz1n7j/)

> Data is crowdsourced — not official USCIS processing times.

---

## Architecture

```
opt-timeline/
├── scraper/      Python package (uv) — fetches & parses Reddit comments → Supabase
├── dashboard/    Next.js app — reads Supabase directly and visualises the data
└── supabase/     CLI project: schema migrations + config
```

The scraper fetches each thread's comments, parses the timeline template, merges with existing records, dedupes, and **upserts to Supabase** (`timeline` + `meta` tables). The dashboard (`'use client'`) reads those tables **directly from the browser** via the Supabase publishable key. All filtering is client-side. No data is committed to the repo.

## Setup

### 1. Supabase

Create a project, then apply the schema with the CLI (migrations live in `supabase/migrations/`):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Grab two keys from **Project Settings → API Keys** (the 2025+ key model):

- **Publishable** key (`sb_publishable_…`) — browser-safe, read-only via RLS → dashboard
- **Secret** key (`sb_secret_…`) — bypasses RLS for writes → scraper only, never in the browser

### 2. Scraper

```bash
cd scraper
cp .env.example .env        # fill SUPABASE_URL + SUPABASE_SECRET_KEY
uv sync
```

### 3. Dashboard

```bash
cd dashboard
cp .env.local.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm install
```

## Running

```bash
# Scraper → Supabase
cd scraper
uv run scrape                 # scrape all threads → Supabase
uv run scrape --csv           # write to dashboard/data/timeline.csv instead (local debugging)
uv run scrape --seed-from ../dashboard/data/timeline.csv   # one-time: seed Supabase from the old CSV

# Dashboard
cd dashboard
npm run dev                   # → http://localhost:3000
```

Automated runs: `.github/workflows/update-data.yml` runs the scraper on a daily cron and writes to Supabase (no commits). Add `SUPABASE_URL` + `SUPABASE_SECRET_KEY` as repository secrets.

## Adding a new Reddit thread

1. Add an entry to `THREADS` in `scraper/src/reddit_opt_scraper/config.py`
2. Add a matching `ThreadOption` to `THREAD_OPTIONS` in `dashboard/src/lib/types.ts`
3. If it should be on by default, add its `id` to `DEFAULT_THREADS` in the same file

## Contributing

Contributions welcome — especially improvements to the comment parser (`scraper/src/reddit_opt_scraper/parser.py`) for edge cases and non-standard template formats.
