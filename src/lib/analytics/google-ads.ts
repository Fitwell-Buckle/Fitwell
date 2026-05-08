/**
 * Google Ads API extraction.
 *
 * Pulls daily campaign performance metrics and stores them
 * in the google_ads_daily table.
 *
 * Requires GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN,
 * and Google service account credentials.
 */

export async function extractGoogleAdsData(): Promise<{ rows: number }> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!customerId) {
    return { rows: 0 };
  }

  // TODO: Implement Google Ads API extraction
  // 1. Authenticate with Google service account
  // 2. Query campaign performance report for yesterday
  // 3. Map response rows to googleAdsDaily schema
  // 4. Upsert into database
  console.log("Google Ads extraction placeholder — customer:", customerId);

  return { rows: 0 };
}
