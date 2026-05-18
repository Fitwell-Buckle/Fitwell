import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // TODO: Implement PostHog event extraction via PostHog API
    // 1. Query PostHog for daily event counts
    // 2. Aggregate by event name
    // 3. Upsert into posthogDaily table
    return NextResponse.json({
      status: "ok",
      message: "PostHog extraction not yet implemented",
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
