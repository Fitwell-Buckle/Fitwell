/**
 * GA4 Data API extraction.
 *
 * Uses the Google Analytics Data API to pull daily metrics
 * and store them in the ga4_daily table.
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 * and GA4_PROPERTY_ID environment variables.
 */

export async function extractGA4Data(): Promise<{ rows: number }> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return { rows: 0 };
  }

  // TODO: Implement GA4 Data API extraction
  // 1. Authenticate with Google service account
  // 2. Query the GA4 Data API for daily metrics
  // 3. Map response rows to ga4Daily schema
  // 4. Upsert into database
  console.log("GA4 extraction placeholder — property:", propertyId);

  return { rows: 0 };
}
