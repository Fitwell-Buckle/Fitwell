/**
 * Nightly YouTube stats refresh (creator program Phase 6, pulled forward
 * 2026-06-12 — the imported snapshot froze at the May research scrape and
 * "Last post" drifted stale within weeks).
 *
 * Per YT platform record: fresh subscribers / ER / last-upload / avg
 * views, a new creator_stats_daily snapshot, recomputed watch + fit
 * scores (scoring doc §8 "when to re-score"), and an updated
 * creator.cross_platform_fit. score_boost is untouched by design — human
 * judgment survives refreshes.
 *
 * IG freshness rides the existing extract-creator-posts-ig cron (same
 * Apify payload carries followers + posts), so there is no separate IG
 * refresh here.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator, creatorPlatform, creatorStatsDaily } from "@/lib/schema";
import {
  crossPlatformFit,
  fitScore,
  watchConfidence,
  watchScore,
  ytEngagementRate,
  type EmailKind,
} from "./scoring";
import { fetchChannelStats, youtubeConfigured } from "./youtube";
import { getActiveMarkets, isOutOfMarket } from "./markets";

export interface RefreshSummary {
  skipped?: string;
  platformsChecked: number;
  refreshed: number;
  notFound: number;
  errors: number;
}

const ER_WINDOW_DAYS = 90;

export async function refreshYouTubeStats(): Promise<RefreshSummary> {
  if (!youtubeConfigured()) {
    return {
      skipped: "YOUTUBE_API_KEY not set",
      platformsChecked: 0,
      refreshed: 0,
      notFound: 0,
      errors: 0,
    };
  }

  const allYt = await db.query.creatorPlatform.findMany({
    where: (p, { eq: eqOp }) => eqOp(p.platform, "yt"),
    with: {
      creator: {
        columns: { id: true, vettingStatus: true, country: true },
        with: { emails: { columns: { email: true, kind: true } } },
      },
    },
  });
  // Rejected and out-of-market creators get no API calls anywhere.
  const activeMarkets = await getActiveMarkets();
  const platforms = allYt.filter(
    (p) =>
      p.creator.vettingStatus !== "rejected" &&
      !isOutOfMarket(p.creator.country, activeMarkets),
  );

  const summary: RefreshSummary = {
    platformsChecked: platforms.length,
    refreshed: 0,
    notFound: 0,
    errors: 0,
  };
  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10);
  const windowStart = now.getTime() - ER_WINDOW_DAYS * 86_400_000;

  for (const p of platforms) {
    try {
      const stats = await fetchChannelStats(p.handle);
      if (!stats) {
        summary.notFound++;
        continue;
      }

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
          ? windowVideos.reduce((s, v) => s + (v.views ?? 0), 0) / windowVideos.length
          : null;

      // Re-score from fresh text (description + recent titles).
      const scoreText = [stats.description, ...stats.videos.map((v) => v.title)]
        .filter(Boolean)
        .join("\n");
      const ws = watchScore(scoreText, 8);
      const emailKind = (p.creator.emails.find((e) => e.kind === "business")?.kind ??
        p.creator.emails[0]?.kind ??
        null) as EmailKind | null;
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
        .where(eq(creatorPlatform.id, p.id));

      // Roll up to the creator only while unset — manual edits win.
      if (stats.country && !p.creator.country) {
        await db
          .update(creator)
          .set({ country: stats.country })
          .where(eq(creator.id, p.creatorId));
      }

      await db
        .insert(creatorStatsDaily)
        .values({
          creatorPlatformId: p.id,
          snapshotDate,
          followers: stats.subscribers,
          engagementRatePct: erPct,
          avgViews,
          lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
          postsInWindow: windowVideos.length,
        })
        .onConflictDoUpdate({
          target: [
            creatorStatsDaily.creatorPlatformId,
            creatorStatsDaily.snapshotDate,
          ],
          set: {
            followers: stats.subscribers,
            engagementRatePct: erPct,
            avgViews,
            lastPostDate: lastPost ? lastPost.toISOString().slice(0, 10) : null,
            postsInWindow: windowVideos.length,
          },
        });

      // Recompute the creator-level ranking number from all platform fits.
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

      summary.refreshed++;
    } catch (e) {
      summary.errors++;
      console.error(`YT stats refresh failed for @${p.handle}:`, e);
    }
  }
  return summary;
}
