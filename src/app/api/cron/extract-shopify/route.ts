import { NextRequest, NextResponse } from "next/server";
import { syncOrders, syncCustomers } from "@/lib/shopify/sync";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [orderResult, customerResult] = await Promise.all([
      syncOrders(),
      syncCustomers(),
    ]);

    return NextResponse.json({
      status: "ok",
      orders: orderResult,
      customers: customerResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Shopify sync failed:", error);
    return NextResponse.json(
      { error: "Sync failed", message: String(error) },
      { status: 500 },
    );
  }
}
