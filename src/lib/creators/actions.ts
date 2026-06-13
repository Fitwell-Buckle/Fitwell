/**
 * Creator action engine (lifecycle chunk 3): the daily "ping me" pass.
 *   1. Outreach follow-ups due → notification
 *   2. Sample delivered + no follow-up since → notification with a
 *      ready-to-send draft (human approves; nothing auto-sends)
 *   3. Expected post date passed, no post detected → nudge with draft
 *   4. Stale no_reply threads (60d) → auto-burn with a note
 *
 * Notifications dedupe on (type, href) within a 7-day window so the
 * daily cron doesn't re-ping the same situation every morning.
 */

import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import {
  adminNotification,
  creator,
  creatorAsset,
  creatorOutreach,
  creatorOutreachEvent,
  creatorPost,
  influencerOrder,
} from "@/lib/schema";
import {
  AUTO_BURN_AFTER_DAYS,
  postOverdueNudgeDraft,
  sampleDeliveredDraft,
} from "./lifecycle";
import { EXPIRY_WARNING_DAYS } from "./assets";

export interface ActionSummary {
  followupsDue: number;
  deliveredNeedingFollowup: number;
  postsOverdue: number;
  autoBurned: number;
  rightsExpiring: number;
}

const DEDUPE_WINDOW_DAYS = 7;

async function notifyOnce(params: {
  type: string;
  title: string;
  body: string | null;
  href: string;
}): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000);
  const existing = await db.query.adminNotification.findFirst({
    where: and(
      eq(adminNotification.type, params.type),
      eq(adminNotification.href, params.href),
      gt(adminNotification.createdAt, cutoff),
    ),
    columns: { id: true },
  });
  if (existing) return false;
  await createAdminNotification(params);
  return true;
}

export async function runCreatorActions(): Promise<ActionSummary> {
  const now = new Date();
  const summary: ActionSummary = {
    followupsDue: 0,
    deliveredNeedingFollowup: 0,
    postsOverdue: 0,
    autoBurned: 0,
    rightsExpiring: 0,
  };

  // ── 1. Follow-ups due ─────────────────────────────────────────────
  const due = await db
    .select({
      threadId: creatorOutreach.id,
      creatorId: creatorOutreach.creatorId,
      channel: creatorOutreach.channel,
      name: creator.name,
    })
    .from(creatorOutreach)
    .innerJoin(creator, eq(creatorOutreach.creatorId, creator.id))
    .where(
      and(
        lte(creatorOutreach.nextFollowupAt, now),
        sql`${creator.status} not in ('burned', 'archived')`,
        sql`${creator.vettingStatus} != 'rejected'`,
      ),
    );
  for (const t of due) {
    const created = await notifyOnce({
      type: "creator_followup",
      title: `Follow up with ${t.name}`,
      body: `Outreach via ${t.channel} is due a follow-up.`,
      href: `/creators/${t.creatorId}`,
    });
    if (created) summary.followupsDue++;
  }

  // ── 2. Sample delivered, no follow-up since ───────────────────────
  const delivered = await db
    .select({
      orderId: influencerOrder.id,
      creatorId: influencerOrder.creatorId,
      deliveredAt: influencerOrder.deliveredAt,
      name: creator.name,
    })
    .from(influencerOrder)
    .innerJoin(creator, eq(influencerOrder.creatorId, creator.id))
    .where(isNotNull(influencerOrder.deliveredAt));
  for (const d of delivered) {
    if (!d.creatorId || !d.deliveredAt) continue;
    const followedUp = await db
      .select({ id: creatorOutreachEvent.id })
      .from(creatorOutreachEvent)
      .innerJoin(
        creatorOutreach,
        eq(creatorOutreachEvent.outreachId, creatorOutreach.id),
      )
      .where(
        and(
          eq(creatorOutreach.creatorId, d.creatorId),
          eq(creatorOutreachEvent.direction, "out"),
          gt(creatorOutreachEvent.occurredAt, d.deliveredAt),
        ),
      )
      .limit(1);
    if (followedUp.length > 0) continue;
    const created = await notifyOnce({
      type: "creator_sample_delivered",
      title: `Sample landed — follow up with ${d.name}`,
      body: `Draft (edit + send from your mailbox, then log it on the thread):\n\n${sampleDeliveredDraft(d.name)}`,
      href: `/creators/${d.creatorId}`,
    });
    if (created) summary.deliveredNeedingFollowup++;
  }

  // ── 3. Expected post overdue ──────────────────────────────────────
  const today = now.toISOString().slice(0, 10);
  const overdue = await db
    .select({
      orderId: influencerOrder.id,
      creatorId: influencerOrder.creatorId,
      contentDueDate: influencerOrder.contentDueDate,
      name: creator.name,
    })
    .from(influencerOrder)
    .innerJoin(creator, eq(influencerOrder.creatorId, creator.id))
    .where(
      and(
        isNotNull(influencerOrder.creatorId),
        isNull(influencerOrder.publishedAt),
        sql`${influencerOrder.contentDueDate} < ${today}`,
        eq(influencerOrder.status, "sent"),
      ),
    );
  for (const o of overdue) {
    if (!o.creatorId || !o.contentDueDate) continue;
    const posted = await db
      .select({ id: creatorPost.id })
      .from(creatorPost)
      .where(eq(creatorPost.giftOrderId, o.orderId))
      .limit(1);
    if (posted.length > 0) continue; // detection beat the human to it
    const created = await notifyOnce({
      type: "creator_post_overdue",
      title: `Post overdue — ${o.name}`,
      body: `Expected ${o.contentDueDate}. Draft nudge:\n\n${postOverdueNudgeDraft(o.name, o.contentDueDate)}`,
      href: `/creators/${o.creatorId}`,
    });
    if (created) summary.postsOverdue++;
  }

  // ── 4. Auto-burn stale silence ────────────────────────────────────
  const staleCutoff = new Date(now.getTime() - AUTO_BURN_AFTER_DAYS * 86_400_000);
  const stale = await db
    .select({
      threadId: creatorOutreach.id,
      creatorId: creatorOutreach.creatorId,
      name: creator.name,
      status: creator.status,
    })
    .from(creatorOutreach)
    .innerJoin(creator, eq(creatorOutreach.creatorId, creator.id))
    .where(
      and(
        eq(creatorOutreach.status, "no_reply"),
        lte(creatorOutreach.lastContactAt, staleCutoff),
        sql`${creator.status} not in ('burned', 'archived')`,
      ),
    );
  for (const s of stale) {
    await db
      .update(creatorOutreach)
      .set({ status: "ghosted", nextFollowupAt: null, updatedAt: now })
      .where(eq(creatorOutreach.id, s.threadId));
    await db.insert(creatorOutreachEvent).values({
      outreachId: s.threadId,
      direction: "status",
      summary: `Auto-burned: no reply for ${AUTO_BURN_AFTER_DAYS} days`,
      createdBy: "system",
    });
    const burnedUntil = new Date(now);
    burnedUntil.setMonth(burnedUntil.getMonth() + 12);
    await db
      .update(creator)
      .set({
        status: "burned",
        burnedUntilDate: burnedUntil.toISOString().slice(0, 10),
        updatedAt: now,
      })
      .where(eq(creator.id, s.creatorId));
    await notifyOnce({
      type: "creator_auto_burned",
      title: `Auto-burned ${s.name} (60d silence)`,
      body: "No reply in 60 days — moved to burned with a 12-month cool-off. Restore from the creator page if that's wrong.",
      href: `/creators/${s.creatorId}`,
    });
    summary.autoBurned++;
  }

  // ── 5. Paid-usage rights expiring within the warning window ──────
  const warningEnd = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const expiring = await db
    .select({
      assetId: creatorAsset.id,
      creatorId: creatorAsset.creatorId,
      storageUrl: creatorAsset.storageUrl,
      expiresAt: creatorAsset.rightsExpiresAt,
      name: creator.name,
    })
    .from(creatorAsset)
    .innerJoin(creator, eq(creatorAsset.creatorId, creator.id))
    .where(
      and(
        isNotNull(creatorAsset.rightsExpiresAt),
        gt(creatorAsset.rightsExpiresAt, now), // not yet expired
        lte(creatorAsset.rightsExpiresAt, warningEnd),
      ),
    );
  for (const a of expiring) {
    const created = await notifyOnce({
      type: "creator_rights_expiring",
      title: `Paid-usage rights expiring — ${a.name}`,
      body:
        `Rights on ${a.storageUrl} lapse ${a.expiresAt?.toISOString().slice(0, 10)}. ` +
        `Pull it from paid placements by then, or renegotiate an extension.`,
      href: `/creators/${a.creatorId}`,
    });
    if (created) summary.rightsExpiring++;
  }

  return summary;
}
