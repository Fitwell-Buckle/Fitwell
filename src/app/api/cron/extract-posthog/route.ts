import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { extractPostHogDaily } from "@/lib/analytics/posthog-extract";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Extract yesterday (UTC) — today is still accumulating.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const rows = await extractPostHogDaily(yesterday);
    return NextResponse.json({
      status: "ok",
      date: yesterday.toISOString().split("T")[0],
      rows,
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
