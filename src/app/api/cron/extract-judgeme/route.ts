import { NextRequest, NextResponse } from "next/server";
import { extractJudgeme } from "@/lib/judgeme/extract";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await extractJudgeme();
    return NextResponse.json({
      status: "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Judge.me extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
