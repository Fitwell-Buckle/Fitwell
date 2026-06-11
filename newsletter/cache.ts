/**
 * Brief cache — lets layout/branding iteration re-render without paying
 * for the editorial pipeline again.
 *
 * The expensive phase (fetch → dedup → triage → enrich → summarize) makes
 * ~13 Claude calls per run and produces a BriefStory[]. Rendering that to
 * HTML is free. So a real run writes the assembled brief here, and
 * `--cached` reloads it and skips straight to render — turning a
 * dollar-a-run layout tweak into a zero-cost one. Keyed by campaign slug
 * (one per day), so same-day iteration reuses the morning's brief.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BriefStory } from "./types";

const CACHE_VERSION = 2;

export function briefCachePath(slug: string): string {
  return `/tmp/${slug}.brief.json`;
}

/** Persist the assembled brief so `--cached` can re-render it for free. */
export function saveBriefCache(
  slug: string,
  now: Date,
  brief: BriefStory[],
): string {
  const path = briefCachePath(slug);
  writeFileSync(
    path,
    JSON.stringify(
      { version: CACHE_VERSION, slug, now: now.toISOString(), brief },
      null,
      2,
    ),
  );
  return path;
}

/**
 * Reload a cached brief by slug. Throws a helpful error (rather than
 * silently re-running the paid pipeline) when no cache exists or the
 * format has changed. Revives publishedAt back into a Date.
 */
export function loadBriefCache(slug: string): BriefStory[] {
  const path = briefCachePath(slug);
  if (!existsSync(path)) {
    throw new Error(
      `No cached brief at ${path}. Run once without --cached first to generate one.`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.version !== CACHE_VERSION) {
    throw new Error(
      `Cached brief at ${path} is version ${raw.version}, expected ${CACHE_VERSION}. Regenerate without --cached.`,
    );
  }
  return (raw.brief as BriefStory[]).map((s) => ({
    ...s,
    publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
  }));
}
