# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Public-facing docs: `README.md` (what/why, contributing) and `docs/self-hosting.md` (full setup). Keep those in sync when behavior changes.

## Commands

**Scraper** (Python, managed by `uv`):
```bash
cd scraper
uv sync                        # install dependencies
uv run scrape                  # fetch all threads → Supabase (or CSV if no Supabase env)
uv run scrape --csv            # force CSV output even when Supabase env is set
uv run scrape --no-merge       # ignore existing records; treat this run as the full set
uv run scrape -v               # verbose: print each matched record
uv run scrape -y               # skip the confirm-before-write prompt (auto-skipped when not a TTY)
```

**Dashboard** (Next.js):
```bash
cd dashboard
npm install
npm run dev    # http://localhost:3000/opt-timeline  (basePath)
npm run build
npm run lint   # eslint flat config (eslint.config.mjs)
```

## Architecture

```
scraper/   → Python package (uv/hatchling), entry-point: scrape
dashboard/ → Next.js 16 App Router, single-page client component
supabase/  → schema migrations + CLI config
```

### Data pipeline

1. `uv run scrape` fetches each thread's top-level comments **directly from Reddit** using a browser session cookie (`REDDIT_COOKIE`) or bearer token (`REDDIT_TOKEN`); unauthenticated `.json` requests get 403. It parses template-style comments, merges with existing records, dedupes, and **upserts to Supabase** (`timeline` + `meta` tables). Falls back to CSV (`dashboard/data/`) only when Supabase env vars are absent or `--csv` is passed.
2. `dashboard/src/app/page.tsx` (`'use client'`) reads `timeline` + `meta` **directly from Supabase** via the publishable key (`lib/supabase.ts`, paginated past PostgREST's 1000-row cap) on mount and holds the full record set in state. **All filtering is client-side.** The dashboard has no CSV/local data path.

**Merge policy:** Reddit returns current comment bodies (including later edits that add approval dates), so `merge` is **fresh-wins**: fetched records overwrite stored ones by `comment_id`; stored records not re-fetched are kept.

### Storage / Supabase

- Schema + RLS in `supabase/migrations/` (applied with `supabase link` then `supabase db push`). RLS = public read-only; writes need the secret key (bypasses RLS).
- **Key model (2025+):** dashboard uses the *publishable* key (`sb_publishable_…`, browser-safe); scraper uses the *secret* key (`sb_secret_…`, env/CI only).
- Stale-row handling: every upsert stamps `updated_at = run_start`; rows older than that after a run (dropped by dedupe) are deleted.
- Env: scraper reads `scraper/.env` (`REDDIT_COOKIE`/`REDDIT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`); dashboard reads `dashboard/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). `.example` files document both.
- `.github/workflows/update-data.yml` runs the scraper on a daily cron → Supabase (no commits). Secrets: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `REDDIT_COOKIE`.
- Don't commit real keys or ship a working publishable key in `.env.local.example`; the repo is public and self-hosters bring their own project.

### Scraper internals (`scraper/src/reddit_opt_scraper/`)

- `config.py` — thread list (post ID, subreddit, year), CSV field order, User-Agent, request delay (2 s)
- `fetcher.py` — fetches the thread page (`limit=500`) then expands `more` stubs via `/api/morechildren` in batches of 100, keeping top-level comments only; cookie auth → `www.reddit.com`, token auth → `oauth.reddit.com`; honours 429 `Retry-After` and `X-Ratelimit-*`
- `parser.py` — regex-based extraction of template fields from freeform comment text; the most fragile part — handles date normalization, null sentinels, and DD/MM/YYYY ambiguity
- `exporter.py` — CSV load/save (re-validates loaded rows against current parser rules), deduplication (by `author + date_applied`, latest wins, earlier non-null fields unioned in), `merge` (fresh-wins)
- `supastore.py` — Supabase backend: paginated `load_existing`, batched upsert `save` + stale-row delete, `save_meta`
- `main.py` — Click CLI; loads `.env`, picks Supabase vs CSV backend, wires fetch → merge → dedupe → save

### Dashboard internals (`dashboard/src/`)

- `lib/types.ts` — `TimelineRecord`, `FilterState`, `THREAD_OPTIONS`, `DEFAULT_FILTERS`
- `lib/data.ts` — pure functions: `applyFilters`, `computeStats`, `buildHistogramData`, `buildSurvivalCurve`, `buildFunnelData`, `buildMilestoneData`, `buildCountryData`, `buildMonthlyTrendData`
- `lib/utils.ts` — small helpers (`median`, `daysBetween`, `toYearMonth`, `formatDate`)
- `app/page.tsx` — owns all filter state; computes facet counts (via `useMemo`) for each dimension against records filtered by all *other* active dimensions, then passes everything down to presentational components
- `components/filters.tsx` — receives all facet counts as props; emits `onChange`
- `components/where-are-you.tsx` — scoped to 2026 threads only, not affected by global `FilterState`
- `components/user-journey.tsx` / `personal-timeline.tsx` — localStorage-backed personal trackers; sync their type/premium selection to the global filter state via a `opt-filters-sync` custom DOM event

### Design tokens

`globals.css` defines CSS custom properties (`--canvas`, `--ink`, `--body`, `--hairline`, etc.) for light and dark themes. Style is PostHog-inspired: warm cream canvas, olive ink, single yellow accent (`--primary`), IBM Plex Sans, hairline borders, no drop shadows. Use these CSS vars (e.g. `style={{ color: 'var(--ink)' }}`) rather than hard-coded hex values. Tailwind utility classes handle spacing/layout; color almost always goes through the CSS vars.

### Adding a new Reddit thread

1. Add an entry to `THREADS` in `scraper/src/reddit_opt_scraper/config.py`
2. Add a matching `ThreadOption` to `THREAD_OPTIONS` in `dashboard/src/lib/types.ts`
3. If it should be on by default, add its `id` to `DEFAULT_THREADS` in the same file
