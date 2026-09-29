'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from 'recharts'
import type { TimelineRecord } from '@/lib/types'
import { buildCountryData, quantileCI, sortedWaits, MIN_N } from '@/lib/data'
import { windowPhrase } from '@/components/wait-window-picker'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function CountryBreakdown({ recent, waitWindow }: { recent: TimelineRecord[]; waitWindow: number | null }) {
  const [expanded, setExpanded] = useState(false)

  const data = buildCountryData(recent)
  const overallMedian = quantileCI(sortedWaits(recent), 0.5)?.value ?? null
  const totalCountryRecords = recent.filter((r) => r.country_of_citizenship).length

  if (data.length < 2) return null

  const domainMax = Math.ceil(Math.max(...data.map((d) => d.median), overallMedian ?? 0) * 1.3 / 10) * 10

  return (
    <div
      className="rounded-md border"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-6 py-4 cursor-pointer"
      >
        <div className="text-left">
          <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--mute)' }}>
            Country of Citizenship
          </p>
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
            Median wait by country
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: 'var(--mute)' }}>
            {totalCountryRecords} records · {data.length} countries
          </span>
          {expanded ? <ChevronUp size={16} style={{ color: 'var(--mute)' }} /> : <ChevronDown size={16} style={{ color: 'var(--mute)' }} />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 80, left: 16, bottom: 0 }}
              barCategoryGap="28%"
            >
              <XAxis
                type="number"
                domain={[0, domainMax]}
                tick={{ fontSize: 11, fill: 'var(--mute)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}d`}
              />
              <YAxis
                type="category"
                dataKey="country"
                tick={{ fontSize: 12, fill: 'var(--ink)' }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-card)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--ink)',
                }}
                formatter={(_val, _key, item) => {
                  const p = item.payload as { n: number; median: number; p25: number; p75: number }
                  return [`${p.median}d median · ${p.p25}–${p.p75}d range · n=${p.n}`, '']
                }}
              />
              {overallMedian != null && (
                <ReferenceLine
                  x={overallMedian}
                  stroke="var(--hairline)"
                  strokeDasharray="3 3"
                  label={{ value: `overall ${overallMedian}d`, position: 'insideTopRight', fontSize: 9, fill: '#9b9c92' }}
                />
              )}
              <Bar dataKey="median" radius={[0, 3, 3, 0]} barSize={16}>
                {data.map((entry, i) => (
                  <Cell key={i} fill="var(--ink)" />
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
                        {entry.median}d · n={entry.n}
                      </text>
                    )
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            {totalCountryRecords} of {recent.length} cases {windowPhrase(waitWindow)} include country of citizenship. Countries with fewer than {MIN_N} of them are left out.
          </p>
        </div>
      )}
    </div>
  )
}
