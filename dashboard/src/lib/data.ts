import type { TimelineRecord, FilterState, DashboardStats, SurvivalPoint, FunnelStage, MilestonePoint, CountryBreakdown } from './types'
import { median, toYearMonth, daysBetween } from './utils'

function postIdFromPermalink(permalink: string): string {
  return permalink.split('/comments/')[1]?.split('/')[0] ?? ''
}

export function applyFilters(records: TimelineRecord[], filters: FilterState): TimelineRecord[] {
  return records.filter((r) => {
    if (filters.type !== 'all' && r.normalized_type !== filters.type) return false
    if (filters.premium === 'premium' && r.premium_processing !== true) return false
    if (filters.premium === 'standard' && r.premium_processing !== false) return false
    if (filters.approved === 'yes' && !r.date_approved) return false
    if (filters.approved === 'no' && !!r.date_approved) return false
    if (filters.cardReceived === 'yes' && !r.date_card_received) return false
    if (filters.cardReceived === 'no' && !!r.date_card_received) return false
    if (filters.rfie === 'yes' && !r.rfie_date) return false
    if (filters.rfie === 'no' && !!r.rfie_date) return false
    if (filters.citizenship.length > 0 && !filters.citizenship.includes(r.country_of_citizenship ?? '')) return false
    if (filters.threads.length > 0 && !filters.threads.includes(postIdFromPermalink(r.permalink))) return false
    if (filters.appliedDateFrom || filters.appliedDateTo) {
      if (!r.date_applied) return false
      if (filters.appliedDateFrom && r.date_applied < filters.appliedDateFrom) return false
      if (filters.appliedDateTo && r.date_applied > filters.appliedDateTo) return false
    }
    return true
  })
}

export function computeStats(records: TimelineRecord[]): DashboardStats {
  const optCount = records.filter((r) => r.normalized_type === 'OPT').length
  const stemCount = records.filter((r) => r.normalized_type === 'STEM').length
  const approvedCount = records.filter((r) => r.date_approved).length

  const approvalDays = records
    .map((r) => r.days_to_approval)
    .filter((d): d is number => typeof d === 'number' && d > 0 && d < 730)

  const standardDays = records
    .filter((r) => r.premium_processing === false)
    .map((r) => r.days_to_approval)
    .filter((d): d is number => typeof d === 'number' && d > 0 && d < 730)

  const premiumDays = records
    .filter((r) => r.premium_processing === true)
    .map((r) => r.days_to_approval)
    .filter((d): d is number => typeof d === 'number' && d > 0 && d < 730)

  const premiumCount = records.filter((r) => r.premium_processing === true).length
  const knownPremiumTotal = records.filter((r) => r.premium_processing !== null).length

  const appliedDates = records
    .map((r) => r.date_applied)
    .filter((d): d is string => !!d)
    .sort()

  return {
    total: records.length,
    optCount,
    stemCount,
    approvedCount,
    medianDaysToApproval: median(approvalDays),
    medianDaysStandard: median(standardDays),
    medianDaysPremium: median(premiumDays),
    premiumPct: knownPremiumTotal > 0 ? Math.round((premiumCount / knownPremiumTotal) * 100) : 0,
    latestAppliedDate: appliedDates.length > 0 ? appliedDates[appliedDates.length - 1] : null,
  }
}

export function buildHistogramData(records: TimelineRecord[]) {
  const bins = [
    { label: '0–15', min: 0, max: 15 },
    { label: '15–30', min: 15, max: 30 },
    { label: '30–45', min: 30, max: 45 },
    { label: '45–60', min: 45, max: 60 },
    { label: '60–75', min: 60, max: 75 },
    { label: '75–90', min: 75, max: 90 },
    { label: '90+', min: 90, max: Infinity },
  ]

  return bins.map(({ label, min, max }) => {
    const opt = records.filter(
      (r) =>
        r.normalized_type === 'OPT' &&
        typeof r.days_to_approval === 'number' &&
        r.days_to_approval >= min &&
        r.days_to_approval < max
    ).length
    const stem = records.filter(
      (r) =>
        r.normalized_type === 'STEM' &&
        typeof r.days_to_approval === 'number' &&
        r.days_to_approval >= min &&
        r.days_to_approval < max
    ).length
    return { label, OPT: opt, STEM: stem }
  })
}

export function buildSurvivalCurve(records: TimelineRecord[]): SurvivalPoint[] {
  const days = records
    .map((r) => r.days_to_approval)
    .filter((d): d is number => typeof d === 'number' && d > 0 && d < 400)
    .sort((a, b) => a - b)
  if (days.length === 0) return []
  const total = days.length
  const result: SurvivalPoint[] = []
  let approved = 0
  let di = 0
  for (let day = 1; day <= 120; day++) {
    while (di < total && days[di] <= day) { approved++; di++ }
    result.push({ day, pctApproved: Math.round(approved / total * 100), pctPending: Math.round((total - approved) / total * 100) })
  }
  return result
}

export function buildFunnelData(records: TimelineRecord[]): FunnelStage[] {
  const total = records.length
  if (total === 0) return []
  const bio = records.filter((r) => r.biometrics_requested_date || r.biometrics_completed_date).length
  const approved = records.filter((r) => r.date_approved).length
  const cardProduced = records.filter((r) => r.date_card_produced).length
  const cardReceived = records.filter((r) => r.date_card_received).length
  return [
    { stage: 'Applied', count: total, pct: 100 },
    { stage: 'Biometrics', count: bio, pct: Math.round(bio / total * 100) },
    { stage: 'Approved', count: approved, pct: Math.round(approved / total * 100) },
    { stage: 'Card Produced', count: cardProduced, pct: Math.round(cardProduced / total * 100) },
    { stage: 'Card Received', count: cardReceived, pct: Math.round(cardReceived / total * 100) },
  ]
}

export function buildMilestoneData(records: TimelineRecord[]): MilestonePoint[] {
  function stageStats(diffs: number[]): { median: number | null; p25: number | null; p75: number | null; range: [number, number] | null; n: number } {
    const valid = diffs.filter((d) => d > 0 && d < 365).sort((a, b) => a - b)
    if (valid.length === 0) return { median: null, p25: null, p75: null, range: null, n: 0 }
    const med = median(valid) ?? 0
    const p25 = valid[Math.floor(valid.length * 0.25)] ?? med
    const p75 = valid[Math.floor(valid.length * 0.75)] ?? med
    return { median: med, p25, p75, range: [med - p25, p75 - med], n: valid.length }
  }

  const bioNotice = records
    .filter((r) => r.date_applied && r.biometrics_requested_date)
    .map((r) => daysBetween(r.date_applied!, r.biometrics_requested_date!))
  const bioAppt = records
    .filter((r) => r.biometrics_requested_date && r.biometrics_completed_date)
    .map((r) => daysBetween(r.biometrics_requested_date!, r.biometrics_completed_date!))
  const bioToApproval = records
    .filter((r) => r.biometrics_completed_date && r.date_approved)
    .map((r) => daysBetween(r.biometrics_completed_date!, r.date_approved!))
  const approvedToCard = records
    .filter((r) => r.date_approved && r.date_card_produced)
    .map((r) => daysBetween(r.date_approved!, r.date_card_produced!))
  const cardToReceived = records
    .filter((r) => r.date_card_produced && r.date_card_received)
    .map((r) => daysBetween(r.date_card_produced!, r.date_card_received!))

  return [
    { stage: 'Applied → Bio Notice', ...stageStats(bioNotice), bioOnly: true },
    { stage: 'Bio Notice → Appt', ...stageStats(bioAppt), bioOnly: true },
    { stage: 'Bio Appt → Approved', ...stageStats(bioToApproval), bioOnly: true },
    { stage: 'Approved → Card Produced', ...stageStats(approvedToCard), bioOnly: false },
    { stage: 'Card Produced → Received', ...stageStats(cardToReceived), bioOnly: false },
  ]
}

export function buildCountryData(records: TimelineRecord[], minN = 3): CountryBreakdown[] {
  const groups: Record<string, number[]> = {}
  for (const r of records) {
    if (!r.country_of_citizenship || typeof r.days_to_approval !== 'number') continue
    if (r.days_to_approval <= 0 || r.days_to_approval >= 400) continue
    groups[r.country_of_citizenship] ??= []
    groups[r.country_of_citizenship].push(r.days_to_approval)
  }
  return Object.entries(groups)
    .filter(([, days]) => days.length >= minN)
    .map(([country, days]) => {
      const sorted = [...days].sort((a, b) => a - b)
      return {
        country,
        n: sorted.length,
        median: median(sorted) ?? 0,
        p25: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
        p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
      }
    })
    .sort((a, b) => a.median - b.median)
}

export function buildMonthlyTrendData(records: TimelineRecord[]) {
  const counts: Record<string, { OPT: number; STEM: number }> = {}

  for (const r of records) {
    if (!r.date_applied) continue
    const ym = toYearMonth(r.date_applied)
    if (!counts[ym]) counts[ym] = { OPT: 0, STEM: 0 }
    if (r.normalized_type === 'OPT') counts[ym].OPT++
    else if (r.normalized_type === 'STEM') counts[ym].STEM++
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, c]) => ({ ym, ...c }))
}
