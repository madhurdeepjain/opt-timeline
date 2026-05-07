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

const OPT_COLOR = '#23251d'
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

export function ProcessingTimeChart({ data }: { data: HistogramDatum[] }) {
  return (
    <ChartCard title="Processing Time Distribution" sub="Days to Approval">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="20%" barGap={2}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            width={28}
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
          <Bar dataKey="OPT" fill={OPT_COLOR} radius={[3, 3, 0, 0]} />
          <Bar dataKey="STEM" fill={STEM_COLOR} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
    </ChartCard>
  )
}
