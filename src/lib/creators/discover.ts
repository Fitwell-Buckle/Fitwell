/**
 * Creator discovery (the "once the CSV is in we can't be done" pipeline).
 * Weekly YouTube keyword search → channels we don't already track land in
 * the list as vetting_status='unreviewed' prospects, scored from their
 * channel description. Rejected creators stay in the DB precisely so this
 * can't resurface them (dedup on the platform+handle unique key).
 *
 * Quota: search.list costs 100 units/query → ~5 queries + channel lookups
 * ≈ 600 units per weekly run, well inside the 10K/day budget alongside
 * the nightly post poll.
 *
 * IG discovery is intentionally absent for now: no search API without
 * Meta review, and Apify hashtag scrapes are noisy. The funnel for IG is
 * cross-platform: YT-discovered creators' IG handles surface via their
 * channel links and the existing import's multi-platform matching.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator, creatorPlatform } from "@/lib/schema";
import { fitScore, watchConfidence, watchScore } from "./scoring";

const SEARCH_QUERIES = [
  "watch collection review",
  "microbrand watch review",
  "watch strap review",
  "wristwatch unboxing",
  "everyday carry watch",
];

const API = "https://www.googleapis.com/youtube/v3";

export interface DiscoverySummary {
  skipped?: string;
  queried: number;
  channelsSeen: number;
  added: number;
  errors: number;
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY! });
  const res = await fetch(`${API}/${path}?${qs}`);
  if (!res.ok) throw new Error(`YouTube ${path} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function discoverYouTubeCreators(): Promise<DiscoverySummary> {
  if (!process.env.YOUTUBE_API_KEY) {
    return { skipped: "YOUTUBE_API_KEY not set", queried: 0, channelsSeen: 0, added: 0, errors: 0 };
  }

  const summary: DiscoverySummary = { queried: 0, channelsSeen: 0, added: 0, errors: 0 };
  const channelIds = new Set<string>();

  for (const q of SEARCH_QUERIES) {
    try {
      const res = await yt<{
        items?: { snippet?: { channelId?: string } }[];
      }>("search", {
        part: "snippet",
        q,
        type: "video",
        order: "relevance",
        publishedAfter: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        maxResults: "25",
      });
      summary.queried++;
      for (const item of res.items ?? []) {
        if (item.snippet?.channelId) channelIds.add(item.snippet.channelId);
      }
    } catch (e) {
      summary.errors++;
      console.error(`Discovery search failed for "${q}":`, e);
    }
  }
  summary.channelsSeen = channelIds.size;
  if (channelIds.size === 0) return summary;

  // Channel details in batches of 50 (1 unit per call).
  const ids = [...channelIds];
  for (let i = 0; i < ids.length; i += 50) {
    let items: {
      id?: string;
      snippet?: {
        title?: string;
        description?: string;
        customUrl?: string;
        country?: string;
      };
      statistics?: { subscriberCount?: string };
    }[];
    try {
      const res = await yt<{ items?: typeof items }>("channels", {
        part: "snippet,statistics",
        id: ids.slice(i, i + 50).join(","),
        maxResults: "50",
      });
      items = res.items ?? [];
    } catch (e) {
      summary.errors++;
      console.error("Discovery channel lookup failed:", e);
      continue;
    }

    for (const ch of items) {
      // customUrl is "@handle" — without one we can't dedup or link; skip.
      const handle = ch.snippet?.customUrl?.replace(/^@/, "").toLowerCase();
      if (!handle || !ch.id) continue;

      const description = ch.snippet?.description ?? "";
      const ws = watchScore(description, 5);
      // Only surface plausible watch channels — the search query alone
      // isn't signal enough (gaming channels review "watches" too).
      if (watchConfidence(ws, "yt") === "none") continue;

      const subscribers = parseInt(ch.statistics?.subscriberCount ?? "0", 10) || 0;
      const fit = fitScore({
        watchScore: ws,
        followers: subscribers,
        emailKind: null,
        erPct: null,
        daysSinceLastPost: null,
      });

      try {
        // Dedup via platform+handle: tracked AND rejected creators both
        // already have a row, so neither resurfaces. A weekly single-runner
        // cron doesn't race, so check-then-insert is fine here.
        const existing = await db
          .select({ id: creatorPlatform.id })
          .from(creatorPlatform)
          .where(
            and(
              eq(creatorPlatform.platform, "yt"),
              eq(creatorPlatform.handle, handle),
            ),
          );
        if (existing.length > 0) continue; // already tracked

        const country = ch.snippet?.country?.toUpperCase() ?? null;
        const [c] = await db
          .insert(creator)
          .values({
            name: ch.snippet?.title ?? handle,
            primaryPlatform: "yt",
            status: "prospect",
            vettingStatus: "unreviewed",
            crossPlatformFit: fit.fitScore,
            country,
            notes: `Discovered via YT search ${new Date().toISOString().slice(0, 10)}`,
          })
          .returning({ id: creator.id });
        await db.insert(creatorPlatform).values({
          creatorId: c.id,
          platform: "yt",
          handle,
          profileUrl: `https://www.youtube.com/@${handle}`,
          bio: description || null,
          country,
          dataSource: "discovery",
          watchScore: ws,
          watchConfidence: watchConfidence(ws, "yt"),
          fitScore: fit.fitScore,
          fitScorePartial: fit.partial,
        });
        summary.added++;
      } catch (e) {
        summary.errors++;
        console.error(`Discovery insert failed for @${handle}:`, e);
      }
    }
  }
  return summary;
}
