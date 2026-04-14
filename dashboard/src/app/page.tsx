"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Github } from "lucide-react";

import { TimelineRecord, FilterState } from "@/lib/types";
import {
  fetchRecords,
  applyFilters,
  computeStats,
  processingHistogramData,
  submissionTrendData,
  premiumComparisonData,
  funnelData,
  typeBreakdownData,
} from "@/lib/data";
import { formatDate } from "@/lib/utils";

import { StatsCards } from "@/components/stats-cards";
import {
  ProcessingTimeChart,
  SubmissionTrendChart,
  TypeBreakdownChart,
  PremiumComparisonChart,
  StatusFunnelChart,
} from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { Filters } from "@/components/filters";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_FILTERS: FilterState = {
  normalizedType: "all",
  premiumProcessing: "all",
  subreddit: "all",
};

export default function DashboardPage() {
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecords();
      setRecords(data);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = applyFilters(records, filters);
  const stats = computeStats(filtered);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              OPT / STEM OPT Timeline Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Community data from r/f1visa &amp; r/USCIS megathreads
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastFetch && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Fetched {lastFetch.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            {error.includes("404") && (
              <p className="mt-1 text-xs opacity-80">
                No data found — run the scraper first and copy the output to{" "}
                <code>dashboard/data/timeline.csv</code>.
              </p>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72" />)}
            </div>
          </div>
        )}

        {/* Dashboard content */}
        {!loading && !error && records.length > 0 && (
          <>
            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-end gap-4 justify-between"
            >
              <Filters filters={filters} onChange={(f) => { setFilters(f); }} />
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length.toLocaleString()} of {records.length.toLocaleString()} records
              </p>
            </motion.div>

            {/* Stats cards */}
            <StatsCards stats={stats} />

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ProcessingTimeChart data={processingHistogramData(filtered)} />
              <TypeBreakdownChart data={typeBreakdownData(filtered)} />
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SubmissionTrendChart data={submissionTrendData(filtered)} />
              <PremiumComparisonChart data={premiumComparisonData(filtered)} />
            </div>

            {/* Funnel — full width */}
            <StatusFunnelChart data={funnelData(filtered)} />

            {/* Data table */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold">Individual Records</h2>
              <DataTable records={filtered} />
            </section>
          </>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            No records loaded. Run the scraper to populate data.
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16 py-6 text-center text-xs text-muted-foreground">
        Data sourced from community Reddit posts — not official USCIS data.
        <a
          href="https://github.com"
          className="ml-3 inline-flex items-center gap-1 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Github className="h-3.5 w-3.5" /> GitHub
        </a>
      </footer>
    </div>
  );
}
