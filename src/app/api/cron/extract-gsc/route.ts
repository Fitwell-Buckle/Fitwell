import { NextRequest, NextResponse } from "next/server";
import { extractGSCDaily } from "@/lib/analytics/gsc";
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

    // GSC data has 2-3 day lag, so offset starts at 3
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 3 - i);
      totalRows += await extractGSCDaily(date);
    }

    return NextResponse.json({
      status: "ok",
      days,
      rows: totalRows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GSC extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
