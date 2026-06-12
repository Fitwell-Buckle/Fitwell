/**
 * Minimal YouTube Data API v3 client for creator post detection.
 * Quota: ~2 units per creator per run (channels.list + playlistItems.list)
 * → ~1K units/night for 500 tracked channels, well inside the 10K/day
 * default. Requires YOUTUBE_API_KEY (rotate per creator-program.md §
 * out-of-band note — the research-pass key is burned).
 */

import type { FetchedPost } from "./post-detection";

const API = "https://www.googleapis.com/youtube/v3";

export function youtubeConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({
    ...params,
    key: process.env.YOUTUBE_API_KEY!,
  });
  const res = await fetch(`${API}/${path}?${qs}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`YouTube ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface ChannelStats {
  subscribers: number | null;
  description: string | null;
  /** ISO 3166-1 alpha-2, when the creator has set it on their channel. */
  country: string | null;
  /** Recent uploads with per-video stats — drives ER + last-post. */
  videos: (FetchedPost & { title: string | null })[];
}

/**
 * Channel statistics + recent uploads with per-video like/comment/view
 * counts, for the nightly stats refresh. ~4 quota units per channel
 * (channels.list ×2 lookups, playlistItems, videos.list).
 */
export async function fetchChannelStats(
  handle: string,
  limit = 10,
): Promise<ChannelStats | null> {
  const channels = await yt<{
    items?: {
      snippet?: { description?: string; country?: string };
      statistics?: { subscriberCount?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>("channels", {
    part: "snippet,statistics,contentDetails",
    forHandle: `@${handle}`,
  });
  const ch = channels.items?.[0];
  const uploads = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!ch || !uploads) return null;

  const playlist = await yt<{
    items?: { snippet?: { resourceId?: { videoId?: string } } }[];
  }>("playlistItems", {
    part: "snippet",
    playlistId: uploads,
    maxResults: String(limit),
  });
  const videoIds = (playlist.items ?? [])
    .map((i) => i.snippet?.resourceId?.videoId)
    .filter((v): v is string => !!v);

  let videos: ChannelStats["videos"] = [];
  if (videoIds.length > 0) {
    const details = await yt<{
      items?: {
        id?: string;
        snippet?: { title?: string; description?: string; publishedAt?: string };
        statistics?: { likeCount?: string; commentCount?: string; viewCount?: string };
      }[];
    }>("videos", { part: "snippet,statistics", id: videoIds.join(",") });
    videos = (details.items ?? []).flatMap((v) => {
      if (!v.id) return [];
      const published = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null;
      return [
        {
          postUrl: `https://www.youtube.com/watch?v=${v.id}`,
          postedAt: published && !Number.isNaN(published.getTime()) ? published : null,
          title: v.snippet?.title ?? null,
          caption: [v.snippet?.title, v.snippet?.description].filter(Boolean).join("\n"),
          likes: v.statistics?.likeCount ? parseInt(v.statistics.likeCount, 10) : null,
          comments: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : null,
          views: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : null,
        },
      ];
    });
  }

  return {
    subscribers: ch.statistics?.subscriberCount
      ? parseInt(ch.statistics.subscriberCount, 10)
      : null,
    description: ch.snippet?.description ?? null,
    country: ch.snippet?.country?.toUpperCase() ?? null,
    videos,
  };
}

/** Last `limit` uploads for a channel handle (e.g. "watchhenry"). */
export async function fetchRecentVideos(
  handle: string,
  limit = 5,
): Promise<FetchedPost[]> {
  const channels = await yt<{
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  }>("channels", { part: "contentDetails", forHandle: `@${handle}` });

  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return []; // handle not found / no uploads playlist

  const playlist = await yt<{
    items?: {
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        resourceId?: { videoId?: string };
      };
    }[];
  }>("playlistItems", {
    part: "snippet",
    playlistId: uploads,
    maxResults: String(limit),
  });

  return (playlist.items ?? []).flatMap((item) => {
    const videoId = item.snippet?.resourceId?.videoId;
    if (!videoId) return [];
    const publishedAt = item.snippet?.publishedAt
      ? new Date(item.snippet.publishedAt)
      : null;
    return [
      {
        postUrl: `https://www.youtube.com/watch?v=${videoId}`,
        postedAt:
          publishedAt && !Number.isNaN(publishedAt.getTime())
            ? publishedAt
            : null,
        caption: [item.snippet?.title, item.snippet?.description]
          .filter(Boolean)
          .join("\n"),
        likes: null,
        comments: null,
        views: null,
      },
    ];
  });
}
