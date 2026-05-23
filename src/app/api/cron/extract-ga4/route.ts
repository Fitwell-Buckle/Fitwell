import { NextRequest, NextResponse } from "next/server";
import { extractGA4Daily } from "@/lib/analytics/ga4";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const days = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "1"), 1),
      365,
    );
    let totalRows = 0;

    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      totalRows += await extractGA4Daily(date);
    }

    return NextResponse.json({
      status: "ok",
      days,
      rows: totalRows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GA4 extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
