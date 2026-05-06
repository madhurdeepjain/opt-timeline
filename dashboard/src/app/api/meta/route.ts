import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const revalidate = 3600

export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'meta.json'), 'utf-8')
    const meta = JSON.parse(raw)
    return NextResponse.json(meta, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json({ scraped_at: null })
  }
}
