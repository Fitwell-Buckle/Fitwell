import { NextRequest, NextResponse } from "next/server";
import { syncRecentOrders, syncRecentCustomers } from "@/lib/shopify/sync";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { flushEvents } from "@/lib/analytics/posthog";

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const days = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "1"), 1),
      365,
    );
    const since = new Date(Date.now() - (days * 24 + 1) * 60 * 60 * 1000);

    // Sequential, not parallel, to respect Shopify rate limits
    const orderResult = await syncRecentOrders(since);
    const customerResult = await syncRecentCustomers(since);
    await flushEvents();

    return NextResponse.json({
      status: "ok",
      orders: orderResult,
      customers: customerResult,
      since: since.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Shopify cron sync failed:", error);
    return NextResponse.json(
      { error: "Sync failed", message: String(error) },
      { status: 500 },
    );
  }
}
