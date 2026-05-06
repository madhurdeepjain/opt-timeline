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
  parse_errors: string[]
}

export interface FilterState {
  type: 'all' | 'OPT' | 'STEM'
  premium: 'all' | 'standard' | 'premium'
  approved: 'all' | 'yes' | 'no'
  cardReceived: 'all' | 'yes' | 'no'
  rfie: 'all' | 'yes' | 'no'
  citizenship: string[]
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
