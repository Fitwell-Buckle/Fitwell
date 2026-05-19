import { db } from "@/lib/db";
import { posthogDaily } from "@/lib/schema";
import { sql } from "drizzle-orm";

/**
 * Pull one UTC day of event rollups from PostHog (HogQL query API) into
 * `posthog_daily`. Mirrors the GA4 extractor's idempotent strategy: delete
 * the day's rows, then insert fresh — safe to re-run / backfill.
 */

interface HogQLResponse {
  results: Array<[string, string, number, number]>;
}

function dayBounds(date: Date): { start: string; end: string; ymd: string } {
  const ymd = date.toISOString().split("T")[0];
  return {
    start: `${ymd} 00:00:00`,
    end: `${ymd} 23:59:59`,
    ymd,
  };
}

export async function extractPostHogDaily(date: Date): Promise<number> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!projectId || !apiKey) {
    throw new Error(
      "PostHog extraction needs POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY",
    );
  }

  const { start, end, ymd } = dayBounds(date);

  const query = `
    SELECT toString(toDate(timestamp)) AS day,
           event,
           count() AS cnt,
           count(DISTINCT person_id) AS uniq
    FROM events
    WHERE timestamp >= toDateTime('${start}')
      AND timestamp <= toDateTime('${end}')
    GROUP BY day, event
    ORDER BY cnt DESC
  `;

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as HogQLResponse;
  const rows = data.results ?? [];

  // Idempotent: clear this day, then re-insert.
  await db
    .delete(posthogDaily)
    .where(sql`${posthogDaily.date}::date = ${ymd}::date`);

  if (rows.length === 0) return 0;

  const values = rows.map(([, event, cnt, uniq]) => ({
    date: new Date(`${ymd}T00:00:00Z`),
    eventName: event,
    count: Math.round(Number(cnt) || 0),
    uniqueUsers: Math.round(Number(uniq) || 0),
  }));

  await db.insert(posthogDaily).values(values);
  return values.length;
}

/** Backfill a closed [from, to] date range, one UTC day at a time. */
export async function backfillPostHogDaily(
  from: Date,
  to: Date,
): Promise<{ days: number; rows: number }> {
  let days = 0;
  let rows = 0;
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const last = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  while (cursor.getTime() <= last) {
    rows += await extractPostHogDaily(new Date(cursor));
    days++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { days, rows };
}
