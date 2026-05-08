/**
 * Google Search Console API extraction.
 *
 * Pulls daily search performance data and stores it
 * in the gsc_daily table.
 *
 * Requires GSC_SITE_URL and Google service account credentials.
 */

export async function extractGSCData(): Promise<{ rows: number }> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) {
    return { rows: 0 };
  }

  // TODO: Implement GSC API extraction
  // 1. Authenticate with Google service account
  // 2. Query search analytics for the past 3 days (data delay)
  // 3. Dimensions: query, page, date
  // 4. Map response rows to gscDaily schema
  // 5. Upsert into database
  console.log("GSC extraction placeholder — site:", siteUrl);

  return { rows: 0 };
}
