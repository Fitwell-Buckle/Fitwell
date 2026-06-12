import { NextRequest, NextResponse } from "next/server";
import { refreshYouTubeStats } from "@/lib/creators/refresh-stats";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

// ~4 quota units + 3 API round-trips per channel.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await refreshYouTubeStats();
    return NextResponse.json({
      status: summary.skipped ? "skipped" : "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Creator stats refresh failed:", error);
    return NextResponse.json(
      { error: "Refresh failed", message: String(error) },
      { status: 500 },
    );
  }
}
