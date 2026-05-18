import { db } from "@/lib/db";
import { metaAdsDaily } from "@/lib/schema";
import { sql } from "drizzle-orm";

interface MetaInsight {
  campaign_name: string;
  campaign_id: string;
  adset_name: string;
  adset_id: string;
  ad_name: string;
  ad_id: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

function toCents(value: string): number {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export async function extractMetaAdsDaily(date: Date): Promise<number> {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    throw new Error(
      "Meta Ads credentials not configured (META_AD_ACCOUNT_ID, META_ACCESS_TOKEN)",
    );
  }

  const dateStr = date.toISOString().split("T")[0];

  const allRows: MetaInsight[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?` +
    new URLSearchParams({
      access_token: accessToken,
      fields:
        "campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,impressions,clicks,spend,reach,frequency,actions,action_values",
      time_range: JSON.stringify({ since: dateStr, until: dateStr }),
      level: "ad",
      limit: "500",
    }).toString();

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meta Ads API error: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as {
      data: MetaInsight[];
      paging?: { next?: string };
    };
    if (page.data) allRows.push(...page.data);
    url = page.paging?.next ?? null;
  }

  if (allRows.length === 0) return 0;

  await db
    .delete(metaAdsDaily)
    .where(sql`${metaAdsDaily.date}::date = ${dateStr}::date`);

  const values = allRows.map((row) => {
    const conversions = row.actions?.find(
      (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
    );
    const revenue = row.action_values?.find(
      (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
    );

    return {
      date,
      campaignName: row.campaign_name,
      campaignId: row.campaign_id,
      adsetName: row.adset_name,
      adsetId: row.adset_id,
      adName: row.ad_name,
      adId: row.ad_id,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      cost: toCents(row.spend),
      conversions: conversions ? parseFloat(conversions.value) : 0,
      conversionValue: revenue ? parseFloat(revenue.value) : 0,
      reach: parseInt(row.reach) || 0,
      frequency: parseFloat(row.frequency) || 0,
    };
  });

  for (let i = 0; i < values.length; i += 500) {
    await db.insert(metaAdsDaily).values(values.slice(i, i + 500));
  }

  return values.length;
}
