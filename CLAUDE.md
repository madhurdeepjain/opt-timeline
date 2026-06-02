# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Scraper** (Python, managed by `uv`):
```bash
cd scraper
uv sync                        # install dependencies
uv run scrape                  # fetch all threads → Supabase (or CSV if no Supabase env)
uv run scrape --csv            # force CSV output even when Supabase env is set
uv run scrape --no-merge       # ignore existing records; treat this run as the full set
uv run scrape -v               # verbose: print each matched record
uv run scrape --seed-from PATH # load existing from a CSV (one-time Supabase migration seed)
```

**Dashboard** (Next.js):
```bash
cd dashboard
npm install
npm run dev    # http://localhost:3000
npm run build
npm run lint
```

## Architecture

```
scraper/   → Python package (uv/hatchling), entry-point: scrape
dashboard/ → Next.js 16 App Router, single-page client component
```

### Data pipeline

1. `uv run scrape` fetches Reddit threads via their public `.json` endpoints, parses template-style comments, merges with existing records, dedupes, and **upserts to Supabase** (`timeline` + `meta` tables). Falls back to CSV (`dashboard/data/`) only when Supabase env vars are absent or `--csv` is passed.
2. `dashboard/src/app/page.tsx` (`'use client'`) reads `timeline` + `meta` **directly from Supabase** via the publishable key (`lib/supabase.ts`, paginated past PostgREST's 1000-row cap) on mount and holds the full record set in state. **All filtering is client-side.**

### Storage / Supabase

- Schema + RLS in `supabase/migrations/` (applied with `supabase link` then `supabase db push`). RLS = public read-only; writes need the secret key (bypasses RLS).
- **Key model (2025+):** dashboard uses the *publishable* key (`sb_publishable_…`, browser-safe); scraper uses the *secret* key (`sb_secret_…`, env/CI only). These replaced the legacy `anon`/`service_role` keys.
- Stale-row handling: every upsert stamps `updated_at = run_start`; rows older than that after a run (dropped by dedupe) are deleted — reproducing the CSV "whole-file rewrite".
- Env: scraper reads `scraper/.env` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`); dashboard reads `dashboard/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). `.example` files document both.
- `.github/workflows/update-data.yml` runs the scraper on a daily cron → Supabase (no commits).
- One-time migration seed: `uv run scrape --seed-from dashboard/data/timeline.csv`.

### Scraper internals (`scraper/src/reddit_opt_scraper/`)

- `config.py` — thread list (Reddit post IDs), CSV field order, rate-limit delay (6 s/req)
- `fetcher.py` — paginates Reddit's `.json` API with `after` cursor
- `parser.py` — regex-based extraction of template fields from freeform comment text; the most fragile part — handles date normalization, null sentinels, and DD/MM/YYYY ambiguity
- `exporter.py` — CSV load/save, deduplication (by `author + date_applied`), `merge` (fresh replaces existing by `comment_id`)
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

`globals.css` defines CSS custom properties (`--canvas`, `--ink`, `--body`, `--hairline`, etc.) derived from the PostHog-inspired palette documented in `DESIGN.md`. Use these CSS vars (e.g. `style={{ color: 'var(--ink)' }}`) rather than hard-coded hex values. Tailwind utility classes handle spacing/layout; color almost always goes through the CSS vars.

### Adding a new Reddit thread

1. Add an entry to `THREADS` in `scraper/src/reddit_opt_scraper/config.py`
2. Add a matching `ThreadOption` to `THREAD_OPTIONS` in `dashboard/src/lib/types.ts`
3. If it should be on by default, add its `id` to `DEFAULT_THREADS` in the same file
