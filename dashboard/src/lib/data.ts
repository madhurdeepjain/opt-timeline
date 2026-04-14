"use client";

import Papa from "papaparse";
import { TimelineRecord, DashboardStats, FilterState } from "./types";
import { avg } from "./utils";

const CSV_PATH = "/data/timeline.csv";

export async function fetchRecords(): Promise<TimelineRecord[]> {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${CSV_PATH}: ${res.status}`);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    Papa.parse<TimelineRecord>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: reject,
    });
  });
}

export function applyFilters(records: TimelineRecord[], filters: FilterState): TimelineRecord[] {
  return records.filter((r) => {
    if (filters.normalizedType !== "all" && r.normalized_type !== filters.normalizedType) return false;
    if (filters.premiumProcessing !== "all" && r.premium_processing !== filters.premiumProcessing) return false;
    if (filters.subreddit !== "all" && r.subreddit !== filters.subreddit) return false;
    return true;
  });
}

export function computeStats(records: TimelineRecord[]): DashboardStats {
  const approved = records.filter((r) => r.date_approved);
  const daysToApproval = approved
    .map((r) => parseInt(r.days_to_approval))
    .filter((n) => !isNaN(n) && n >= 0);
  const daysToCard = records
    .filter((r) => r.date_card_received)
    .map((r) => parseInt(r.days_to_card))
    .filter((n) => !isNaN(n) && n >= 0);

  const sortedDates = records
    .map((r) => r.created_utc)
    .filter(Boolean)
    .sort();

  return {
    total: records.length,
    approved: approved.length,
    pending: records.filter((r) => !r.date_approved).length,
    avgDaysToApproval: avg(daysToApproval),
    avgDaysToCard: avg(daysToCard),
    optCount: records.filter((r) => r.normalized_type === "OPT").length,
    stemCount: records.filter((r) => r.normalized_type === "STEM").length,
    premiumCount: records.filter((r) => r.premium_processing === "true").length,
    standardCount: records.filter((r) => r.premium_processing === "false").length,
    lastUpdated: sortedDates.length ? sortedDates[sortedDates.length - 1] : null,
  };
}

/** Processing time histogram data (days_to_approval). */
export function processingHistogramData(records: TimelineRecord[]) {
  const buckets: Record<string, { opt: number; stem: number }> = {};
  for (const r of records) {
    const days = parseInt(r.days_to_approval);
    if (isNaN(days) || days < 0 || days > 300) continue;
    const low = Math.floor(days / 10) * 10;
    const key = `${low}–${low + 9}`;
    if (!buckets[key]) buckets[key] = { opt: 0, stem: 0 };
    if (r.normalized_type === "STEM") buckets[key].stem++;
    else buckets[key].opt++;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([range, v]) => ({ range, ...v, total: v.opt + v.stem }));
}

/** Weekly submission counts for a line chart. */
export function submissionTrendData(records: TimelineRecord[]) {
  const map = new Map<string, { opt: number; stem: number }>();
  for (const r of records) {
    const date = r.date_applied;
    if (!date) continue;
    const d = new Date(date + "T12:00:00Z");
    // Round to Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const key = monday.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { opt: 0, stem: 0 });
    const entry = map.get(key)!;
    if (r.normalized_type === "STEM") entry.stem++;
    else entry.opt++;
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, ...v, total: v.opt + v.stem }));
}

/** Premium vs standard average processing times. */
export function premiumComparisonData(records: TimelineRecord[]) {
  const groups: Record<string, number[]> = {
    "Premium": [],
    "Standard": [],
  };
  for (const r of records) {
    const days = parseInt(r.days_to_approval);
    if (isNaN(days) || days < 0) continue;
    if (r.premium_processing === "true") groups["Premium"].push(days);
    else if (r.premium_processing === "false") groups["Standard"].push(days);
  }
  return Object.entries(groups).map(([label, vals]) => ({
    label,
    avgDays: avg(vals) ?? 0,
    count: vals.length,
  }));
}

/** Application funnel — how many records have each stage completed. */
export function funnelData(records: TimelineRecord[]) {
  const n = records.length;
  return [
    { stage: "Applied", count: records.filter((r) => r.date_applied).length },
    { stage: "Biometrics", count: records.filter((r) => r.biometrics_completed_date).length },
    { stage: "Approved", count: records.filter((r) => r.date_approved).length },
    { stage: "Card Produced", count: records.filter((r) => r.date_card_produced).length },
    { stage: "Card Received", count: records.filter((r) => r.date_card_received).length },
  ];
}

/** Type breakdown for pie-style chart. */
export function typeBreakdownData(records: TimelineRecord[]) {
  const opt = records.filter((r) => r.normalized_type === "OPT").length;
  const stem = records.filter((r) => r.normalized_type === "STEM").length;
  return [
    { name: "OPT", value: opt },
    { name: "STEM OPT", value: stem },
  ];
}
