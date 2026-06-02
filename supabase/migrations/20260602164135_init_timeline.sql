-- OPT Timeline — initial schema
-- Applied via the Supabase CLI: `supabase db push` (after `supabase link`).
--
-- Key model (2025+): reads use the *publishable* key (sb_publishable_…), which
-- maps to the `anon` Postgres role and is gated by the RLS SELECT policy below.
-- Writes use the *secret* key (sb_secret_…), which bypasses RLS entirely — that
-- key lives only in the scraper env / GitHub Actions secret, never in the browser.

-- ── timeline ────────────────────────────────────────────────────────────────
create table if not exists public.timeline (
  comment_id                 text primary key,
  author                     text,
  created_utc                timestamptz,
  subreddit                  text,
  permalink                  text,
  type                       text,
  normalized_type            text,
  premium_processing         boolean,
  pp_upgraded                boolean,
  pp_upgrade_date            date,
  date_applied               date,
  employment_start_date      date,
  rfie_date                  date,
  biometrics_requested_date  date,
  biometrics_completed_date  date,
  biometrics_location        text,
  noid                       boolean,
  noid_date                  date,
  date_approved              date,
  date_card_produced         date,
  date_card_shipped          date,
  date_card_received         date,
  country_of_citizenship     text,
  ban_status                 text,
  service_center             text,
  graduation_date            date,
  a_number_date              date,
  days_to_approval           integer,
  days_to_card               integer,
  raw_text                   text,
  -- Set to the scrape run's start time on every upsert; rows left with an older
  -- value after a run are stale (dropped by dedupe) and get deleted. See
  -- supastore.save().
  updated_at                 timestamptz not null default now()
);

-- Most dashboard queries sort/filter by date_applied.
create index if not exists timeline_date_applied_idx on public.timeline (date_applied desc);

-- ── meta (single-row scrape metadata) ───────────────────────────────────────
create table if not exists public.meta (
  id          integer primary key default 1,
  scraped_at  timestamptz,
  constraint meta_single_row check (id = 1)
);

-- ── Row Level Security: public read-only, no public writes ───────────────────
alter table public.timeline enable row level security;
alter table public.meta     enable row level security;

drop policy if exists "public read timeline" on public.timeline;
create policy "public read timeline" on public.timeline
  for select to anon using (true);

drop policy if exists "public read meta" on public.meta;
create policy "public read meta" on public.meta
  for select to anon using (true);

-- No insert/update/delete policies ⇒ the publishable (anon) key cannot write.
-- The scraper's secret key bypasses RLS, so it needs no policy.
