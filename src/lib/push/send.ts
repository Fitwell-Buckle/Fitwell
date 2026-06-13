import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscription } from "@/lib/schema";

// What a push notification carries. `url` is the deep-link the service worker
// opens on tap; `tag` collapses duplicate alerts for the same entity.
export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export type PushSendResult = {
  /** False when VAPID env isn't set — callers can treat as a no-op, not an error. */
  configured: boolean;
  /** Devices the push was accepted by. */
  sent: number;
  /** Dead subscriptions pruned (404/410 from the push service). */
  pruned: number;
};

// Read env lazily (not at module load) so config changes and tests are picked
// up without import-order gymnastics.
let configuredKeys: string | null = null;
function ensureVapid(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "https://portal.fitwellbuckle.co";
  if (!pub || !priv) return false;
  // Re-apply only when the keys actually change.
  const fingerprint = `${pub}:${subject}`;
  if (configuredKeys !== fingerprint) {
    webpush.setVapidDetails(subject, pub, priv);
    configuredKeys = fingerprint;
  }
  return true;
}

/** Whether Web Push is configured (VAPID keys present). */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type SubRow = typeof pushSubscription.$inferSelect;

// Send one payload to a set of subscription rows. Prunes any the push service
// rejects as gone (404/410). Best-effort per device — one failure never stops
// the others. Exported for unit testing; callers use the by-user / broadcast
// wrappers below.
export async function sendToSubscriptions(
  subs: SubRow[],
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!ensureVapid()) return { configured: false, sent: 0, pruned: 0 };
  if (subs.length === 0) return { configured: true, sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404 Not Found / 410 Gone → the subscription is permanently dead.
        if (status === 404 || status === 410) {
          dead.push(s.id);
        } else {
          console.error("Web push send failed:", status, err);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await db.delete(pushSubscription).where(inArray(pushSubscription.id, dead));
  }

  return { configured: true, sent, pruned: dead.length };
}

/** Push to every device a single user has registered (used by the test button). */
export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!isPushConfigured()) return { configured: false, sent: 0, pruned: 0 };
  const subs = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
  return sendToSubscriptions(subs, payload);
}

/**
 * Push to every registered admin device. Used by the in-app notification path
 * so a new alert buzzes phones. Best-effort: never throw into the caller (a
 * notification insert must not fail because push did).
 */
export async function broadcastWebPush(
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!isPushConfigured()) return { configured: false, sent: 0, pruned: 0 };
  try {
    const subs = await db.select().from(pushSubscription);
    return await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.error("broadcastWebPush failed:", err);
    return { configured: true, sent: 0, pruned: 0 };
  }
}
