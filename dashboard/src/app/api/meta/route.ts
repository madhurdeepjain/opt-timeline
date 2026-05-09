import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'meta.json'), 'utf-8')
    const meta = JSON.parse(raw)
    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ scraped_at: null })
  }
}
