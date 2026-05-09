# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Scraper** (Python, managed by `uv`):
```bash
cd scraper
uv sync                        # install dependencies
uv run scrape                  # fetch all threads → dashboard/data/timeline.csv
uv run scrape --no-merge       # overwrite instead of merging
uv run scrape -v               # verbose: print each matched record
uv run scrape -o /custom/path  # write to a different path
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

1. `uv run scrape` fetches Reddit threads via their public `.json` endpoints, parses template-style comments, merges with any existing CSV, and writes to `dashboard/data/timeline.csv` + `dashboard/data/meta.json`. The default output path is hardcoded in `scraper/src/reddit_opt_scraper/config.py` to point directly into `dashboard/data/`.
2. The Next.js API routes (`/api/data`, `/api/meta`) read those files from disk and serve them with 1-hour cache revalidation.
3. `dashboard/src/app/page.tsx` is a `'use client'` component that fetches the CSV on mount, parses it with PapaParse, and holds the full record set in state. **All filtering is client-side.**

### Scraper internals (`scraper/src/reddit_opt_scraper/`)

- `config.py` — thread list (Reddit post IDs), CSV field order, rate-limit delay (6 s/req)
- `fetcher.py` — paginates Reddit's `.json` API with `after` cursor
- `parser.py` — regex-based extraction of template fields from freeform comment text; the most fragile part — handles date normalization, null sentinels, and DD/MM/YYYY ambiguity
- `exporter.py` — deduplication (by `author + date_applied`), merge with existing CSV
- `main.py` — Click CLI wiring everything together; also writes `meta.json` with `scraped_at` timestamp

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
