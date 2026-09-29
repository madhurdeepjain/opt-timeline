# Self-hosting

This covers running the full pipeline yourself: your own Postgres, your own scrape and your own dashboard. You need:

- a [Supabase](https://supabase.com) project (free tier is fine)
- a logged-in Reddit browser session (the scraper borrows its cookie)
- `uv`, Node 20+, and the `supabase` CLI

## 1. Database

Apply the schema in `supabase/migrations/`:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates two tables. `timeline` holds one row per parsed comment. `meta` holds the last scrape time. Row-level security makes both of them public-read and write-only through the secret key.

In **Project Settings → API Keys**, copy two keys:

| key | prefix | used by | exposure |
|---|---|---|---|
| publishable | `sb_publishable_…` | dashboard | ships in the browser bundle; read-only via RLS |
| secret | `sb_secret_…` | scraper | server/CI only; bypasses RLS |

## 2. Scraper

Reddit returns 403 to unauthenticated `.json` requests, so the scraper sends a real session cookie. To get one, log in to reddit.com, open DevTools → Network, click any `www.reddit.com` request and copy the entire `Cookie:` request header. A bearer token from an `oauth.reddit.com` request also works (`REDDIT_TOKEN`). Cookies expire, so expect to refresh this now and then.

```bash
cd scraper
cp .env.example .env    # REDDIT_COOKIE, SUPABASE_URL, SUPABASE_SECRET_KEY
uv sync
uv run scrape           # prints a +new / ~updated / -stale summary, asks before writing
```

Flags:

- `--csv` writes to `dashboard/data/timeline.csv` instead of Supabase. Useful for iterating on the parser.
- `--no-merge` ignores existing records and treats this run as the full set.
- `-v` prints every matched record.
- `-y` skips the confirmation prompt. Non-interactive runs such as CI skip it automatically.
- `--check-threads` only lists OPT timeline megathreads that aren't in `THREADS` yet.

A full fetch takes about 20 minutes, most of it waiting on Reddit's rate limit (roughly 100 requests per 10 minutes).

Merge policy: freshly fetched comments overwrite stored ones, so edits (for example an approval date added later) are picked up. Comments that no longer come back from Reddit are kept. Then each author's posts are merged into one record per application (see `merge_by_author` in `exporter.py`), and rows merged away are deleted from Supabase. When Reddit confirms a comment was deleted or removed (or its account deleted), its row is de-linked (see `anonymize` in `exporter.py`): the username, comment link, text and free-text fields are dropped, timestamps are cut to the day, and it gets an id Reddit can't be traced from. The timeline dates stay, so the statistics don't lose the case.

Parser tests: `uv run python -m unittest discover -s tests`. The daily job runs them before scraping.

## 3. Dashboard

```bash
cd dashboard
cp .env.local.example .env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                        # http://localhost:3000/opt-timeline
```

The page is a single client component. It downloads the whole `timeline` table (paged past PostgREST's 1000-row limit) and filters in the browser. `basePath` is set to `/opt-timeline` in `next.config.mjs`. Change or remove it if you host at a different path, and update the URLs in `src/app/layout.tsx` to match.

## 4. Daily cron

`.github/workflows/update-data.yml` runs the tests and the scraper every day at 06:00 UTC and writes to Supabase. It never commits anything. It then looks for new OPT timeline megathreads and opens (or updates) a GitHub issue listing any it finds; add the relevant ones as below, and the rest to `IGNORED_THREADS` in `config.py`. Add these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `REDDIT_COOKIE`

## Adding a thread

1. Add it to `THREADS` in `scraper/src/reddit_opt_scraper/config.py` (post ID and subreddit).
2. Add a matching entry to `THREAD_OPTIONS` in `dashboard/src/lib/types.ts`.
3. If it should be selected by default, add its `id` to `DEFAULT_THREADS` in the same file.

## Deploying changes

The workflow doesn't touch the database schema. When a change adds a migration under `supabase/migrations/`, apply it before pushing, or the next scrape fails writing the new column:

```bash
supabase db push
```

Then push. The dashboard redeploys from the repo, and the next daily run (or a manual run from the Actions tab) uses the new scraper.
