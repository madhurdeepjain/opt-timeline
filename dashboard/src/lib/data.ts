import type { TimelineRecord, FilterState, DashboardStats } from './types'
import { median, toYearMonth } from './utils'

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
