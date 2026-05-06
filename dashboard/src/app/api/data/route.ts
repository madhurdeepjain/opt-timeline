import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import Papa from 'papaparse'
import type { TimelineRecord } from '@/lib/types'

export const dynamic = 'force-dynamic'

function parseBool(v: string): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function parseNum(v: string): number | null {
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function parseStr(v: string): string | null {
  return v && v.trim() !== '' ? v.trim() : null
}

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'data', 'timeline.csv')
    const csvText = readFileSync(csvPath, 'utf-8')

    const result = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    })

    const records: TimelineRecord[] = result.data.map((row) => ({
      comment_id: row.comment_id ?? '',
      author: row.author ?? '',
      created_utc: row.created_utc ?? '',
      subreddit: row.subreddit ?? '',
      permalink: row.permalink ?? '',
      type: row.type ?? '',
      normalized_type: row.normalized_type ?? '',
      premium_processing: parseBool(row.premium_processing),
      date_applied: parseStr(row.date_applied),
      rfie_date: parseStr(row.rfie_date),
      biometrics_requested_date: parseStr(row.biometrics_requested_date),
      biometrics_completed_date: parseStr(row.biometrics_completed_date),
      biometrics_location: parseStr(row.biometrics_location),
      noid: parseBool(row.noid),
      noid_date: parseStr(row.noid_date),
      date_approved: parseStr(row.date_approved),
      date_card_produced: parseStr(row.date_card_produced),
      date_card_shipped: parseStr(row.date_card_shipped),
      date_card_received: parseStr(row.date_card_received),
      country_of_citizenship: parseStr(row.country_of_citizenship),
      days_to_approval: parseNum(row.days_to_approval),
      days_to_card: parseNum(row.days_to_card),
      raw_text: row.raw_text ?? '',
      parse_errors: [],
    }))

    return NextResponse.json(records)
  } catch (err) {
    console.error('Failed to load timeline CSV:', err)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}
