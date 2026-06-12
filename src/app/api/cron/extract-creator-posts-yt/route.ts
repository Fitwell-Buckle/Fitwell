import { NextRequest, NextResponse } from "next/server";
import { extractYouTubePosts } from "@/lib/creators/extract-posts";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

// ~2 YT quota units per tracked channel; 500 channels ≈ 60–120s of polling.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await extractYouTubePosts();
    return NextResponse.json({
      status: summary.skipped ? "skipped" : "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Creator YT post extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
