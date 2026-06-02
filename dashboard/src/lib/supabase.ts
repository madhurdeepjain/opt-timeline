import { createClient } from '@supabase/supabase-js'

// Reads use the publishable key (sb_publishable_…), the 2025+ replacement for
// the legacy anon key. It's safe in the browser: the timeline/meta tables are
// read-only to it via RLS (see supabase/schema.sql). Writes use the secret key,
// which lives only in the scraper env — never here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.warn(
    '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — ' +
      'data will fail to load. Set them in dashboard/.env.local.',
  )
}

// Fallbacks keep createClient from throwing at build time when env isn't inlined
// (e.g. a local `next build` without .env.local). Queries then fail at runtime
// and are surfaced via the page's error state, not a hard crash.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
)

const PAGE = 1000 // PostgREST caps a response at 1000 rows; page through with range().

/** Fetch the entire timeline table, paging past the 1000-row response cap. */
export async function fetchAllTimeline(): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('timeline')
      .select('*')
      .order('date_applied', { ascending: false, nullsFirst: false })
      .order('comment_id', { ascending: true }) // deterministic tiebreaker for stable paging
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}

/** Fetch the single scrape-metadata row. */
export async function fetchMeta(): Promise<{ scraped_at: string | null }> {
  const { data, error } = await supabase
    .from('meta')
    .select('scraped_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) return { scraped_at: null }
  return { scraped_at: (data?.scraped_at as string | null) ?? null }
}
