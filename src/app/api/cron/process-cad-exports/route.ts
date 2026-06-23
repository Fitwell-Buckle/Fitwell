import { NextRequest, NextResponse } from "next/server";
import { processPendingExports } from "@/lib/cad/service";
import { verifyCronOrAdmin } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

// Completes CAD models waiting on their Autodesk export email: finds the email
// in the requester's inbox, downloads the STL, converts to GLB.
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await processPendingExports();
    return NextResponse.json({
      status: "ok",
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("process-cad-exports failed:", error);
    return NextResponse.json(
      { error: "Processing failed", message: String(error) },
      { status: 500 },
    );
  }
}
