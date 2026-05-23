import { db } from "@/lib/db";
import { googleAdsDaily, googleAdsAdGroupDaily } from "@/lib/schema";
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

// ── Ad-group impression share ──────────────────────────────────────
// Impression share is only reported FROM ad_group (and above), not ad_group_ad.
// Two queries: ad-group level for impression share / rank-lost / absolute-top,
// and campaign level for budget-lost (which is campaign-scoped because budgets
// are set at the campaign, so the API refuses it FROM ad_group). The campaign
// value is replicated across each of that campaign's ad-groups so a single
// table row carries everything needed for the tooltip.

interface GoogleAdGroupRow {
  campaign: { id: string; name: string };
  adGroup: { id: string; name: string };
  metrics: {
    impressions: string;
    searchImpressionShare?: number;
    searchRankLostImpressionShare?: number;
    searchAbsoluteTopImpressionShare?: number;
  };
  segments: {
    date: string;
    adNetworkType: string;
  };
}

interface GoogleCampaignRow {
  campaign: { id: string };
  metrics: {
    searchBudgetLostImpressionShare?: number;
  };
}

async function runGAQL<T>(
  query: string,
  customerId: string,
  token: string,
  developerToken: string,
): Promise<T[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    throw new Error(`Google Ads API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{ results?: T[] }>;
  return data.flatMap((batch) => batch.results ?? []);
}

export async function extractGoogleAdsAdGroupDaily(
  date: Date,
): Promise<number> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!customerId || !developerToken) {
    throw new Error("Google Ads credentials not configured");
  }

  const token = await getGoogleAccessToken(ADS_SCOPES);
  const dateStr = date.toISOString().split("T")[0];

  const adGroupQuery = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      segments.date,
      segments.ad_network_type,
      metrics.impressions,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_absolute_top_impression_share
    FROM ad_group
    WHERE segments.date = '${dateStr}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
  `;

  const campaignQuery = `
    SELECT
      campaign.id,
      metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE segments.date = '${dateStr}'
      AND campaign.status != 'REMOVED'
  `;

  const [adGroupRows, campaignRows] = await Promise.all([
    runGAQL<GoogleAdGroupRow>(adGroupQuery, customerId, token, developerToken),
    runGAQL<GoogleCampaignRow>(campaignQuery, customerId, token, developerToken),
  ]);

  if (adGroupRows.length === 0) return 0;

  const budgetLostByCampaign = new Map<string, number | null>();
  for (const row of campaignRows) {
    budgetLostByCampaign.set(
      row.campaign.id,
      row.metrics.searchBudgetLostImpressionShare ?? null,
    );
  }

  await db
    .delete(googleAdsAdGroupDaily)
    .where(sql`${googleAdsAdGroupDaily.date}::date = ${dateStr}::date`);

  const values = adGroupRows.map((row) => {
    const networkType = (row.segments.adNetworkType ?? "").toUpperCase();
    const platform = PLATFORM_MAP[networkType] ?? networkType.toLowerCase();

    return {
      date,
      campaignId: row.campaign.id,
      campaignName: row.campaign.name,
      adGroupId: row.adGroup.id,
      adGroupName: row.adGroup.name,
      platform,
      impressions: parseInt(row.metrics.impressions) || 0,
      searchImpressionShare: row.metrics.searchImpressionShare ?? null,
      searchBudgetLostIs: budgetLostByCampaign.get(row.campaign.id) ?? null,
      searchRankLostIs: row.metrics.searchRankLostImpressionShare ?? null,
      searchAbsoluteTopIs:
        row.metrics.searchAbsoluteTopImpressionShare ?? null,
    };
  });

  for (let i = 0; i < values.length; i += 500) {
    await db.insert(googleAdsAdGroupDaily).values(values.slice(i, i + 500));
  }

  return values.length;
}
