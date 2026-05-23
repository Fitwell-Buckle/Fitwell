import { db } from "@/lib/db";
import { googleAdsDaily } from "@/lib/schema";
import { getGoogleAccessToken } from "@/lib/google/auth";
import { sql } from "drizzle-orm";

const ADS_SCOPES = ["https://www.googleapis.com/auth/adwords"];

interface GoogleAdsRow {
  campaign: { name: string; id: string };
  metrics: {
    impressions: string;
    clicks: string;
    costMicros: string;
    conversions: number;
    conversionsValue: number;
  };
  segments: { date: string };
}

export async function extractGoogleAdsDaily(date: Date): Promise<number> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!customerId || !developerToken) {
    throw new Error("Google Ads credentials not configured");
  }

  const token = await getGoogleAccessToken(ADS_SCOPES);

  const query = `
    SELECT
      campaign.name,
      campaign.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date = '${date.toISOString().split("T")[0]}'
      AND campaign.status != 'REMOVED'
  `;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };

  const res = await fetch(
    `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );

  if (!res.ok) {
    throw new Error(`Google Ads API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as Array<{ results?: GoogleAdsRow[] }>;
  const rows = data.flatMap((batch) => batch.results ?? []);

  if (rows.length === 0) return 0;

  // Delete existing rows for this date, then insert fresh
  await db
    .delete(googleAdsDaily)
    .where(
      sql`${googleAdsDaily.date}::date = ${date.toISOString().split("T")[0]}::date`,
    );

  const values = rows.map((row) => ({
    date,
    campaignName: row.campaign.name,
    campaignId: row.campaign.id,
    impressions: parseInt(row.metrics.impressions) || 0,
    clicks: parseInt(row.metrics.clicks) || 0,
    cost: Math.round(parseInt(row.metrics.costMicros) / 10000), // micros to cents
    conversions: row.metrics.conversions || 0,
    conversionValue: row.metrics.conversionsValue || 0,
  }));

  if (values.length > 0) {
    await db.insert(googleAdsDaily).values(values);
  }

  return values.length;
}
