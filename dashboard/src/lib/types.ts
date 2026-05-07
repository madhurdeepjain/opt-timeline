export interface TimelineRecord {
  comment_id: string
  author: string
  created_utc: string
  subreddit: string
  permalink: string
  type: string
  normalized_type: 'OPT' | 'STEM' | string
  premium_processing: boolean | null
  date_applied: string | null
  rfie_date: string | null
  biometrics_requested_date: string | null
  biometrics_completed_date: string | null
  biometrics_location: string | null
  noid: boolean | null
  noid_date: string | null
  date_approved: string | null
  date_card_produced: string | null
  date_card_shipped: string | null
  date_card_received: string | null
  country_of_citizenship: string | null
  days_to_approval: number | null
  days_to_card: number | null
  raw_text: string
}

export interface ThreadOption {
  id: string
  label: string
  subreddit: string
  url: string
}

export const THREAD_OPTIONS: ThreadOption[] = [
  { id: '1r6p9k0', label: 'Spring/Summer 2026',  subreddit: 'f1visa', url: 'https://reddit.com/r/f1visa/comments/1r6p9k0/' },
  { id: '1qz1n7j', label: '2026',                subreddit: 'USCIS',  url: 'https://reddit.com/r/USCIS/comments/1qz1n7j/' },
  { id: '1i6230k', label: '2025',                subreddit: 'USCIS',  url: 'https://reddit.com/r/USCIS/comments/1i6230k/' },
  { id: '1m84yfm', label: '2025 (continued)',    subreddit: 'USCIS',  url: 'https://reddit.com/r/USCIS/comments/1m84yfm/' },
  { id: '1of7n45', label: 'Fall 2025',           subreddit: 'f1visa', url: 'https://reddit.com/r/f1visa/comments/1of7n45/' },
]

export interface FilterState {
  type: 'all' | 'OPT' | 'STEM'
  premium: 'all' | 'standard' | 'premium'
  approved: 'all' | 'yes' | 'no'
  cardReceived: 'all' | 'yes' | 'no'
  rfie: 'all' | 'yes' | 'no'
  citizenship: string[]
  threads: string[]
  appliedDateFrom: string | null
  appliedDateTo: string | null
}

export interface SurvivalPoint {
  day: number
  pctApproved: number
  pctPending: number
}

export interface FunnelStage {
  stage: string
  count: number
  pct: number
}

export interface MilestonePoint {
  stage: string
  median: number | null
  p25: number | null
  p75: number | null
  range: [number, number] | null
  n: number
  bioOnly: boolean
}

export interface CountryBreakdown {
  country: string
  n: number
  median: number
  p25: number
  p75: number
}

export interface DashboardStats {
  total: number
  optCount: number
  stemCount: number
  approvedCount: number
  medianDaysToApproval: number | null
  medianDaysStandard: number | null
  medianDaysPremium: number | null
  premiumPct: number
  latestAppliedDate: string | null
}
