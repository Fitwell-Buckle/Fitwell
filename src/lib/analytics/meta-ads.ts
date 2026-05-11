interface MetaInsight {
  campaign_name: string;
  campaign_id: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
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

  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      "campaign_name,campaign_id,impressions,clicks,spend,reach,frequency,actions,action_values",
    time_range: JSON.stringify({ since: dateStr, until: dateStr }),
    level: "campaign",
    limit: "500",
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?${params}`,
  );

  if (!res.ok) {
    throw new Error(`Meta Ads API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { data: MetaInsight[] };

  if (!data.data || data.data.length === 0) return 0;

  // Log for now — table will be added in a future migration
  console.log(`Meta Ads: ${data.data.length} campaigns for ${dateStr}`);
  for (const row of data.data) {
    const conversions = row.actions?.find(
      (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
    );
    const revenue = row.action_values?.find(
      (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
    );
    console.log(
      `  ${row.campaign_name}: ${row.impressions} imp, ${row.clicks} clicks, $${row.spend} spend` +
        (conversions ? `, ${conversions.value} conversions` : "") +
        (revenue ? `, $${revenue.value} revenue` : ""),
    );
  }

  return data.data.length;
}
