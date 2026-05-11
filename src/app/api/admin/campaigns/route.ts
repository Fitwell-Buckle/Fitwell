import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { googleAdsDaily } from "@/lib/schema";
import { sql, sum, count } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await db
    .select({
      campaignName: googleAdsDaily.campaignName,
      impressions: sum(googleAdsDaily.impressions).mapWith(Number),
      clicks: sum(googleAdsDaily.clicks).mapWith(Number),
      cost: sum(googleAdsDaily.cost).mapWith(Number),
      conversions: sql<number>`coalesce(sum(${googleAdsDaily.conversions}), 0)::float`,
    })
    .from(googleAdsDaily)
    .groupBy(googleAdsDaily.campaignName)
    .orderBy(sql`sum(${googleAdsDaily.cost}) desc`);

  return NextResponse.json({ data: campaigns });
}
