import { db } from "@/lib/db";
import { metaAdsDaily, metaAdsetAudience } from "@/lib/schema";
import { sql } from "drizzle-orm";

interface MetaInsight {
  campaign_name: string;
  campaign_id: string;
  adset_name: string;
  adset_id: string;
  ad_name: string;
  ad_id: string;
  publisher_platform: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface MetaRankingInsight {
  ad_id: string;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

type AdRankings = {
  quality: string | null;
  engagement: string | null;
  conversion: string | null;
};

// Pull rolling-7-day rankings ending on `date`. Meta strips these from any
// insights response that includes breakdowns, so this is a separate call.
async function fetchMetaAdRankings(
  adAccountId: string,
  accessToken: string,
  date: Date,
): Promise<Map<string, AdRankings>> {
  const until = date.toISOString().split("T")[0];
  const sinceDate = new Date(date);
  sinceDate.setDate(sinceDate.getDate() - 6);
  const since = sinceDate.toISOString().split("T")[0];

  const rankings = new Map<string, AdRankings>();
  let url: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?` +
    new URLSearchParams({
      access_token: accessToken,
      fields:
        "ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking",
      time_range: JSON.stringify({ since, until }),
      level: "ad",
      limit: "500",
    }).toString();

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      // Best-effort — keep daily metrics flowing even if rankings fail
      console.warn(
        `Meta rankings call failed: ${res.status} ${await res.text()}`,
      );
      return rankings;
    }
    const page = (await res.json()) as {
      data: MetaRankingInsight[];
      paging?: { next?: string };
    };
    for (const row of page.data ?? []) {
      const quality = row.quality_ranking ?? null;
      // "UNKNOWN" means Meta hasn't computed a ranking (low volume) — treat
      // it as data ("Unknown" in the UI) rather than null so we don't keep
      // re-fetching hoping for something different.
      rankings.set(row.ad_id, {
        quality: quality && quality !== "" ? quality : null,
        engagement:
          row.engagement_rate_ranking && row.engagement_rate_ranking !== ""
            ? row.engagement_rate_ranking
            : null,
        conversion:
          row.conversion_rate_ranking && row.conversion_rate_ranking !== ""
            ? row.conversion_rate_ranking
            : null,
      });
    }
    url = page.paging?.next ?? null;
  }

  return rankings;
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

  // Per-ad delivery rankings — Meta calculates these over a rolling 7-day
  // window and strips them from any response that includes breakdowns, so
  // we need a separate call without `breakdowns`. Stamp the same value onto
  // every publisher_platform row for that ad on the synced date.
  const rankingsByAd = await fetchMetaAdRankings(
    adAccountId,
    accessToken,
    date,
  );

  // publisher_platform breakdown is required for per-channel splits
  // (Facebook vs Instagram), but it strips the ranking fields above.
  const allRows: MetaInsight[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?` +
    new URLSearchParams({
      access_token: accessToken,
      fields:
        "campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,impressions,clicks,spend,reach,frequency,actions,action_values",
      time_range: JSON.stringify({ since: dateStr, until: dateStr }),
      level: "ad",
      breakdowns: "publisher_platform",
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

  // Fetch landing URLs from ad creatives (deduplicated by ad_id)
  const uniqueAdIds = [...new Set(allRows.map((r) => r.ad_id))];
  const landingUrlMap = new Map<string, string>();
  for (let i = 0; i < uniqueAdIds.length; i += 50) {
    const batch = uniqueAdIds.slice(i, i + 50);
    const ids = batch.join(",");
    try {
      const creativeRes = await fetch(
        `https://graph.facebook.com/v21.0/?ids=${ids}&fields=creative{object_story_spec}&access_token=${accessToken}`,
      );
      if (creativeRes.ok) {
        const creativeData = (await creativeRes.json()) as Record<
          string,
          { creative?: { object_story_spec?: { video_data?: { call_to_action?: { value?: { link?: string } } }; link_data?: { link?: string } } } }
        >;
        for (const [adId, ad] of Object.entries(creativeData)) {
          const spec = ad?.creative?.object_story_spec;
          const link =
            spec?.video_data?.call_to_action?.value?.link ??
            spec?.link_data?.link;
          if (link) {
            try {
              const u = new URL(link);
              landingUrlMap.set(adId, u.pathname);
            } catch {
              landingUrlMap.set(adId, link);
            }
          }
        }
      }
    } catch {
      // Non-critical — landing URLs are supplementary
    }
  }

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
      platform: row.publisher_platform,
      landingUrl: landingUrlMap.get(row.ad_id) ?? null,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      cost: toCents(row.spend),
      conversions: conversions ? parseFloat(conversions.value) : 0,
      conversionValue: revenue ? parseFloat(revenue.value) : 0,
      reach: parseInt(row.reach) || 0,
      frequency: parseFloat(row.frequency) || 0,
      qualityRanking: rankingsByAd.get(row.ad_id)?.quality ?? null,
      engagementRanking: rankingsByAd.get(row.ad_id)?.engagement ?? null,
      conversionRanking: rankingsByAd.get(row.ad_id)?.conversion ?? null,
    };
  });

  for (let i = 0; i < values.length; i += 500) {
    await db.insert(metaAdsDaily).values(values.slice(i, i + 500));
  }

  return values.length;
}

// ── Audience-size snapshots ─────────────────────────────────────────
// Meta's /delivery_estimate gives the addressable monthly active audience
// for an adset's current targeting. Audience size drifts slowly, so we
// snapshot once per sync and upsert into a single-row-per-adset table.

interface DeliveryEstimate {
  estimate_ready: boolean;
  estimate_mau_lower_bound?: number;
  estimate_mau_upper_bound?: number;
}

interface AdsetListItem {
  id: string;
  name: string;
  status: string;
}

export async function extractMetaAdsetAudience(): Promise<number> {
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    throw new Error(
      "Meta Ads credentials not configured (META_AD_ACCOUNT_ID, META_ACCESS_TOKEN)",
    );
  }

  // List active adsets — paused/archived adsets won't have a useful estimate
  const adsets: AdsetListItem[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/adsets?` +
    new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,status",
      filtering: JSON.stringify([
        { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
      ]),
      limit: "500",
    }).toString();

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meta adsets list error: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as {
      data: AdsetListItem[];
      paging?: { next?: string };
    };
    if (page.data) adsets.push(...page.data);
    url = page.paging?.next ?? null;
  }

  if (adsets.length === 0) return 0;

  const now = new Date();
  let written = 0;

  // Hit /delivery_estimate per adset. We use REACH so the estimate reflects
  // unique-people reachable rather than conversions-eligible.
  for (const adset of adsets) {
    try {
      const estUrl =
        `https://graph.facebook.com/v21.0/${adset.id}/delivery_estimate?` +
        new URLSearchParams({
          access_token: accessToken,
          optimization_goal: "REACH",
        }).toString();
      const res = await fetch(estUrl);
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: DeliveryEstimate[] };
      const est = json.data?.[0];
      if (!est?.estimate_ready) continue;

      await db
        .insert(metaAdsetAudience)
        .values({
          adsetId: adset.id,
          adsetName: adset.name,
          audienceLowerBound: est.estimate_mau_lower_bound ?? null,
          audienceUpperBound: est.estimate_mau_upper_bound ?? null,
          snapshotAt: now,
        })
        .onConflictDoUpdate({
          target: metaAdsetAudience.adsetId,
          set: {
            adsetName: adset.name,
            audienceLowerBound: est.estimate_mau_lower_bound ?? null,
            audienceUpperBound: est.estimate_mau_upper_bound ?? null,
            snapshotAt: now,
          },
        });
      written++;
    } catch {
      // Skip adsets that fail — audience size is best-effort
    }
  }

  return written;
}
