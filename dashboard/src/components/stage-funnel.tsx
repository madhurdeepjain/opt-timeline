'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import type { TimelineRecord } from '@/lib/types'
import { buildFunnelData } from '@/lib/data'
import { ChartCard } from '@/components/charts'

export default function StageFunnel({ records }: { records: TimelineRecord[] }) {
  const data = buildFunnelData(records)

  if (data.length === 0) return null

  const total = data[0]?.count ?? 0
  const bioPct = data[1]?.pct ?? 0
  const bioNote = total === 0 ? null
    : bioPct >= 60 ? `${bioPct}% of cases in this view required a biometrics appointment.`
    : bioPct >= 30 ? `${bioPct}% of cases required biometrics — this varies by policy period and service center.`
    : `Only ${bioPct}% of cases required biometrics — it was waived for most in this period.`

  return (
    <ChartCard title="How many cases reach each stage" sub="Milestone Funnel">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 100, left: 16, bottom: 0 }}
          barCategoryGap="28%"
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="stage"
            tick={{ fontSize: 12, fill: 'var(--ink)' }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const e = payload[0].payload as { stage: string; count: number; pct: number }
              return (
                <div style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: '6px', fontSize: '12px', padding: '8px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{e.stage}</div>
                  <div style={{ color: 'var(--mute)' }}>{e.count.toLocaleString()} records · {e.pct}%</div>
                </div>
              )
            }}
          />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={18}>
            {data.map((entry, i) => (
              <Cell key={i} fill={['#f0b429', '#e07820', '#b8cf5a', '#4da35e', '#2e7d46'][i] ?? '#4da35e'} />
            ))}
            <LabelList
              content={(props) => {
                const { x, y, width, height, index } = props as {
                  x: number; y: number; width: number; height: number; index: number
                }
                const entry = data[index]
                if (!entry) return null
                return (
                  <text x={x + width + 8} y={y + height / 2 + 4} fontSize={11} fill="var(--mute)">
                    {entry.count.toLocaleString()} · {entry.pct}%
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        {bioNote} Card counts are a lower bound — only applicants who received their card tend to report it.
      </p>
    </ChartCard>
  )
}
