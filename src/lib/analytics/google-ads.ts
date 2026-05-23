import { db } from "@/lib/db";
import { googleAdsDaily } from "@/lib/schema";
import { getGoogleAccessToken } from "@/lib/google/auth";
import { sql } from "drizzle-orm";

const ADS_SCOPES = ["https://www.googleapis.com/auth/adwords"];

interface GoogleAdsRow {
  campaign: { name: string; id: string };
  adGroup: { name: string; id: string };
  adGroupAd: {
    ad: {
      id: string;
      name: string;
      finalUrls: string[];
    };
  };
  metrics: {
    impressions: string;
    clicks: string;
    costMicros: string;
    conversions: number;
    conversionsValue: number;
  };
  segments: {
    date: string;
    adNetworkType: string;
  };
}

const PLATFORM_MAP: Record<string, string> = {
  SEARCH: "search",
  CONTENT: "display",
  YOUTUBE_WATCH: "youtube",
  YOUTUBE_SEARCH: "youtube",
  SHOPPING: "shopping",
  MIXED: "mixed",
};

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
      ad_group.name,
      ad_group.id,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.final_urls,
      segments.date,
      segments.ad_network_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date = '${date.toISOString().split("T")[0]}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
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

  await db
    .delete(googleAdsDaily)
    .where(
      sql`${googleAdsDaily.date}::date = ${date.toISOString().split("T")[0]}::date`,
    );

  const values = rows.map((row) => {
    const finalUrls = row.adGroupAd?.ad?.finalUrls ?? [];
    let landingUrl: string | null = null;
    if (finalUrls.length > 0) {
      try {
        landingUrl = new URL(finalUrls[0]).pathname;
      } catch {
        landingUrl = finalUrls[0];
      }
    }

    const networkType = (row.segments.adNetworkType ?? "").toUpperCase();
    const platform = PLATFORM_MAP[networkType] ?? networkType.toLowerCase();

    return {
      date,
      campaignName: row.campaign.name,
      campaignId: row.campaign.id,
      adGroupName: row.adGroup.name,
      adGroupId: row.adGroup.id,
      adName: row.adGroupAd.ad.name ?? null,
      adId: row.adGroupAd.ad.id,
      platform,
      landingUrl,
      impressions: parseInt(row.metrics.impressions) || 0,
      clicks: parseInt(row.metrics.clicks) || 0,
      cost: Math.round(parseInt(row.metrics.costMicros) / 10000),
      conversions: row.metrics.conversions || 0,
      conversionValue: row.metrics.conversionsValue || 0,
    };
  });

  for (let i = 0; i < values.length; i += 500) {
    await db.insert(googleAdsDaily).values(values.slice(i, i + 500));
  }

  return values.length;
}
