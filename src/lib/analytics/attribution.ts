import { db } from "@/lib/db";
import { utmAttribution } from "@/lib/schema";
import { sql } from "drizzle-orm";

export type Channel =
  | "organic_search"
  | "paid_search"
  | "social"
  | "email"
  | "direct"
  | "referral"
  | "other";

export function mapUtmToChannel(
  source: string | null,
  medium: string | null,
): Channel {
  const s = (source ?? "").toLowerCase();
  const m = (medium ?? "").toLowerCase();

  if (m === "cpc" || m === "ppc" || m === "paid") return "paid_search";
  if (m === "organic" || s === "google" || s === "bing") return "organic_search";
  if (m === "email" || s === "resend" || s === "mailchimp") return "email";
  if (
    m === "social" ||
    ["facebook", "instagram", "twitter", "tiktok", "youtube"].includes(s)
  )
    return "social";
  if (m === "referral") return "referral";
  if (!s && !m) return "direct";

  return "other";
}

export interface AttributionBreakdown {
  channel: Channel;
  visitors: number;
  percentage: number;
}

export async function calculateAttribution(): Promise<AttributionBreakdown[]> {
  const rows = await db
    .select({
      source: utmAttribution.source,
      medium: utmAttribution.medium,
      count: sql<number>`count(*)::int`,
    })
    .from(utmAttribution)
    .groupBy(utmAttribution.source, utmAttribution.medium);

  const channelMap = new Map<Channel, number>();

  for (const row of rows) {
    const channel = mapUtmToChannel(row.source, row.medium);
    channelMap.set(channel, (channelMap.get(channel) ?? 0) + row.count);
  }

  const total = Array.from(channelMap.values()).reduce((a, b) => a + b, 0);

  return Array.from(channelMap.entries())
    .map(([channel, visitors]) => ({
      channel,
      visitors,
      percentage: total > 0 ? Math.round((visitors / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.visitors - a.visitors);
}
