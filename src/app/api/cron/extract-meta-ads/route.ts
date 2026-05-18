import { NextRequest, NextResponse } from "next/server";
import { extractMetaAdsDaily } from "@/lib/analytics/meta-ads";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const rows = await extractMetaAdsDaily(yesterday);
    return NextResponse.json({
      status: "ok",
      date: yesterday.toISOString().split("T")[0],
      rows,
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
