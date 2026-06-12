import { NextRequest, NextResponse } from "next/server";
import { runCreatorActions } from "@/lib/creators/actions";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runCreatorActions();
    return NextResponse.json({
      status: "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Creator actions failed:", error);
    return NextResponse.json(
      { error: "Creator actions failed", message: String(error) },
      { status: 500 },
    );
  }
}
