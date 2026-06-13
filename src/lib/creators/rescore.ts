/**
 * Server-side rollup persistence. After a platform is edited, split off,
 * reassigned, or deleted, a creator's cross_platform_fit and
 * primary_platform may no longer match the platforms it owns. This reloads
 * them and writes the recomputed rollups using the pure helpers in edit.ts.
 *
 * Always call this for BOTH sides of a move (source loses a platform,
 * target gains one).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator, creatorPlatform, creatorStatsDaily } from "@/lib/schema";
import { recomputeRollups } from "./edit";

export async function persistRollups(creatorId: string): Promise<void> {
  const platforms = await db
    .select({
      id: creatorPlatform.id,
      platform: creatorPlatform.platform,
      fitScore: creatorPlatform.fitScore,
    })
    .from(creatorPlatform)
    .where(eq(creatorPlatform.creatorId, creatorId));

  // Latest followers per platform — breaks the primary-platform tie.
  const platformIds = platforms.map((p) => p.id);
  const latestFollowers = new Map<string, number | null>();
  if (platformIds.length) {
    const snaps = await db
      .select({
        creatorPlatformId: creatorStatsDaily.creatorPlatformId,
        snapshotDate: creatorStatsDaily.snapshotDate,
        followers: creatorStatsDaily.followers,
      })
      .from(creatorStatsDaily)
      .where(inArray(creatorStatsDaily.creatorPlatformId, platformIds))
      .orderBy(desc(creatorStatsDaily.snapshotDate));
    for (const s of snaps) {
      if (!latestFollowers.has(s.creatorPlatformId)) {
        latestFollowers.set(s.creatorPlatformId, s.followers);
      }
    }
  }

  const { crossPlatformFit, primaryPlatform } = recomputeRollups(
    platforms.map((p) => ({
      platform: p.platform,
      fitScore: p.fitScore,
      followers: latestFollowers.get(p.id) ?? null,
    })),
  );

  await db
    .update(creator)
    .set({ crossPlatformFit, primaryPlatform, updatedAt: new Date() })
    .where(eq(creator.id, creatorId));
}

/** Guard: is (platform, handle) already taken by a *different* platform row? */
export async function handleTaken(
  platform: string,
  handle: string,
  exceptPlatformId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: creatorPlatform.id })
    .from(creatorPlatform)
    .where(
      and(
        eq(creatorPlatform.platform, platform),
        eq(creatorPlatform.handle, handle),
      ),
    );
  return rows.some((r) => r.id !== exceptPlatformId);
}
