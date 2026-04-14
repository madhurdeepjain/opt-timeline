export interface TimelineRecord {
  comment_id: string;
  author: string;
  created_utc: string;
  subreddit: string;
  permalink: string;
  type: string;
  normalized_type: "OPT" | "STEM" | "";
  premium_processing: string;       // "true" | "false" | ""
  date_applied: string;             // YYYY-MM-DD | ""
  rfie_date: string;
  biometrics_requested_date: string;
  biometrics_completed_date: string;
  biometrics_location: string;
  noid: string;                     // "true" | "false" | ""
  noid_date: string;
  date_approved: string;
  date_card_produced: string;
  date_card_shipped: string;
  date_card_received: string;
  country_of_citizenship: string;
  days_to_approval: string;         // number as string | ""
  days_to_card: string;
  raw_text: string;
  parse_errors: string;
}

export interface DashboardStats {
  total: number;
  approved: number;
  pending: number;
  avgDaysToApproval: number | null;
  avgDaysToCard: number | null;
  optCount: number;
  stemCount: number;
  premiumCount: number;
  standardCount: number;
  lastUpdated: string | null;
}

export type FilterState = {
  normalizedType: "all" | "OPT" | "STEM";
  premiumProcessing: "all" | "true" | "false";
  subreddit: "all" | "f1visa" | "USCIS";
};
