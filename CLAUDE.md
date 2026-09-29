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
uv run scrape --check-threads  # list OPT timeline megathreads missing from config.THREADS
uv run python -m unittest discover -s tests   # parser + merge tests (run by the daily job before scraping)
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

1. `uv run scrape` fetches each thread's top-level comments **directly from Reddit** using a browser session cookie (`REDDIT_COOKIE`) or bearer token (`REDDIT_TOKEN`); unauthenticated `.json` requests get 403. It parses template-style comments, merges with existing records, merges each author's posts into one record per application, and **upserts to Supabase** (`timeline` + `meta` tables). Falls back to CSV (`dashboard/data/`) only when Supabase env vars are absent or `--csv` is passed.
2. `dashboard/src/app/page.tsx` (`'use client'`) reads `timeline` + `meta` **directly from Supabase** via the publishable key (`lib/supabase.ts`, paginated past PostgREST's 1000-row cap) on mount and holds the full record set in state. **All filtering is client-side.** The dashboard has no CSV/local data path.

**Merge policy:** Reddit returns current comment bodies (including later edits that add approval dates), so `merge` is **fresh-wins**: fetched records overwrite stored ones by `comment_id`; stored records not re-fetched are kept. `merge_by_author` then joins an author's posts about the same application (status updates, cross-thread reposts): a post joins the author's most recently touched application it doesn't contradict (type differs, or applied/approved dates > 7 days apart, or > 300 days between posts).

**Deleted comments:** comments Reddit confirms as deleted/removed (`fetcher.is_gone`: body `[deleted]`/`[removed]` or author `[deleted]`; stored rows not re-fetched are checked via `/api/info`) are de-linked by `exporter.anonymize`, not dropped: `anon-` + HMAC(SUPABASE_SECRET_KEY, comment_id) id, no author/text/comment link (thread link kept for the thread filter), day-precision timestamps. Only positive confirmation de-links; a failed fetch never does. Applications with any live post stay linked to it.

**Dates:** every comment carries `last_seen_utc` (max of created and Reddit's `edited`). It's the parser's `as_of`: yearless dates resolve to the latest match on or before it, MM/DD vs DD/MM and mistyped years are settled by it, and `validate_dates` nulls events after it (+1 day for timezones). Start/graduation dates may be in the future (`past=False`).

**Wait-time statistics (dashboard):** only approved cases have a known wait, so every wait stat uses cases *approved* within a window ending at the scrape date (`recentApprovals`, default 60 days, `WAIT_WINDOWS` in `types.ts`). Don't add pending cases via survival/KM estimates: approval triggers reporting, so silence isn't censoring, and simulations showed those estimators biased. Quantiles use `quantileCI` (type-1, order-statistic 95% CI), hidden below `MIN_N = 20` or with < 5 cases beyond the quantile. `processingKind` splits premium-from-start / upgraded / standard.

### Storage / Supabase

- Schema + RLS in `supabase/migrations/` (applied with `supabase link` then `supabase db push`). RLS = public read-only; writes need the secret key (bypasses RLS).
- **Key model (2025+):** dashboard uses the *publishable* key (`sb_publishable_…`, browser-safe); scraper uses the *secret* key (`sb_secret_…`, env/CI only).
- Stale-row handling: every upsert stamps `updated_at = run_start`; rows older than that after a run (merged away) are deleted.
- Migrations are **not** applied by CI: run `supabase db push` before pushing code that writes a new column.
- Env: scraper reads `scraper/.env` (`REDDIT_COOKIE`/`REDDIT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`); dashboard reads `dashboard/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). `.example` files document both.
- `.github/workflows/update-data.yml` runs the scraper on a daily cron → Supabase (no commits). Secrets: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `REDDIT_COOKIE`.
- Don't commit real keys or ship a working publishable key in `.env.local.example`; the repo is public and self-hosters bring their own project.

### Scraper internals (`scraper/src/reddit_opt_scraper/`)

- `config.py` — thread list (post ID, subreddit), `IGNORED_THREADS`, CSV field order, User-Agent, request delay (2 s)
- `fetcher.py` — fetches the thread page (`limit=500`) then expands `more` stubs via `/api/morechildren` in batches of 100, re-queueing the ids Reddit defers into nested `more` stubs (~⅓ per batch), then looks up the rest via `/api/info` (most are deleted); top-level comments only; cookie auth → `www.reddit.com`, token auth → `oauth.reddit.com`; honours 429 `Retry-After` and `X-Ratelimit-*`. Also `find_new_megathreads` for `--check-threads`
- `parser.py` — regex-based extraction of template fields from freeform comment text; the most fragile part. Check parser changes against the whole corpus, not just new cases: every fix here has shifted other comments
- `exporter.py` — CSV load/save (re-validates loaded rows against current parser rules), `merge` (fresh-wins), `merge_by_author`
- `supastore.py` — Supabase backend: paginated `load_existing`, batched upsert `save` + stale-row delete, `save_meta`
- `main.py` — Click CLI; loads `.env`, picks Supabase vs CSV backend, wires fetch → merge → merge_by_author → save

### Dashboard internals (`dashboard/src/`)

- `lib/types.ts` — `TimelineRecord`, `FilterState`, `THREAD_OPTIONS`, `DEFAULT_FILTERS`
- `lib/data.ts` — pure functions: wait-time primitives (`recentApprovals`, `quantileCI`, `processingKind`), `applyFilters`, `computeStats`, `buildHistogramData`, `buildWaitCurve`, `buildWaitTrend`, `buildFunnelData`, `buildMilestoneData`, `buildCountryData`, `buildMonthlyTrendData`
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
