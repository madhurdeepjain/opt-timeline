-- Last time the author touched the comment(s) behind a row: max of created and
-- edited times across every comment merged into it. Date parsing uses it as the
-- "can't be later than this" bound for yearless dates and impossible dates.
alter table public.timeline add column if not exists last_seen_utc timestamptz;
