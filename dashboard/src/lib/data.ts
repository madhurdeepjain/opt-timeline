import type { TimelineRecord, FilterState, DashboardStats, WaitCurvePoint, FunnelStage, MilestonePoint, CountryBreakdown, QuantileEstimate, WaitTrendPoint } from './types'
import { CITIZENSHIP_UNSPECIFIED, SERVICE_CENTER_UNSPECIFIED } from './types'
import { toYearMonth, daysBetween, addDays } from './utils'

// ── Wait-time statistics ──────────────────────────────────────────────────────
// Wait times are only observed for cases that report an approval, so every
// wait statistic here describes *completed* cases, and by default only those
// approved recently (the same convention USCIS uses for its processing times).
// Pending cases can't simply be added in: people tend to come back and post
// when they're approved, so silence after a "pending" post isn't evidence of
// still waiting, and survival-style corrections end up biased too.

/** Smallest sample a quantile is shown for. */
export const MIN_N = 20
/** A quantile also needs this many observations on each side (p90 → n ≥ 50). */
const MIN_TAIL = 5
/** compute_derived in the scraper already drops waits outside 0–730 days. */
const MAX_WAIT_DAYS = 730

function isWait(d: number | null): d is number {
  return typeof d === 'number' && d >= 0 && d <= MAX_WAIT_DAYS
}

/**
 * Quantile q of an ascending-sorted sample (smallest value covering ≥ q of it,
 * so it matches the wait curve), with a distribution-free 95% confidence
 * interval from order statistics. Null when the sample is too small to say.
 */
export function quantileCI(sorted: number[], q: number): QuantileEstimate | null {
  const n = sorted.length
  if (n < MIN_N || n * Math.min(q, 1 - q) < MIN_TAIL - 1e-9) return null
  const h = 1.96 * Math.sqrt(n * q * (1 - q))
  const lo = Math.max(1, Math.floor(n * q - h))
  const hi = Math.min(n, Math.ceil(n * q + h))
  return { value: sorted[Math.ceil(n * q - 1e-9) - 1], lo: sorted[lo - 1], hi: sorted[hi - 1], n }
}

/**
 * Cases with a usable wait time, approved within `windowDays` of `asOf`
 * (the scrape date). `windowDays = null` keeps every approval.
 */
export function recentApprovals(records: TimelineRecord[], windowDays: number | null, asOf: string): TimelineRecord[] {
  const since = windowDays === null ? null : addDays(asOf, -windowDays)
  return records.filter(
    (r) => isWait(r.days_to_approval) && !!r.date_approved && (since === null || r.date_approved > since),
  )
}

export function sortedWaits(records: TimelineRecord[]): number[] {
  return records.map((r) => r.days_to_approval).filter(isWait).sort((a, b) => a - b)
}

/** Premium from the start vs upgraded later vs standard: three different clocks. */
export function processingKind(r: TimelineRecord): 'premium' | 'upgraded' | 'standard' | 'unknown' {
  if (r.pp_upgraded === true) return 'upgraded'
  if (r.premium_processing === true) return 'premium'
  if (r.premium_processing === false) return 'standard'
  return 'unknown'
}

function postIdFromPermalink(permalink: string): string {
  return permalink.split('/comments/')[1]?.split('/')[0] ?? ''
}

export function applyFilters(records: TimelineRecord[], filters: FilterState): TimelineRecord[] {
  return records.filter((r) => {
    if (filters.type === 'OPT' && r.normalized_type !== 'OPT') return false
    if (filters.type === 'STEM' && r.normalized_type !== 'STEM') return false
    if (filters.type === 'unknown' && (r.normalized_type === 'OPT' || r.normalized_type === 'STEM')) return false
    if (filters.premium === 'premium' && !(r.premium_processing === true && r.pp_upgraded !== true)) return false
    if (filters.premium === 'upgraded' && r.pp_upgraded !== true) return false
    if (filters.premium === 'any_premium' && r.premium_processing !== true) return false
    if (filters.premium === 'standard' && r.premium_processing !== false) return false
    if (filters.premium === 'unknown' && r.premium_processing !== null) return false
    if (filters.approved === 'yes' && !r.date_approved) return false
    if (filters.approved === 'no' && !!r.date_approved) return false
    if (filters.cardStatus.length > 0) {
      const stage: 'none' | 'produced' | 'received' = r.date_card_received
        ? 'received'
        : r.date_card_produced
        ? 'produced'
        : 'none'
      if (!filters.cardStatus.includes(stage)) return false
    }
    if (filters.rfie === 'yes' && !r.rfie_date) return false
    if (filters.rfie === 'no' && !!r.rfie_date) return false
    if (filters.banStatus.length > 0) {
      const value = r.ban_status ?? 'unknown'
      if (!filters.banStatus.includes(value)) return false
    }
    if (filters.citizenship.length > 0) {
      const value = r.country_of_citizenship ?? CITIZENSHIP_UNSPECIFIED
      if (!filters.citizenship.includes(value)) return false
    }
    if (filters.serviceCenter.length > 0) {
      const sc = r.service_center ?? SERVICE_CENTER_UNSPECIFIED
      if (!filters.serviceCenter.includes(sc)) return false
    }
    if (filters.threads.length > 0 && !filters.threads.includes(postIdFromPermalink(r.permalink))) return false
    if (filters.appliedDateFrom || filters.appliedDateTo) {
      if (!r.date_applied) return false
      if (filters.appliedDateFrom && r.date_applied < filters.appliedDateFrom) return false
      if (filters.appliedDateTo && r.date_applied > filters.appliedDateTo) return false
    }
    return true
  })
}

export function computeStats(records: TimelineRecord[], recent: TimelineRecord[]): DashboardStats {
  const knownKind = records.filter((r) => processingKind(r) !== 'unknown')
  const anyPremium = knownKind.filter((r) => r.premium_processing === true).length
  const waitsOf = (kind: ReturnType<typeof processingKind>) =>
    quantileCI(sortedWaits(recent.filter((r) => processingKind(r) === kind)), 0.5)

  const appliedDates = records
    .map((r) => r.date_applied)
    .filter((d): d is string => !!d)
    .sort()

  return {
    total: records.length,
    optCount: records.filter((r) => r.normalized_type === 'OPT').length,
    stemCount: records.filter((r) => r.normalized_type === 'STEM').length,
    recentCount: recent.length,
    medianWait: quantileCI(sortedWaits(recent), 0.5),
    medianWaitStandard: waitsOf('standard'),
    medianWaitPremium: waitsOf('premium'),
    medianWaitUpgraded: waitsOf('upgraded'),
    premiumPct: knownKind.length > 0 ? Math.round((anyPremium / knownKind.length) * 100) : 0,
    latestAppliedDate: appliedDates.length > 0 ? appliedDates[appliedDates.length - 1] : null,
  }
}

/** OPT/STEM counts in 30-day wait bins up to `maxDay`, with a final open bin. */
export function buildHistogramData(records: TimelineRecord[], maxDay: number) {
  const bins: { label: string; min: number; max: number }[] = []
  for (let lo = 0; lo < maxDay; lo += 30) bins.push({ label: `${lo}–${lo + 30}`, min: lo, max: lo + 30 })
  bins.push({ label: `${maxDay}+`, min: maxDay, max: Infinity })

  return bins.map(({ label, min, max }) => {
    const inBin = (type: string) =>
      records.filter(
        (r) => r.normalized_type === type && isWait(r.days_to_approval) && r.days_to_approval >= min && r.days_to_approval < max,
      ).length
    return { label, OPT: inBin('OPT'), STEM: inBin('STEM') }
  })
}

/**
 * Share of cases (already filtered to recent approvals) approved within each
 * day, from day 1 to `maxDay`.
 */
export function buildWaitCurve(sorted: number[], maxDay: number): WaitCurvePoint[] {
  if (sorted.length === 0) return []
  const out: WaitCurvePoint[] = []
  let i = 0
  for (let day = 1; day <= maxDay; day++) {
    while (i < sorted.length && sorted[i] <= day) i++
    out.push({ day, pctApproved: Math.round((i / sorted.length) * 100) })
  }
  return out
}

/** Chart range for a wait curve: covers p95, rounded up to 30 days, at least 120. */
export function waitCurveMaxDay(sorted: number[]): number {
  if (sorted.length === 0) return 120
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
  return Math.min(MAX_WAIT_DAYS, Math.max(120, Math.ceil(p95 / 30) * 30))
}

/** Median wait of the cases approved in each calendar month. */
export function buildWaitTrend(records: TimelineRecord[]): WaitTrendPoint[] {
  const byMonth: Record<string, number[]> = {}
  for (const r of records) {
    if (!r.date_approved || !isWait(r.days_to_approval)) continue
    ;(byMonth[toYearMonth(r.date_approved)] ??= []).push(r.days_to_approval)
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, days]) => {
      const sorted = days.sort((a, b) => a - b)
      return {
        ym,
        n: sorted.length,
        median: quantileCI(sorted, 0.5),
        p75: quantileCI(sorted, 0.75),
      }
    })
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

/**
 * Duration of each step, counting only steps that finished after `since`
 * (null = all). Durations outside 0–365 days are treated as typos.
 */
export function buildMilestoneData(records: TimelineRecord[], since: string | null): MilestonePoint[] {
  function stage(from: keyof TimelineRecord, to: keyof TimelineRecord) {
    const sorted = records
      .filter((r) => r[from] && r[to] && (since === null || (r[to] as string) > since))
      .map((r) => daysBetween(r[from] as string, r[to] as string))
      .filter((d) => d >= 0 && d <= 365)
      .sort((a, b) => a - b)
    const med = quantileCI(sorted, 0.5)
    const p25 = quantileCI(sorted, 0.25)
    const p75 = quantileCI(sorted, 0.75)
    return {
      median: med?.value ?? null,
      p25: p25?.value ?? null,
      p75: p75?.value ?? null,
      range: med && p25 && p75 ? ([med.value - p25.value, p75.value - med.value] as [number, number]) : null,
      n: sorted.length,
    }
  }

  return [
    { stage: 'Applied → Bio Notice', ...stage('date_applied', 'biometrics_requested_date'), bioOnly: true },
    { stage: 'Bio Notice → Appt', ...stage('biometrics_requested_date', 'biometrics_completed_date'), bioOnly: true },
    { stage: 'Bio Appt → Approved', ...stage('biometrics_completed_date', 'date_approved'), bioOnly: true },
    { stage: 'Approved → Card Produced', ...stage('date_approved', 'date_card_produced'), bioOnly: false },
    { stage: 'Card Produced → Received', ...stage('date_card_produced', 'date_card_received'), bioOnly: false },
  ]
}

/** Median wait by citizenship, for countries with enough recent approvals. */
export function buildCountryData(recent: TimelineRecord[]): CountryBreakdown[] {
  const groups: Record<string, number[]> = {}
  for (const r of recent) {
    if (!r.country_of_citizenship || !isWait(r.days_to_approval)) continue
    ;(groups[r.country_of_citizenship] ??= []).push(r.days_to_approval)
  }
  const out: CountryBreakdown[] = []
  for (const [country, days] of Object.entries(groups)) {
    const sorted = days.sort((a, b) => a - b)
    const med = quantileCI(sorted, 0.5)
    const p25 = quantileCI(sorted, 0.25)
    const p75 = quantileCI(sorted, 0.75)
    if (!med || !p25 || !p75) continue
    out.push({ country, n: sorted.length, median: med.value, p25: p25.value, p75: p75.value })
  }
  return out.sort((a, b) => a.median - b.median)
}

/**
 * Applications per applied month, one point per calendar month (empty months
 * are zeros, not skipped). Leading months under 2% of the peak are trimmed: a
 * handful of typo'd or out-of-cycle dates otherwise stretch the axis over years
 * of nothing. Recent months stay even when sparse: they're real, just not
 * reported yet.
 */
export function buildMonthlyTrendData(records: TimelineRecord[]) {
  const counts: Record<string, { OPT: number; STEM: number }> = {}
  for (const r of records) {
    if (!r.date_applied) continue
    const c = (counts[toYearMonth(r.date_applied)] ??= { OPT: 0, STEM: 0 })
    if (r.normalized_type === 'OPT') c.OPT++
    else if (r.normalized_type === 'STEM') c.STEM++
  }
  const months = Object.keys(counts).sort()
  if (months.length === 0) return []
  const total = (ym: string) => (counts[ym] ? counts[ym].OPT + counts[ym].STEM : 0)
  const floor = Math.max(...months.map(total)) * 0.02
  const hi = months.length - 1
  let lo = 0
  while (lo < hi && total(months[lo]) < floor) lo++

  const out: { ym: string; OPT: number; STEM: number }[] = []
  for (let ym = months[lo]; ym <= months[hi]; ym = addDays(`${ym}-15`, 31).slice(0, 7)) {
    out.push({ ym, ...(counts[ym] ?? { OPT: 0, STEM: 0 }) })
  }
  return out
}
