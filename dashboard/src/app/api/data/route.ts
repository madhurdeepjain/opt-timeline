import { NextResponse } from 'next/server'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

export const revalidate = 3600

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'data', 'timeline.csv')
    const csv = readFileSync(csvPath, 'utf-8')
    const mtime = statSync(csvPath).mtime
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Data-Updated': mtime.toISOString().slice(0, 10),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Data not found.' }, { status: 404 })
  }
}
