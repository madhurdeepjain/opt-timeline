import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const csvPath = join(process.cwd(), 'data', 'timeline.csv')
    const csv = readFileSync(csvPath, 'utf-8')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Data not found.' }, { status: 404 })
  }
}
