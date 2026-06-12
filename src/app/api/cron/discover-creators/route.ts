import { NextRequest, NextResponse } from "next/server";
import { discoverYouTubeCreators } from "@/lib/creators/discover";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await discoverYouTubeCreators();
    return NextResponse.json({
      status: summary.skipped ? "skipped" : "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Creator discovery failed:", error);
    return NextResponse.json(
      { error: "Discovery failed", message: String(error) },
      { status: 500 },
    );
  }
}
