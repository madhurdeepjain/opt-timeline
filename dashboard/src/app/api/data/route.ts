import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Revalidate at most once per hour so Vercel edge doesn't serve a stale file
export const revalidate = 3600;

export async function GET() {
  try {
    const path = join(process.cwd(), "data", "timeline.csv");
    const csv = readFileSync(path, "utf-8");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Data not found. Run the scraper first." },
      { status: 404 }
    );
  }
}
