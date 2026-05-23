import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { extractPostHogDaily } from "@/lib/analytics/posthog-extract";

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
      date.setUTCDate(date.getUTCDate() - i);
      totalRows += await extractPostHogDaily(date);
    }

    return NextResponse.json({
      status: "ok",
      days,
      rows: totalRows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PostHog extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
