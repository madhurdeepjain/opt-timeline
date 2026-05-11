'use client'

import { useState, useMemo } from 'react'
import type { TimelineRecord } from '@/lib/types'
import { formatDate, cn } from '@/lib/utils'
import { Download, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react'
import Papa from 'papaparse'

type SortKey =
  | 'normalized_type'
  | 'premium_processing'
  | 'date_applied'
  | 'biometrics_requested_date'
  | 'biometrics_completed_date'
  | 'date_approved'
  | 'date_card_produced'
  | 'date_card_received'
  | 'days_to_approval'
  | 'days_to_card'
  | 'country_of_citizenship'
  | 'created_utc'
type SortDir = 'asc' | 'desc'


function exportCSV(records: TimelineRecord[]) {
  const exportable = records.map((r) => ({
    type: r.normalized_type,
    date_applied: r.date_applied ?? '',
    days_to_approval: r.days_to_approval ?? '',
    days_to_card: r.days_to_card ?? '',
    premium_processing: r.premium_processing,
    date_approved: r.date_approved ?? '',
    date_card_received: r.date_card_received ?? '',
    country_of_citizenship: r.country_of_citizenship ?? '',
    biometrics_completed_date: r.biometrics_completed_date ?? '',
    subreddit: r.subreddit,
    permalink: r.permalink,
  }))
  const csv = Papa.unparse(exportable)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `opt-timeline-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return null
  return sortDir === 'asc' ? (
    <ChevronUp size={12} style={{ color: 'var(--ink)' }} />
  ) : (
    <ChevronDown size={12} style={{ color: 'var(--ink)' }} />
  )
}

export default function DataTable({ records }: { records: TimelineRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date_applied')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      let av: string | number | null = a[sortKey] === true ? 1 : a[sortKey] === false ? 0 : (a[sortKey] as string | number | null)
      let bv: string | number | null = b[sortKey] === true ? 1 : b[sortKey] === false ? 0 : (b[sortKey] as string | number | null)
      if (av === null || av === undefined) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv === null || bv === undefined) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [records, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  function Th({ col, label }: { col: SortKey; label: string }) {
    return (
      <th
        className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap"
        style={{ color: 'var(--mute)' }}
        onClick={() => handleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        </span>
      </th>
    )
  }

  return (
    <div
      className="rounded-md border"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--mute)' }}>
          Community Data
        </p>
        <h3 className="text-base font-bold flex-1" style={{ color: 'var(--ink)' }}>
          All Records
        </h3>
        <button
          onClick={() => exportCSV(sorted)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors cursor-pointer"
          style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--ink)' }}
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
              <Th col="normalized_type" label="Type" />
              <Th col="premium_processing" label="Premium" />
              <Th col="date_applied" label="Applied" />
              <Th col="biometrics_requested_date" label="Bio Requested" />
              <Th col="biometrics_completed_date" label="Bio Completed" />
              <Th col="date_approved" label="Approved" />
              <Th col="date_card_produced" label="Card Produced" />
              <Th col="date_card_received" label="Card Received" />
              <Th col="days_to_approval" label="Days → Approval" />
              <Th col="days_to_card" label="Days → Card" />
              <Th col="country_of_citizenship" label="Citizenship" />
              <Th col="created_utc" label="Posted" />
              <th
                className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--mute)' }}
              >
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r, i) => (
              <tr
                key={r.comment_id}
                style={{
                  borderBottom: i < pageData.length - 1 ? '1px solid var(--hairline-soft)' : undefined,
                }}
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
                    )}
                    style={{
                      backgroundColor:
                        r.normalized_type === 'STEM' ? '#fff3d1' : 'var(--surface-soft)',
                      color: r.normalized_type === 'STEM' ? '#a07000' : 'var(--ink)',
                    }}
                  >
                    {r.normalized_type || r.type || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {r.premium_processing === true ? (
                    <span style={{ color: 'var(--primary-pressed)', fontWeight: 600 }}>Yes</span>
                  ) : r.premium_processing === false ? (
                    'No'
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.date_applied)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.biometrics_requested_date)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.biometrics_completed_date)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.date_approved)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.date_card_produced)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {formatDate(r.date_card_received)}
                </td>
                <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {r.days_to_approval != null ? `${r.days_to_approval}d` : '—'}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {r.days_to_card != null ? `${r.days_to_card}d` : '—'}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {r.country_of_citizenship ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--body)' }}>
                  {r.created_utc
                    ? new Date(r.created_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {r.permalink && (
                    <a
                      href={`${r.permalink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--mute)' }}
                      className="hover:opacity-70 transition-opacity"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  className="px-4 py-12 text-center text-sm"
                  style={{ color: 'var(--mute)' }}
                >
                  No records match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        className="flex items-center justify-between px-6 py-3 border-t"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--mute)' }}>
            {sorted.length.toLocaleString()} records
            {totalPages > 1 && ` · page ${page + 1} of ${totalPages}`}
          </span>
          <div className="flex items-center gap-1">
            {([10, 25, 50] as const).map((n) => (
              <button
                key={n}
                onClick={() => { setPageSize(n); setPage(0) }}
                className="px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors"
                style={{
                  backgroundColor: pageSize === n ? 'var(--ink)' : 'var(--surface-soft)',
                  color: pageSize === n ? '#fff' : 'var(--mute)',
                }}
              >
                {n}
              </button>
            ))}
            <span className="text-xs" style={{ color: 'var(--mute)' }}>per page</span>
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded-md text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default"
              style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--ink)' }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1 rounded-md text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default"
              style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--ink)' }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
