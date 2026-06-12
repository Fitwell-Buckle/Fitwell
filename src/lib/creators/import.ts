/**
 * CSV → creator-record transform for the 735-creator research dataset
 * (Fitwell_Creators_CrossPlatform.csv). Pure: no DB access — the upserts
 * live in scripts/import-creators-csv.ts so this layer is unit-testable.
 *
 * The header mapping below is alias-driven because the research CSV's
 * exact headers may differ from our canonical names. Unknown columns are
 * ignored; missing *required* columns fail loudly with the full header
 * list so fixing the mapping is a one-minute edit here.
 *
 * Scores are recomputed from raw fields (not trusted from the CSV) so the
 * import and the nightly stats refresh share one implementation —
 * specs/strategy/creator-scoring.md §8.
 */

import {
  chooseEmail,
  classifyEmailKind,
  crossPlatformFit,
  extractEmails,
  fitScore,
  mentionsFitwell,
  normalizeHandle,
  primaryPlatform,
  watchConfidence,
  watchScore,
  type EmailKind,
  type Platform,
} from "./scoring";

// ─── CSV parsing (RFC-4180: quoted fields, escaped quotes, CRLF) ────

export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// ─── Header mapping ─────────────────────────────────────────────────

/** canonical field → accepted header aliases (compared lowercased). */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "creator_name", "display_name", "full_name"],
  ig_handle: ["ig_handle", "instagram_handle", "ig_username", "instagram"],
  ig_url: ["ig_url", "ig_profile_url", "instagram_url"],
  ig_followers: ["ig_followers", "instagram_followers", "followers_count"],
  ig_er_pct: [
    "ig_er_pct",
    "ig_engagement_rate",
    "ig_engagement_rate_pct",
    "ig_er",
    "engagement_rate",
  ],
  ig_avg_likes: ["ig_avg_likes", "avg_likes"],
  ig_avg_comments: ["ig_avg_comments", "avg_comments"],
  ig_bio: ["ig_bio", "instagram_bio", "biography", "bio"],
  ig_captions: ["ig_captions", "ig_recent_captions", "latest_posts_text"],
  ig_last_post_date: ["ig_last_post_date", "ig_last_post"],
  ig_posts_in_window: ["ig_posts_in_window", "ig_recent_posts"],
  ig_is_business: ["ig_is_business", "is_business_account", "ig_is_business_account"],
  ig_is_verified: ["ig_is_verified", "ig_verified"],
  ig_external_url: ["ig_external_url", "external_url"],
  ig_data_source: ["ig_data_source"],
  ig_email: ["ig_email"],
  ig_watch_score: ["ig_watch_score"],
  ig_fit_score: ["ig_fit_score"],
  yt_handle: ["yt_handle", "youtube_handle", "yt_channel", "channel_handle"],
  yt_url: ["yt_url", "youtube_url", "channel_url"],
  yt_subscribers: ["yt_subscribers", "youtube_subscribers", "subscribers"],
  yt_er_pct: [
    "yt_er_pct",
    "yt_engagement_rate",
    "yt_engagement_rate_90d_pct",
    "yt_er",
  ],
  yt_avg_views: ["yt_avg_views", "avg_views", "yt_avg_views_90d"],
  yt_bio: ["yt_bio", "yt_description", "channel_description", "yt_channel_description"],
  yt_titles: ["yt_titles", "yt_video_titles", "recent_video_titles"],
  yt_last_post_date: [
    "yt_last_post_date",
    "yt_last_video_date",
    "last_video_date",
    "yt_last_upload",
  ],
  yt_data_source: ["yt_data_source"],
  yt_business_email: ["yt_business_email"],
  yt_any_email: ["yt_any_email"],
  yt_watch_score: ["yt_watch_score"],
  yt_fit_score: ["yt_fit_score"],
  email_chosen: ["email_chosen", "email", "contact_email", "best_email"],
  emails_all: ["emails_all", "emails", "all_emails"],
  cross_platform_fit: ["cross_platform_fit"],
  data_source: ["data_source", "source", "match_method"],
  notes: ["notes"],
};

export interface HeaderMap {
  [canonical: string]: number;
}

export function mapHeaders(headerRow: string[]): HeaderMap {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  const map: HeaderMap = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        map[canonical] = idx;
        break;
      }
    }
  }
  if (map.ig_handle === undefined && map.yt_handle === undefined) {
    throw new Error(
      `CSV header has no recognizable handle column. Headers found: ${headerRow.join(", ")}\n` +
        `Add the actual header name to HEADER_ALIASES in src/lib/creators/import.ts.`,
    );
  }
  return map;
}

// ─── Field coercion ─────────────────────────────────────────────────

function cell(row: string[], map: HeaderMap, field: string): string | null {
  const idx = map[field];
  if (idx === undefined) return null;
  const v = row[idx]?.trim();
  return v ? v : null;
}

/** "12,345" | "12.3K" | "1.2M" → number */
export function parseCount(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim().toLowerCase();
  const suffixed = cleaned.match(/^([\d.]+)\s*([km])$/);
  if (suffixed) {
    const base = parseFloat(suffixed[1]);
    return Math.round(base * (suffixed[2] === "k" ? 1_000 : 1_000_000));
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parseRate(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string | null): boolean | null {
  if (!raw) return null;
  return ["true", "yes", "1", "y"].includes(raw.trim().toLowerCase());
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // US-style M/D/YY or M/D/YYYY (the research CSV uses "5/22/26") — parse
  // explicitly; JS Date's two-digit-year handling is unreliable.
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let year = parseInt(us[3], 10);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(year, parseInt(us[1], 10) - 1, parseInt(us[2], 10)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

// ─── Transform ──────────────────────────────────────────────────────

export interface TransformedPlatform {
  platform: Platform;
  handle: string;
  profileUrl: string | null;
  bio: string | null;
  dataSource: string | null;
  isBusinessAccount: boolean | null;
  isVerified: boolean | null;
  externalUrl: string | null;
  watchScore: number;
  watchConfidence: string;
  fitScore: number;
  fitScorePartial: boolean;
  stats: {
    followers: number | null;
    engagementRatePct: number | null;
    avgLikes: number | null;
    avgComments: number | null;
    avgViews: number | null;
    lastPostDate: Date | null;
    postsInWindow: number | null;
  };
}

export interface TransformedCreator {
  name: string;
  primaryPlatform: Platform | null;
  crossPlatformFit: number;
  notes: string | null;
  platforms: TransformedPlatform[];
  emails: { email: string; kind: EmailKind; source: string }[];
  /** Bio/captions mention Fitwell already — surfaced for outreach prioritisation. */
  mentionedUs: boolean;
}

export interface TransformIssue {
  rowIndex: number; // 1-based, excluding header
  reason: string;
}

export interface TransformResult {
  creators: TransformedCreator[];
  issues: TransformIssue[];
}

/** Per-keyword caps differ by text depth (scoring doc §1). */
const IG_BIO_CAP = 5;
const CAPTION_HEAVY_CAP = 8;

export function transformCsv(raw: string, asOf: Date): TransformResult {
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    throw new Error("CSV has no data rows.");
  }
  const map = mapHeaders(rows[0]);
  const creators: TransformedCreator[] = [];
  const issues: TransformIssue[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const igHandleRaw = cell(row, map, "ig_handle");
    const ytHandleRaw = cell(row, map, "yt_handle");
    if (!igHandleRaw && !ytHandleRaw) {
      issues.push({ rowIndex: i, reason: "no IG or YT handle" });
      continue;
    }

    const platforms: TransformedPlatform[] = [];
    let mentioned = false;

    const emailRaw = cell(row, map, "email_chosen");
    const emailsAllRaw = cell(row, map, "emails_all");
    // Gather emails from explicit columns + extraction from bios.
    const emailSet = new Map<string, string>(); // email → source

    if (igHandleRaw) {
      const bio = cell(row, map, "ig_bio");
      const captions = cell(row, map, "ig_captions");
      const scoreText = [bio, captions].filter(Boolean).join("\n");
      // Prefer the research pass's precomputed scores: they were computed
      // from bio + captions, and the CSV only carries the bio — recomputing
      // here would silently deflate everyone. Compute only when absent.
      const providedWs = parseRate(cell(row, map, "ig_watch_score"));
      const ws =
        providedWs ?? watchScore(scoreText, captions ? CAPTION_HEAVY_CAP : IG_BIO_CAP);
      const followers = parseCount(cell(row, map, "ig_followers")) ?? 0;
      const erPct = parseRate(cell(row, map, "ig_er_pct"));
      const lastPost = parseDate(cell(row, map, "ig_last_post_date"));
      const emailKindForFit = emailRaw
        ? classifyEmailKind(emailRaw)
        : null;
      const providedFit = parseRate(cell(row, map, "ig_fit_score"));
      const fit =
        providedFit !== null
          ? { fitScore: providedFit, partial: false }
          : fitScore({
              watchScore: ws,
              followers,
              emailKind: emailKindForFit,
              erPct,
              daysSinceLastPost: lastPost ? daysBetween(lastPost, asOf) : null,
            });
      mentioned ||= mentionsFitwell(scoreText);
      const igEmailCol = cell(row, map, "ig_email");
      if (igEmailCol) emailSet.set(igEmailCol.toLowerCase(), "ig");
      for (const e of extractEmails(scoreText)) {
        if (!emailSet.has(e)) emailSet.set(e, "ig");
      }
      platforms.push({
        platform: "ig",
        handle: normalizeHandle(igHandleRaw),
        profileUrl: cell(row, map, "ig_url"),
        bio,
        dataSource: cell(row, map, "ig_data_source") ?? cell(row, map, "data_source"),
        isBusinessAccount: parseBool(cell(row, map, "ig_is_business")),
        isVerified: parseBool(cell(row, map, "ig_is_verified")),
        externalUrl: cell(row, map, "ig_external_url"),
        watchScore: ws,
        watchConfidence: watchConfidence(ws, "ig"),
        fitScore: fit.fitScore,
        fitScorePartial: fit.partial,
        stats: {
          followers,
          engagementRatePct: erPct,
          avgLikes: parseRate(cell(row, map, "ig_avg_likes")),
          avgComments: parseRate(cell(row, map, "ig_avg_comments")),
          avgViews: null,
          lastPostDate: lastPost,
          postsInWindow: parseCount(cell(row, map, "ig_posts_in_window")),
        },
      });
    }

    if (ytHandleRaw) {
      const bio = cell(row, map, "yt_bio");
      const titles = cell(row, map, "yt_titles");
      const scoreText = [bio, titles].filter(Boolean).join("\n");
      // Same provided-score preference as IG (see comment there).
      const providedWs = parseRate(cell(row, map, "yt_watch_score"));
      // YT inputs are caption-heavy (description + video titles).
      const ws = providedWs ?? watchScore(scoreText, CAPTION_HEAVY_CAP);
      const subscribers = parseCount(cell(row, map, "yt_subscribers")) ?? 0;
      const erPct = parseRate(cell(row, map, "yt_er_pct"));
      const lastPost = parseDate(cell(row, map, "yt_last_post_date"));
      const emailKindForFit = emailRaw ? classifyEmailKind(emailRaw) : null;
      const providedFit = parseRate(cell(row, map, "yt_fit_score"));
      const fit =
        providedFit !== null
          ? { fitScore: providedFit, partial: false }
          : fitScore({
              watchScore: ws,
              followers: subscribers,
              emailKind: emailKindForFit,
              erPct,
              daysSinceLastPost: lastPost ? daysBetween(lastPost, asOf) : null,
            });
      mentioned ||= mentionsFitwell(scoreText);
      for (const col of ["yt_business_email", "yt_any_email"]) {
        const v = cell(row, map, col);
        if (v && !emailSet.has(v.toLowerCase())) {
          emailSet.set(v.toLowerCase(), "yt");
        }
      }
      for (const e of extractEmails(scoreText)) {
        if (!emailSet.has(e)) emailSet.set(e, "yt");
      }
      platforms.push({
        platform: "yt",
        handle: normalizeHandle(ytHandleRaw),
        profileUrl: cell(row, map, "yt_url"),
        bio,
        dataSource: cell(row, map, "yt_data_source") ?? cell(row, map, "data_source"),
        isBusinessAccount: null,
        isVerified: null,
        externalUrl: null,
        watchScore: ws,
        watchConfidence: watchConfidence(ws, "yt"),
        fitScore: fit.fitScore,
        fitScorePartial: fit.partial,
        stats: {
          followers: subscribers,
          engagementRatePct: erPct,
          avgLikes: null,
          avgComments: null,
          avgViews: parseRate(cell(row, map, "yt_avg_views")),
          lastPostDate: lastPost,
          postsInWindow: null,
        },
      });
    }

    // Explicit email columns win ordering; extracted ones follow.
    const explicit: string[] = [];
    if (emailRaw) explicit.push(emailRaw.toLowerCase());
    if (emailsAllRaw) {
      for (const e of emailsAllRaw.split(/[;|]/)) {
        const t = e.trim().toLowerCase();
        if (t) explicit.push(t);
      }
    }
    const allEmails = [
      ...explicit,
      ...[...emailSet.keys()].filter((e) => !explicit.includes(e)),
    ];
    const emails = allEmails.map((email) => ({
      email,
      kind: classifyEmailKind(email),
      source: emailSet.get(email) ?? "manual",
    }));

    const ig = platforms.find((p) => p.platform === "ig");
    const yt = platforms.find((p) => p.platform === "yt");
    const name =
      cell(row, map, "name") ?? ig?.handle ?? yt?.handle ?? `row-${i}`;

    const providedCross = parseRate(cell(row, map, "cross_platform_fit"));
    creators.push({
      name,
      primaryPlatform: primaryPlatform(
        ig ? (ig.stats.followers ?? 0) : null,
        yt ? (yt.stats.followers ?? 0) : null,
      ),
      crossPlatformFit:
        providedCross ?? crossPlatformFit(platforms.map((p) => p.fitScore)),
      notes: cell(row, map, "notes"),
      platforms,
      emails,
      mentionedUs: mentioned,
    });
  }

  return { creators, issues };
}

export { chooseEmail };
