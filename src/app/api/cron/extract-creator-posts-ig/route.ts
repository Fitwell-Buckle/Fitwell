import { NextRequest, NextResponse } from "next/server";
import { extractInstagramPosts } from "@/lib/creators/extract-posts";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

// One synchronous Apify actor run per cycle (≤50 profiles).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await extractInstagramPosts();
    return NextResponse.json({
      status: summary.skipped ? "skipped" : "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Creator IG post extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
