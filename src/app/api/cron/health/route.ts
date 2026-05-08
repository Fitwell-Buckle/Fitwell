import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Record<string, boolean> = {};

  // Check DB connection
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Check Shopify API reachability
  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
    if (domain && token) {
      const res = await fetch(
        `https://${domain}/admin/api/2024-10/shop.json`,
        { headers: { "X-Shopify-Access-Token": token } },
      );
      checks.shopify = res.ok;
    } else {
      checks.shopify = false;
    }
  } catch {
    checks.shopify = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  return NextResponse.json({
    status: allHealthy ? "healthy" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
}
