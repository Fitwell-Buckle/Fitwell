/**
 * Post-detection core (creator program Phase 5) — pure logic shared by the
 * YouTube + Instagram polling crons and manual entry. Platform fetching
 * lives in youtube.ts / instagram.ts; DB writes in extract-posts.ts.
 */

import { mentionsFitwell } from "./scoring";

export interface FetchedPost {
  postUrl: string;
  postedAt: Date | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
}

export interface GiftOrderCandidate {
  id: string;
  /** When the sample went out (sent_at, falling back to issued_date). */
  sentAt: Date | null;
}

/** Days a post can trail the sample and still be linked to it. */
export const GIFT_MATCH_WINDOW_DAYS = 30;

/**
 * The gifting order this post most plausibly fulfills: the most recent
 * order sent within the window before the post. Undated posts match the
 * most recent order sent within the window before *now* (best effort).
 */
export function matchGiftOrder(
  post: Pick<FetchedPost, "postedAt">,
  orders: GiftOrderCandidate[],
  now: Date = post.postedAt ?? new Date(0),
): string | null {
  const anchor = post.postedAt ?? now;
  if (anchor.getTime() === 0) return null;
  const windowMs = GIFT_MATCH_WINDOW_DAYS * 86_400_000;
  let best: GiftOrderCandidate | null = null;
  for (const o of orders) {
    if (!o.sentAt) continue;
    const delta = anchor.getTime() - o.sentAt.getTime();
    if (delta < 0 || delta > windowMs) continue;
    if (!best || o.sentAt > best.sentAt!) best = o;
  }
  return best?.id ?? null;
}

/** New posts only, deduped by URL against what's already stored. */
export function dedupPosts(
  fetched: FetchedPost[],
  existingUrls: Iterable<string>,
): FetchedPost[] {
  const seen = new Set(existingUrls);
  const out: FetchedPost[] = [];
  for (const p of fetched) {
    if (!p.postUrl || seen.has(p.postUrl)) continue;
    seen.add(p.postUrl);
    out.push(p);
  }
  return out;
}

export interface DetectedPost extends FetchedPost {
  mentionedUs: boolean;
  giftOrderId: string | null;
}

export function detectPosts(
  fetched: FetchedPost[],
  existingUrls: Iterable<string>,
  giftOrders: GiftOrderCandidate[],
  now: Date = new Date(),
): DetectedPost[] {
  return dedupPosts(fetched, existingUrls).map((p) => ({
    ...p,
    mentionedUs: mentionsFitwell(p.caption),
    giftOrderId: matchGiftOrder(p, giftOrders, now),
  }));
}
