/**
 * Populate a single creator_platform from its source API — the synchronous
 * version of what the refresh-stats / extract-posts crons do in bulk. Used
 * when a channel is added to a creator from the detail page so it fills
 * with stats + recent posts immediately instead of waiting for the next
 * cron cycle.
 *
 * Graceful by design: if the platform's API key isn't set (YT / Apify) or
 * the channel can't be auto-fetched (TikTok), the row is left as-is and the
 * caller reports that population was deferred — the nightly crons will pick
 * it up once the key lands. Scoring lives in scoring.ts; rollups in
 * rescore.ts; this only orchestrates the per-platform write.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creator,
  creatorPlatform,
  creatorPost,
  creatorStatsDaily,
  influencerOrder,
} from "@/lib/schema";
import {
  fitScore,
  igEngagementRate,
  watchConfidence,
  watchScore,
  ytEngagementRate,
  type EmailKind,
} from "./scoring";
import { detectPosts, type FetchedPost, type GiftOrderCandidate } from "./post-detection";
import { fetchChannelStats, youtubeConfigured } from "./youtube";
import { fetchIgProfiles, instagramConfigured } from "./instagram";
import { persistRollups } from "./rescore";

const ER_WINDOW_DAYS = 90;

export interface PopulateResult {
  populated: boolean;
  /** Why population didn't happen (key missing, TikTok, channel not found). */
  reason?: string;
  followers?: number | null;
  newPosts?: number;
}

async function emailKindFor(creatorId: string): Promise<EmailKind | null> {
  const emails = await db.query.creatorEmail.findMany({
    where: (e, { eq: eqOp }) => eqOp(e.creatorId, creatorId),
    columns: { kind: true },
  });
  return (emails.find((e) => e.kind === "business")?.kind ??
    emails[0]?.kind ??
    null) as EmailKind | null;
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

/** Dedup + mention/gift detect, then insert. Returns posts inserted. */
async function storePosts(
  platformId: string,
  creatorId: string,
  fetched: FetchedPost[],
): Promise<number> {
  if (fetched.length === 0) return 0;
  const existing = await db
    .select({ url: creatorPost.postUrl })
    .from(creatorPost)
    .where(eq(creatorPost.creatorPlatformId, platformId));
  const detected = detectPosts(
    fetched,
    existing.map((e) => e.url),
    await giftOrdersFor(creatorId),
  );
  if (detected.length === 0) return 0;
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
        source: "api_poll" as const,
      })),
    )
    .onConflictDoNothing(); // post_url unique
  return detected.length;
}

async function upsertSnapshot(
  platformId: string,
  snapshotDate: string,
  values: {
    followers: number | null;
    engagementRatePct: number | null;
    avgViews?: number | null;
    lastPostDate: string | null;
    postsInWindow: number;
  },
): Promise<void> {
  await db
    .insert(creatorStatsDaily)
    .values({ creatorPlatformId: platformId, snapshotDate, ...values })
    .onConflictDoUpdate({
      target: [
        creatorStatsDaily.creatorPlatformId,
        creatorStatsDaily.snapshotDate,
      ],
      set: values,
    });
}

export async function populatePlatform(
  platformId: string,
): Promise<PopulateResult> {
  const platform = await db.query.creatorPlatform.findFirst({
    where: (p, { eq: eqOp }) => eqOp(p.id, platformId),
  });
  if (!platform) return { populated: false, reason: "Platform not found" };

  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10);
  const windowStart = now.getTime() - ER_WINDOW_DAYS * 86_400_000;
  const emailKind = await emailKindFor(platform.creatorId);

  if (platform.platform === "yt") {
    if (!youtubeConfigured())
      return { populated: false, reason: "YOUTUBE_API_KEY not set" };
    const stats = await fetchChannelStats(platform.handle);
    if (!stats)
      return { populated: false, reason: "YouTube channel not found" };

    const windowVideos = stats.videos.filter(
      (v) => v.postedAt && v.postedAt.getTime() >= windowStart,
    );
    const erPct = ytEngagementRate(windowVideos);
    const lastPost = stats.videos
      .map((v) => v.postedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const avgViews =
      windowVideos.length > 0
        ? windowVideos.reduce((s, v) => s + (v.views ?? 0), 0) /
          windowVideos.length
        : null;
    const ws = watchScore(
      [stats.description, ...stats.videos.map((v) => v.title)]
        .filter(Boolean)
        .join("\n"),
      8,
    );
    const fit = fitScore({
      watchScore: ws,
      followers: stats.subscribers ?? 0,
      emailKind,
      erPct,
      daysSinceLastPost: lastPost
        ? Math.floor((now.getTime() - lastPost.getTime()) / 86_400_000)
        : null,
    });

    await db
      .update(creatorPlatform)
      .set({
        bio: stats.description,
        country: stats.country,
        watchScore: ws,
        watchConfidence: watchConfidence(ws, "yt"),
        fitScore: fit.fitScore,
        fitScorePartial: fit.partial,
        lastRefreshedAt: now,
      })
      .where(eq(creatorPlatform.id, platformId));

    if (stats.country) {
      // Fill the creator country only while unset — manual edits win.
      const c = await db.query.creator.findFirst({
        where: (cc, { eq: eqOp }) => eqOp(cc.id, platform.creatorId),
        columns: { country: true },
      });
      if (!c?.country)
        await db
          .update(creator)
          .set({ country: stats.country })
          .where(eq(creator.id, platform.creatorId));
    }

    await upsertSnapshot(platformId, snapshotDate, {
      followers: stats.subscribers,
      engagementRatePct: erPct,
      avgViews,
      lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
      postsInWindow: windowVideos.length,
    });
    const newPosts = await storePosts(platformId, platform.creatorId, stats.videos);
    await persistRollups(platform.creatorId);
    return { populated: true, followers: stats.subscribers, newPosts };
  }

  if (platform.platform === "ig") {
    if (!instagramConfigured())
      return { populated: false, reason: "APIFY_TOKEN not set" };
    const byHandle = await fetchIgProfiles([platform.handle]);
    const profile = byHandle.get(platform.handle.toLowerCase());
    if (!profile)
      return { populated: false, reason: "Instagram profile not found" };

    const posts = profile.posts;
    const erPct = igEngagementRate(posts, profile.followers ?? 0);
    const lastPost = posts
      .map((p) => p.postedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const ws = watchScore(
      [profile.bio, ...posts.map((p) => p.caption)].filter(Boolean).join("\n"),
      8,
    );
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
      .where(eq(creatorPlatform.id, platformId));

    await upsertSnapshot(platformId, snapshotDate, {
      followers: profile.followers,
      engagementRatePct: erPct,
      lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
      postsInWindow: posts.length,
    });
    const newPosts = await storePosts(platformId, platform.creatorId, posts);
    await persistRollups(platform.creatorId);
    return { populated: true, followers: profile.followers, newPosts };
  }

  // TikTok (and anything else) — no auto-fetch path; manual posts only.
  return {
    populated: false,
    reason: "TikTok has no auto-populate — add posts manually",
  };
}
