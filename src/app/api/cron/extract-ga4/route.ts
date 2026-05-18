import { NextRequest, NextResponse } from "next/server";
import { extractGA4Daily } from "@/lib/analytics/ga4";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Extract yesterday's data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const rows = await extractGA4Daily(yesterday);
    return NextResponse.json({
      status: "ok",
      date: yesterday.toISOString().split("T")[0],
      rows,
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
