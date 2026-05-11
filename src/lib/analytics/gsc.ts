import { db } from "@/lib/db";
import { gscDaily } from "@/lib/schema";
import { getGoogleAccessToken } from "@/lib/google/auth";
import { sql } from "drizzle-orm";

const GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function extractGSCDaily(date: Date): Promise<number> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL not configured");

  const token = await getGoogleAccessToken(GSC_SCOPES);
  const dateStr = date.toISOString().split("T")[0];

  const allRows: GSCRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;

  // Paginate through all results
  while (true) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: dateStr,
          endDate: dateStr,
          dimensions: ["query", "page"],
          rowLimit,
          startRow,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`GSC API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { rows?: GSCRow[] };
    if (!data.rows || data.rows.length === 0) break;
    allRows.push(...data.rows);
    if (data.rows.length < rowLimit) break;
    startRow += rowLimit;
  }

  if (allRows.length === 0) return 0;

  // Delete existing rows for this date, then insert fresh
  await db
    .delete(gscDaily)
    .where(sql`${gscDaily.date}::date = ${dateStr}::date`);

  const values = allRows.map((row) => ({
    date,
    query: row.keys[0],
    page: row.keys[1],
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    position: row.position,
  }));

  // Insert in batches of 500 (Neon has row limits)
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(gscDaily).values(values.slice(i, i + 500));
  }

  return values.length;
}
