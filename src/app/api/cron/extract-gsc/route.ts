import { NextRequest, NextResponse } from "next/server";
import { extractGSCDaily } from "@/lib/analytics/gsc";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // GSC data has 2-3 day lag
    const date = new Date();
    date.setDate(date.getDate() - 3);

    const rows = await extractGSCDaily(date);
    return NextResponse.json({
      status: "ok",
      date: date.toISOString().split("T")[0],
      rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GSC extraction failed:", error);
    return NextResponse.json(
      { error: "Extraction failed", message: String(error) },
      { status: 500 },
    );
  }
}
