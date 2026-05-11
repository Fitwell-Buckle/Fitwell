import { db } from "@/lib/db";
import { ga4Daily } from "@/lib/schema";
import { getGoogleAccessToken } from "@/lib/google/auth";
import { sql } from "drizzle-orm";

const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

interface GA4Row {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

export async function extractGA4Daily(date: Date): Promise<number> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("GA4_PROPERTY_ID not configured");

  const token = await getGoogleAccessToken(GA4_SCOPES);
  const dateStr = formatDateGA4(date);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [
          { name: "date" },
          { name: "sessionSource" },
          { name: "sessionMedium" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`GA4 API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { rows?: GA4Row[] };
  if (!data.rows || data.rows.length === 0) return 0;

  // Delete existing rows for this date, then insert fresh
  const rowDate = parseGA4Date(data.rows[0].dimensionValues[0].value);
  await db
    .delete(ga4Daily)
    .where(
      sql`${ga4Daily.date}::date = ${rowDate.toISOString().split("T")[0]}::date`,
    );

  const values = data.rows.map((row) => {
    const [, source, medium] = row.dimensionValues.map((d) => d.value);
    const [sessions, users, newUsers, pageviews, bounceRate, avgDuration] =
      row.metricValues.map((m) => parseFloat(m.value));

    return {
      date: rowDate,
      source: source === "(direct)" ? "direct" : source,
      medium: medium === "(none)" ? null : medium,
      sessions: Math.round(sessions),
      users: Math.round(users),
      newUsers: Math.round(newUsers),
      pageviews: Math.round(pageviews),
      bounceRate,
      avgSessionDuration: avgDuration,
    };
  });

  if (values.length > 0) {
    await db.insert(ga4Daily).values(values);
  }

  return values.length;
}

/** GA4 API uses YYYY-MM-DD for date ranges */
function formatDateGA4(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** GA4 response returns YYYYMMDD */
function parseGA4Date(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
}
