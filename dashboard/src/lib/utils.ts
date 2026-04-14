import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Group records by ISO week (YYYY-Www) of a date field. */
export function groupByWeek(
  records: { date: string }[]
): { week: string; count: number }[] {
  const map = new Map<string, number>();
  for (const { date } of records) {
    if (!date) continue;
    const d = new Date(date + "T12:00:00Z");
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));
}

/** Bucket an array of numbers into ranges. */
export function histogram(
  values: number[],
  bucketSize = 10,
  max = 200
): { range: string; count: number }[] {
  const buckets: Record<string, number> = {};
  for (const v of values) {
    if (v < 0 || v > max) continue;
    const low = Math.floor(v / bucketSize) * bucketSize;
    const key = `${low}–${low + bucketSize - 1}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([range, count]) => ({ range, count }));
}
