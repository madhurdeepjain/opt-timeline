'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts'
import { formatYearMonth } from '@/lib/utils'
import type { WaitTrendPoint } from '@/lib/types'
import { MIN_N } from '@/lib/data'
import { windowPhrase } from '@/components/wait-window-picker'

const OPT_COLOR = '#5b9bd5'
const STEM_COLOR = '#f7a501'

export function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-md border p-6 flex flex-col gap-4"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--mute)' }}>
          {sub}
        </p>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

interface HistogramDatum {
  label: string
  OPT: number
  STEM: number
}

export function ProcessingTimeChart({ data, waitWindow, n }: { data: HistogramDatum[]; waitWindow: number | null; n: number }) {
  const hasOPT = data.some((d) => d.OPT > 0)
  const hasSTEM = data.some((d) => d.STEM > 0)

  return (
    <ChartCard title="Processing Time Distribution" sub="Days to approval">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="20%" barGap={2}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            width={28}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--hairline)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--ink)',
            }}
            cursor={{ fill: 'var(--surface-soft)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'var(--mute)', paddingTop: '8px' }}
          />
          {hasOPT && <Bar dataKey="OPT" fill={OPT_COLOR} radius={[3, 3, 0, 0]} />}
          {hasSTEM && <Bar dataKey="STEM" fill={STEM_COLOR} radius={[3, 3, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        {n} cases {windowPhrase(waitWindow)}, in 30-day bins.
      </p>
    </ChartCard>
  )
}

interface TrendDatum {
  ym: string
  OPT: number
  STEM: number
}

export function MonthlyTrendChart({ data }: { data: TrendDatum[] }) {
  const formatted = data.map((d) => ({ ...d, month: formatYearMonth(d.ym) }))

  const hasOPT = data.some((d) => d.OPT > 0)
  const hasSTEM = data.some((d) => d.STEM > 0)

  return (
    <ChartCard title="Monthly Submissions" sub="Application Trend">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            width={28}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--hairline)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--ink)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'var(--mute)', paddingTop: '8px' }}
          />
          {hasOPT && (
            <Line
              type="monotone"
              dataKey="OPT"
              stroke={OPT_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
          {hasSTEM && (
            <Line
              type="monotone"
              dataKey="STEM"
              stroke={STEM_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        By month applied. Recent months keep filling in as people post their timelines.
      </p>
    </ChartCard>
  )
}

export function WaitTrendChart({ data }: { data: WaitTrendPoint[] }) {
  // Start at the first month with enough approvals to plot.
  const first = data.findIndex((d) => d.median !== null)
  const rows = data.slice(Math.max(0, first)).map((d) => ({
    month: formatYearMonth(d.ym),
    n: d.n,
    Median: d.median?.value ?? null,
    '75th percentile': d.p75?.value ?? null,
  }))
  if (!rows.some((r) => r.Median !== null)) return null

  return (
    <ChartCard title="Is it getting faster?" sub="Wait of cases approved each month">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--mute)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            width={36}
            domain={[0, 'auto']}
            tickFormatter={(v) => `${v}d`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--hairline)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--ink)',
            }}
            formatter={(val) => (val == null ? '—' : `${val}d`)}
            labelFormatter={(label, payload) => {
              const n = payload?.[0]?.payload?.n
              return n != null ? `${label} · ${n} approvals` : label
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--mute)', paddingTop: '8px' }} />
          <Line type="monotone" dataKey="Median" stroke="var(--ink)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls={false} />
          <Line type="monotone" dataKey="75th percentile" stroke={STEM_COLOR} strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        Days from applying to approval, grouped by the month of approval. Months with fewer than {MIN_N} approvals are left out.
      </p>
    </ChartCard>
  )
}
