import { NextRequest, NextResponse } from "next/server";
import {
  extractMetaAdsDaily,
  extractMetaAdsetAudience,
} from "@/lib/analytics/meta-ads";
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
    let insightRows = 0;

    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      insightRows += await extractMetaAdsDaily(date);
    }

    // Audience size snapshots — slow-changing, one pass per sync regardless of days
    const audienceRows = await extractMetaAdsetAudience();

    return NextResponse.json({
      status: "ok",
      days,
      insightRows,
      audienceRows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Meta Ads extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
