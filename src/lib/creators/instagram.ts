/**
 * Instagram post fetching via Apify (creator program Phase 5 — no Meta
 * app review needed; feed posts are the deliverable, polling catches
 * them). Requires APIFY_TOKEN; actor defaults to the public
 * instagram-profile-scraper and can be overridden with APIFY_IG_ACTOR.
 * Cost note: ~$1–2/month at the throttled cadence (≤50 profiles / 6h).
 */

import type { FetchedPost } from "./post-detection";

const DEFAULT_ACTOR = "apify~instagram-profile-scraper";

export function instagramConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}

interface ApifyIgPost {
  url?: string;
  caption?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
}

interface ApifyIgProfile {
  username?: string;
  followersCount?: number;
  biography?: string;
  latestPosts?: ApifyIgPost[];
}

export interface IgProfileResult {
  followers: number | null;
  bio: string | null;
  posts: FetchedPost[];
}

/**
 * Run the Apify profile scraper synchronously for a batch of handles and
 * return profile stats + latest posts per handle. One actor run per
 * batch keeps cost predictable (the cron throttles to ≤50 per cycle).
 */
export async function fetchIgProfiles(
  handles: string[],
): Promise<Map<string, IgProfileResult>> {
  const actor = process.env.APIFY_IG_ACTOR ?? DEFAULT_ACTOR;
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: handles }),
    },
  );
  if (!res.ok) {
    throw new Error(`Apify run failed ${res.status}: ${await res.text()}`);
  }
  const profiles = (await res.json()) as ApifyIgProfile[];

  const out = new Map<string, IgProfileResult>();
  for (const profile of profiles) {
    if (!profile.username) continue;
    const posts: FetchedPost[] = (profile.latestPosts ?? []).flatMap((p) => {
      if (!p.url) return [];
      const ts = p.timestamp ? new Date(p.timestamp) : null;
      return [
        {
          postUrl: p.url,
          postedAt: ts && !Number.isNaN(ts.getTime()) ? ts : null,
          caption: p.caption ?? null,
          likes: p.likesCount ?? null,
          comments: p.commentsCount ?? null,
          views: p.videoViewCount ?? null,
        },
      ];
    });
    out.set(profile.username.toLowerCase(), {
      followers: profile.followersCount ?? null,
      bio: profile.biography ?? null,
      posts,
    });
  }
  return out;
}
