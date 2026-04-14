"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TimelineRecord } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ExternalLink, ChevronUp, ChevronDown, Download } from "lucide-react";

type SortKey = "date_applied" | "date_approved" | "days_to_approval" | "normalized_type";

const EXPORT_COLUMNS: { key: keyof TimelineRecord; label: string }[] = [
  { key: "normalized_type",           label: "Type" },
  { key: "premium_processing",        label: "Premium Processing" },
  { key: "date_applied",              label: "Date Applied" },
  { key: "rfie_date",                 label: "RFIE Date" },
  { key: "biometrics_requested_date", label: "Biometrics Requested" },
  { key: "biometrics_completed_date", label: "Biometrics Completed" },
  { key: "biometrics_location",       label: "Biometrics Location" },
  { key: "noid",                      label: "NOID" },
  { key: "noid_date",                 label: "NOID Date" },
  { key: "date_approved",             label: "Date Approved" },
  { key: "date_card_produced",        label: "Card Produced" },
  { key: "date_card_shipped",         label: "Card Shipped" },
  { key: "date_card_received",        label: "Card Received" },
  { key: "days_to_approval",          label: "Days to Approval" },
  { key: "days_to_card",              label: "Days to Card" },
  { key: "country_of_citizenship",    label: "Country" },
  { key: "subreddit",                 label: "Subreddit" },
  { key: "permalink",                 label: "Link" },
];

function exportCSV(records: TimelineRecord[]) {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = EXPORT_COLUMNS.map((c) => escape(c.label)).join(",");
  const rows = records.map((r) =>
    EXPORT_COLUMNS.map((c) => escape(r[c.key] as string)).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opt-timeline-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sortRecords(records: TimelineRecord[], key: SortKey, asc: boolean) {
  return [...records].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

export function DataTable({ records }: { records: TimelineRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date_applied");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const sorted = sortRecords(records, sortKey, asc);
  const totalPages = Math.ceil(sorted.length / pageSize);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(false);
    }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  function SortTh({ col, label }: { col: SortKey; label: string }) {
    return (
      <th
        className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <SortIcon col={col} />
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={() => exportCSV(sorted)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Export {sorted.length.toLocaleString()} records
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <SortTh col="normalized_type" label="Type" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">PP</th>
              <SortTh col="date_applied" label="Applied" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Biometrics</th>
              <SortTh col="date_approved" label="Approved" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Card Received</th>
              <SortTh col="days_to_approval" label="Days" />
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Source</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <AnimatePresence mode="wait">
              {visible.map((r) => (
                <motion.tr
                  key={r.comment_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="hover:bg-muted/20"
                >
                  <td className="px-3 py-2.5">
                    <Badge variant={r.normalized_type === "STEM" ? "secondary" : "outline"}>
                      {r.normalized_type || "?"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.premium_processing === "true" ? (
                      <Badge variant="success">PP</Badge>
                    ) : r.premium_processing === "false" ? (
                      <Badge variant="outline">Std</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatDate(r.date_applied)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatDate(r.biometrics_completed_date)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {r.date_approved ? (
                      <span className="text-emerald-400">{formatDate(r.date_approved)}</span>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {r.date_card_received ? formatDate(r.date_card_received) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-xs">
                    {r.days_to_approval ? (
                      <span className="text-sky-400">{r.days_to_approval}d</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">r/{r.subreddit}</td>
                  <td className="px-3 py-2.5">
                    <a
                      href={r.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
