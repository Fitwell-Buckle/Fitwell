/**
 * Post-detection orchestration (creator program Phase 5). Two entry
 * points, one per polling cron:
 *   - extractYouTubePosts(): nightly, every creator with a YT record
 *   - extractInstagramPosts(): every 6h, only creators worth the Apify
 *     cost — status committed/active OR a gifting order in the last 60
 *     days — throttled to 50 profiles per cycle.
 *
 * Both no-op with a `skipped` summary when their API key isn't set, so
 * the crons are safe to ship ahead of the env vars.
 */

import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creator,
  creatorPlatform,
  creatorPost,
  creatorStatsDaily,
  influencerOrder,
} from "@/lib/schema";
import { detectPosts, type GiftOrderCandidate } from "./post-detection";
import { fetchIgProfiles, instagramConfigured } from "./instagram";
import { fetchRecentVideos, youtubeConfigured } from "./youtube";
import {
  crossPlatformFit,
  fitScore,
  igEngagementRate,
  watchConfidence,
  watchScore,
  type EmailKind,
} from "./scoring";
import { getActiveMarkets, isOutOfMarket } from "./markets";

export interface ExtractSummary {
  skipped?: string;
  platformsChecked: number;
  newPosts: number;
  mentions: number;
  errors: number;
}

async function giftOrdersFor(creatorId: string): Promise<GiftOrderCandidate[]> {
  const rows = await db
    .select({
      id: influencerOrder.id,
      sentAt: influencerOrder.sentAt,
      issuedDate: influencerOrder.issuedDate,
    })
    .from(influencerOrder)
    .where(eq(influencerOrder.creatorId, creatorId));
  return rows.map((r) => ({
    id: r.id,
    sentAt: r.sentAt ?? (r.issuedDate ? new Date(r.issuedDate) : null),
  }));
}

async function storeDetected(
  platformId: string,
  creatorId: string,
  fetched: Awaited<ReturnType<typeof fetchRecentVideos>>,
  source: "api_poll",
): Promise<{ inserted: number; mentions: number }> {
  const existing = await db
    .select({ url: creatorPost.postUrl })
    .from(creatorPost)
    .where(eq(creatorPost.creatorPlatformId, platformId));
  const giftOrders = await giftOrdersFor(creatorId);
  const detected = detectPosts(
    fetched,
    existing.map((e) => e.url),
    giftOrders,
  );
  if (detected.length === 0) return { inserted: 0, mentions: 0 };

  await db
    .insert(creatorPost)
    .values(
      detected.map((p) => ({
        creatorPlatformId: platformId,
        giftOrderId: p.giftOrderId,
        postUrl: p.postUrl,
        postedAt: p.postedAt,
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        mentionedUs: p.mentionedUs,
        source,
      })),
    )
    .onConflictDoNothing(); // post_url unique — concurrent runs are safe

  return {
    inserted: detected.length,
    mentions: detected.filter((p) => p.mentionedUs).length,
  };
}

export async function extractYouTubePosts(): Promise<ExtractSummary> {
  if (!youtubeConfigured()) {
    return {
      skipped: "YOUTUBE_API_KEY not set",
      platformsChecked: 0,
      newPosts: 0,
      mentions: 0,
      errors: 0,
    };
  }

  // Rejected and out-of-market creators get no API calls anywhere.
  const activeMarkets = await getActiveMarkets();
  const allPlatforms = await db
    .select({
      id: creatorPlatform.id,
      creatorId: creatorPlatform.creatorId,
      handle: creatorPlatform.handle,
      country: creator.country,
    })
    .from(creatorPlatform)
    .innerJoin(creator, eq(creatorPlatform.creatorId, creator.id))
    .where(
      sql`${creatorPlatform.platform} = 'yt' and ${ne(creator.vettingStatus, "rejected")}`,
    );
  const platforms = allPlatforms.filter(
    (p) => !isOutOfMarket(p.country, activeMarkets),
  );

  const summary: ExtractSummary = {
    platformsChecked: platforms.length,
    newPosts: 0,
    mentions: 0,
    errors: 0,
  };

  for (const p of platforms) {
    try {
      const fetched = await fetchRecentVideos(p.handle);
      const stored = await storeDetected(p.id, p.creatorId, fetched, "api_poll");
      summary.newPosts += stored.inserted;
      summary.mentions += stored.mentions;
    } catch (e) {
      summary.errors++;
      console.error(`YT poll failed for @${p.handle}:`, e);
    }
  }
  return summary;
}

/** Apify cost throttle (creator-program.md Phase 5). */
const IG_BATCH_LIMIT = 50;

export async function extractInstagramPosts(): Promise<ExtractSummary> {
  if (!instagramConfigured()) {
    return {
      skipped: "APIFY_TOKEN not set",
      platformsChecked: 0,
      newPosts: 0,
      mentions: 0,
      errors: 0,
    };
  }

  // All IG records except rejected and out-of-market creators,
  // least-recently-refreshed first — 50/cycle × 4 cycles/day means every
  // profile refreshes every ~3–4 days, and the same Apify payload serves
  // BOTH post detection and the stats/score refresh (no extra cost).
  // Market filter happens in SQL so sidelined creators don't consume
  // batch slots (each slot is paid Apify usage).
  const activeMarketSet = await getActiveMarkets();
  const marketFilter = activeMarketSet
    ? sql` and (${creator.country} is null or upper(${creator.country}) in (${sql.join([...activeMarketSet].map((c) => sql`${c}`), sql`, `)}))`
    : sql``;
  const platforms = await db
    .select({
      id: creatorPlatform.id,
      creatorId: creatorPlatform.creatorId,
      handle: creatorPlatform.handle,
    })
    .from(creatorPlatform)
    .innerJoin(creator, eq(creatorPlatform.creatorId, creator.id))
    .where(
      sql`${creatorPlatform.platform} = 'ig' and ${ne(creator.vettingStatus, "rejected")}${marketFilter}`,
    )
    .orderBy(sql`${creatorPlatform.lastRefreshedAt} asc nulls first`)
    .limit(IG_BATCH_LIMIT);

  const summary: ExtractSummary = {
    platformsChecked: platforms.length,
    newPosts: 0,
    mentions: 0,
    errors: 0,
  };
  if (platforms.length === 0) return summary;

  let byHandle: Awaited<ReturnType<typeof fetchIgProfiles>>;
  try {
    byHandle = await fetchIgProfiles(platforms.map((p) => p.handle));
  } catch (e) {
    console.error("Apify IG poll failed:", e);
    return { ...summary, errors: 1 };
  }

  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10);

  for (const p of platforms) {
    try {
      const profile = byHandle.get(p.handle);
      const fetched = profile?.posts ?? [];
      const stored = await storeDetected(p.id, p.creatorId, fetched, "api_poll");
      summary.newPosts += stored.inserted;
      summary.mentions += stored.mentions;

      if (profile) {
        const erPct = igEngagementRate(fetched, profile.followers ?? 0);
        const lastPost = fetched
          .map((f) => f.postedAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0];

        // Re-score from fresh bio + captions (scoring doc §8).
        const scoreText = [profile.bio, ...fetched.map((f) => f.caption)]
          .filter(Boolean)
          .join("\n");
        const ws = watchScore(scoreText, 8);
        const emails = await db.query.creatorEmail.findMany({
          where: (e, { eq: eqOp }) => eqOp(e.creatorId, p.creatorId),
          columns: { kind: true },
        });
        const emailKind = (emails.find((e) => e.kind === "business")?.kind ??
          emails[0]?.kind ??
          null) as EmailKind | null;
        const fit = fitScore({
          watchScore: ws,
          followers: profile.followers ?? 0,
          emailKind,
          erPct,
          daysSinceLastPost: lastPost
            ? Math.floor((now.getTime() - lastPost.getTime()) / 86_400_000)
            : null,
        });

        await db
          .update(creatorPlatform)
          .set({
            bio: profile.bio,
            watchScore: ws,
            watchConfidence: watchConfidence(ws, "ig"),
            fitScore: fit.fitScore,
            fitScorePartial: fit.partial,
            lastRefreshedAt: now,
          })
          .where(eq(creatorPlatform.id, p.id));

        await db
          .insert(creatorStatsDaily)
          .values({
            creatorPlatformId: p.id,
            snapshotDate,
            followers: profile.followers,
            engagementRatePct: erPct,
            lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
            postsInWindow: fetched.length,
          })
          .onConflictDoUpdate({
            target: [
              creatorStatsDaily.creatorPlatformId,
              creatorStatsDaily.snapshotDate,
            ],
            set: {
              followers: profile.followers,
              engagementRatePct: erPct,
              lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
              postsInWindow: fetched.length,
            },
          });

        const siblingFits = await db
          .select({ fitScore: creatorPlatform.fitScore })
          .from(creatorPlatform)
          .where(eq(creatorPlatform.creatorId, p.creatorId));
        const fits = siblingFits
          .map((s) => s.fitScore)
          .filter((f): f is number => f != null);
        if (fits.length > 0) {
          await db
            .update(creator)
            .set({ crossPlatformFit: crossPlatformFit(fits), updatedAt: now })
            .where(eq(creator.id, p.creatorId));
        }
      } else {
        // Profile not returned (private/renamed) — still bump the clock so
        // the round-robin doesn't get stuck on it.
        await db
          .update(creatorPlatform)
          .set({ lastRefreshedAt: now })
          .where(eq(creatorPlatform.id, p.id));
      }
    } catch (e) {
      summary.errors++;
      console.error(`IG store failed for @${p.handle}:`, e);
    }
  }
  return summary;
}
