/**
 * Newsletter engine entry point.
 *
 *   npm run newsletter:dry-run   # fetch → triage → summarize → HTML to /tmp; no DB writes, no Klaviyo
 *   npm run newsletter:render    # re-render the LAST brief from cache — zero Claude calls (layout iteration)
 *   npm run newsletter:draft     # full run: DB writes + Klaviyo DRAFT campaign (never sends)
 *   npm run newsletter:send      # draft THEN send to NEWSLETTER_KLAVIYO_LIST_ID
 *
 * --cached (used by :render, and combinable with --draft/--send) reuses the
 * brief assembled by the previous real run instead of re-running the ~13-call
 * editorial pipeline. A real run always writes the cache, so iterating on
 * branding/layout — or pushing a Klaviyo test draft — costs nothing extra.
 *
 * Sending stays a manual action in Klaviyo's UI while the voice settles
 * (first ~3 sends, per specs/strategy/newsletter.md). The GitHub Actions
 * workflow runs --draft each weekday morning.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gte } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  newsletterArticle,
  newsletterCampaign,
  newsletterSource,
} from "../src/lib/schema";
import { KlaviyoClient } from "../src/lib/klaviyo/client";
import {
  draftCampaign,
  isCampaignAlreadySentError,
} from "../src/lib/klaviyo/draft-campaign";
import type { CampaignConfig } from "../src/lib/klaviyo/campaign-config";
import { NEWSLETTER, buildSubject, campaignSlug } from "./config";
import { SOURCES, activeSources } from "./sources";
import { fetchAllSources } from "./fetch";
import { filterNew, contentHash, normalizeUrl, type SeenArticle } from "./dedup";
import { triageStories, summarizeAll, writeSubjectLine } from "./editorial";
import { campaignAlreadySent } from "./guard";
import { enrichStories } from "./images";
import { renderBrief } from "./generate";
import { cleanHeadline } from "./text";
import { saveBriefCache, loadBriefCache, type CachedBrief } from "./cache";
import { printRunSummary } from "./run-summary";
import type { BriefStory, RawStory, Segment, StoryType } from "./types";

const SEEN_WINDOW_DAYS = 14;

/**
 * Newsletter uses its own write-scoped Klaviyo key (campaigns + templates
 * write) so the analytics KLAVIYO_API_KEY can stay read-only. Falls back
 * to KLAVIYO_API_KEY if the dedicated key isn't set.
 */
function newsletterKlaviyoClient(): KlaviyoClient {
  return new KlaviyoClient({
    apiKey: process.env.NEWSLETTER_KLAVIYO_API_KEY ?? process.env.KLAVIYO_API_KEY,
  });
}

/** Sync the code-side registry into newsletter_source (upsert on slug). */
async function seedSources(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const def of SOURCES) {
    const [row] = await db
      .insert(newsletterSource)
      .values({
        slug: def.slug,
        name: def.name,
        category: def.category,
        feedUrl: def.feedUrl,
        scrapeUrl: def.scrapeUrl,
        requiresPlaywright: def.fetchMode !== "rss",
        isActive: def.isActive,
      })
      .onConflictDoUpdate({
        target: newsletterSource.slug,
        set: {
          name: def.name,
          category: def.category,
          feedUrl: def.feedUrl,
          scrapeUrl: def.scrapeUrl,
          requiresPlaywright: def.fetchMode !== "rss",
          isActive: def.isActive,
        },
      })
      .returning({ id: newsletterSource.id, slug: newsletterSource.slug });
    idBySlug.set(row.slug, row.id);
  }
  return idBySlug;
}

async function loadSeen(): Promise<SeenArticle[]> {
  const cutoff = new Date(Date.now() - SEEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      url: newsletterArticle.url,
      contentHash: newsletterArticle.contentHash,
      title: newsletterArticle.title,
    })
    .from(newsletterArticle)
    .where(gte(newsletterArticle.createdAt, cutoff));
  return rows;
}

interface RunStats {
  fetched: number;
  feedFailures: Array<{ slug: string; error: string }>;
  duplicates: number;
  triaged: number;
  included: number;
}


async function persistArticles(
  sourceIds: Map<string, string>,
  included: BriefStory[],
  dropped: Array<{ story: RawStory; reason: string }>,
  campaignId: string,
): Promise<void> {
  for (const story of included) {
    await db
      .insert(newsletterArticle)
      .values({
        sourceId: sourceIds.get(story.sourceSlug)!,
        url: normalizeUrl(story.url),
        title: story.title,
        publishedAt: story.publishedAt,
        contentHash: contentHash(story),
        summary: story.summary,
        segment: story.segment,
        type: story.type,
        imageUrl: story.imageUrl,
        includedInCampaignId: campaignId,
      })
      .onConflictDoNothing();
  }
  for (const { story, reason } of dropped) {
    await db
      .insert(newsletterArticle)
      .values({
        sourceId: sourceIds.get(story.sourceSlug)!,
        url: normalizeUrl(story.url),
        title: story.title,
        publishedAt: story.publishedAt,
        contentHash: contentHash(story),
        droppedReason: reason,
      })
      .onConflictDoNothing();
  }
}

async function run(): Promise<void> {
  // Modes (exactly one): --dry-run (HTML to /tmp, no DB/Klaviyo) |
  // --draft (DB + Klaviyo draft, never sends) | --send (draft THEN
  // triggers the Klaviyo send job — the only mode that emails anyone).
  const dryRun = process.argv.includes("--dry-run");
  const send = process.argv.includes("--send");
  const draft = process.argv.includes("--draft") || send; // --send implies a draft first
  // --cached reuses the last assembled brief (zero Claude calls) and skips
  // straight to render — for iterating on layout/branding without paying
  // for the editorial pipeline again. Modifier, not a mode.
  const cached = process.argv.includes("--cached");
  const modeCount = [dryRun, draft].filter(Boolean).length;
  if (modeCount !== 1) {
    console.error(
      "Usage: tsx newsletter/main.ts (--dry-run | --draft | --send) [--cached]",
    );
    process.exit(1);
  }

  const now = new Date();
  const slug = campaignSlug(now);
  const mode = dryRun ? "dry-run" : send ? "send" : "draft";
  console.log(`[${slug}] mode=${mode}${cached ? " (cached — no API calls)" : ""}`);

  // Idempotency guard (draft/send only). If today's issue already went out
  // — e.g. the GitHub schedule: fallback firing after the Vercel-cron
  // primary already sent — back off BEFORE the pipeline runs. This avoids
  // both the wasted editorial spend and, critically, persisting freshly-
  // fetched stories that could never be emailed (the swallowed-stories
  // bug — see newsletter/guard.ts).
  if (!dryRun && (await campaignAlreadySent(slug, newsletterKlaviyoClient()))) {
    console.log(`campaign "${slug}" already sent — skipping run (idempotent no-op).`);
    return;
  }

  // Dropped-article rows to persist (draft/send only). Empty in cached mode:
  // we don't re-run dedup/triage, so there's no fresh drop list to record.
  let droppedForPersist: Array<{ story: RawStory; reason: string }> = [];
  let data: CachedBrief;

  if (cached) {
    data = loadBriefCache(slug);
    console.log(`reusing cached brief: ${data.brief.length} stories`);
  } else {
    const built = await buildBrief(now, dryRun, (d) => (droppedForPersist = d));
    if (!built) return; // nothing new / triage dropped everything
    data = built;
    const path = saveBriefCache(slug, now, data);
    console.log(
      `\ncached brief → ${path}\niterate on layout for free: npm run newsletter:render`,
    );
  }

  const { brief, subject, preheader } = data;

  // 5. Render
  const { html, warnings } = await renderBrief(brief, now, slug, preheader);
  for (const w of warnings) console.warn(`mjml: ${w}`);

  if (dryRun) {
    const outPath = `/tmp/${slug}.html`;
    writeFileSync(outPath, html);
    console.log(`\nsubject: ${subject}`);
    console.log(`preheader: ${preheader}`);
    console.log(
      `stories: ${brief.map((s) => `\n  [${s.segment}/${s.type}] ${s.title}`).join("")}`,
    );
    console.log(`\nwrote ${outPath} — open it in a browser to review`);
    return;
  }

  await publishToKlaviyo({ now, slug, brief, html, subject, droppedForPersist, send });
}

/**
 * The expensive editorial pipeline: fetch → dedup → triage → enrich →
 * summarize → subject line. Returns the assembled brief + its subject and
 * preheader (null = no brief today). `reportDropped` hands back the
 * dedup+triage drop list for DB persistence.
 */
async function buildBrief(
  now: Date,
  dryRun: boolean,
  reportDropped: (dropped: Array<{ story: RawStory; reason: string }>) => void,
): Promise<CachedBrief | null> {
  // 1. Fetch (RSS direct + proxied + scraped, dispatched by fetchMode)
  const sources = activeSources();
  const { stories, failures } = await fetchAllSources(sources, now);
  const stats: RunStats = {
    fetched: stories.length,
    feedFailures: failures,
    duplicates: 0,
    triaged: 0,
    included: 0,
  };
  for (const f of failures) console.warn(`source failed: ${f.slug} — ${f.error}`);
  console.log(`fetched ${stories.length} stories from ${sources.length} sources`);

  // 2. Dedup (vs DB in draft mode; batch-internal only in dry-run)
  const seen = dryRun ? [] : await loadSeen();
  const { fresh, duplicates } = filterNew(stories, seen);
  stats.duplicates = duplicates.length;
  console.log(`${fresh.length} fresh after dedup (${duplicates.length} duplicates)`);
  if (fresh.length === 0) {
    console.log("nothing new — no brief today");
    printRunSummary({
      feedFailures: stats.feedFailures,
      hardNews: 0,
      releases: 0,
      reviews: 0,
      podcasts: 0,
      produced: false,
    });
    return null;
  }

  // 3. Triage
  const verdicts = await triageStories(fresh);
  stats.triaged = verdicts.length;
  const verdictByUrl = new Map(verdicts.map((v) => [v.url, v]));

  // "Also at" links: collapsed duplicates point at the kept story's url
  const alsoCoveredByUrl = new Map<string, Array<{ sourceName: string; url: string }>>();
  for (const s of fresh) {
    const v = verdictByUrl.get(s.url);
    if (v && !v.include && v.duplicateOfUrl) {
      const list = alsoCoveredByUrl.get(v.duplicateOfUrl) ?? [];
      list.push({ sourceName: s.sourceName, url: s.url });
      alsoCoveredByUrl.set(v.duplicateOfUrl, list);
    }
  }

  // Priority order (1 = lead). The maxStories cap applies to hard news
  // only — RELEASES ARE NEVER CAPPED. The brief is the complete, neutral
  // record of what's new; we don't arbitrate between brands we court.
  const included = fresh
    .filter((s) => verdictByUrl.get(s.url)?.include)
    .sort(
      (a, b) =>
        (verdictByUrl.get(a.url)?.priority ?? 10) -
        (verdictByUrl.get(b.url)?.priority ?? 10),
    )
    .map((s) => {
      const v = verdictByUrl.get(s.url)!;
      return {
        ...s,
        segment: v.segment as Segment,
        type: v.type as StoryType,
        alsoCovered: alsoCoveredByUrl.get(s.url) ?? [],
      };
    });

  // The maxStories cap applies to HARD NEWS only (business/auction/
  // community). Releases, Reviews and Podcasts each get their own uncapped
  // section after the news — the brief is the complete record of what the
  // press published, and we don't arbitrate between the brands we court.
  const NEWS_TYPES = new Set<StoryType>(["business", "auction", "community"]);
  const news = included
    .filter((s) => NEWS_TYPES.has(s.type))
    .slice(0, NEWSLETTER.maxStories);
  const releases = included.filter((s) => s.type === "release");
  const reviews = included.filter((s) => s.type === "review");
  const podcasts = included.filter((s) => s.type === "podcast");

  // Hard-news lead enforced in code too: never lead with a culture/profile
  // story when a business/auction story exists.
  const leadIdx = news.findIndex(
    (s) => s.type === "business" || s.type === "auction",
  );
  if (leadIdx > 0) news.unshift(news.splice(leadIdx, 1)[0]);

  const selected = [...news, ...reviews, ...releases, ...podcasts];
  const triagedOut = fresh
    .filter((s) => !verdictByUrl.get(s.url)?.include)
    .map((s) => ({
      story: s,
      reason: verdictByUrl.get(s.url)?.droppedReason ?? "dropped by triage",
    }));
  stats.included = selected.length;
  console.log(
    `triage kept ${news.length} news + ${releases.length} releases + ${reviews.length} reviews + ${podcasts.length} podcasts, dropped ${triagedOut.length}`,
  );
  if (dryRun && triagedOut.length > 0) {
    console.log(`\ndropped by triage:`);
    for (const { story, reason } of triagedOut) {
      console.log(`  ✗ [${story.sourceName}] ${story.title}\n      → ${reason}`);
    }
  }
  if (selected.length === 0) {
    console.log("triage dropped everything — no brief today");
    printRunSummary({
      feedFailures: stats.feedFailures,
      hardNews: 0,
      releases: 0,
      reviews: 0,
      podcasts: 0,
      produced: false,
    });
    return null;
  }

  // 4. Enrich every selected story (one page fetch → image + article
  // text), then summarize grounded in the article text.
  const enriched = await enrichStories(selected);
  const imageCount = enriched.filter((s) => s.imageUrl).length;
  const textCount = enriched.filter((s) => s.articleText).length;
  console.log(
    `enriched ${enriched.length} stories: ${imageCount} images, ${textCount} article texts`,
  );
  const brief: BriefStory[] = await summarizeAll(enriched);

  // 5. Editorial subject line + preheader, grounded in the lineup. Fail-soft:
  // a subject hiccup falls back to the deterministic weekday+headline subject
  // and the tagline preheader so a send is never blocked on it.
  let subject: string;
  let preheader: string;
  try {
    ({ subject, preheader } = await writeSubjectLine(brief));
  } catch (e) {
    console.warn(
      `subject generation failed, using fallback: ${e instanceof Error ? e.message : e}`,
    );
    subject = buildSubject(now, cleanHeadline(brief[0].title));
    preheader = NEWSLETTER.tagline;
  }

  reportDropped([...duplicates, ...triagedOut]);
  printRunSummary({
    feedFailures: stats.feedFailures,
    hardNews: news.length,
    releases: releases.length,
    reviews: reviews.length,
    podcasts: podcasts.length,
    produced: true,
  });
  return { brief, subject, preheader };
}

interface PublishArgs {
  now: Date;
  slug: string;
  brief: BriefStory[];
  html: string;
  subject: string;
  droppedForPersist: Array<{ story: RawStory; reason: string }>;
  send: boolean;
}

/**
 * Create the Klaviyo draft (and send, if --send), THEN persist the brief.
 *
 * Order matters: DB writes happen only after the Klaviyo action succeeds,
 * so a story is marked "seen" (in `newsletter_article`) only once the
 * issue it belongs to has actually shipped. If the draft/send fails — or
 * the slug already sent — nothing is persisted, so the stories stay
 * eligible for the next run instead of being silently swallowed. (The
 * early guard in run() normally short-circuits the already-sent case
 * before we get here; this ordering is the backstop if it didn't.)
 */
async function publishToKlaviyo({
  slug,
  brief,
  html,
  subject,
  droppedForPersist,
  send,
}: PublishArgs): Promise<void> {
  if (!NEWSLETTER.klaviyoListId) {
    throw new Error(
      "NEWSLETTER_KLAVIYO_LIST_ID not set — create the newsletter list in Klaviyo first",
    );
  }

  const config: CampaignConfig = {
    subject,
    preview_text: NEWSLETTER.tagline,
    from_email: NEWSLETTER.fromEmail,
    from_label: NEWSLETTER.fromLabel,
    audiences: { included: [NEWSLETTER.klaviyoListId] },
  };
  const klaviyoClient = newsletterKlaviyoClient();
  let result: Awaited<ReturnType<typeof draftCampaign>>;
  try {
    result = await draftCampaign({
      slug,
      config,
      html,
      client: klaviyoClient,
      // Daily newsletter: every subscriber gets every issue, even if they
      // received another email (a shipping note, a flow) the same morning.
      useSmartSending: false,
    });
  } catch (e) {
    // Idempotent: today's brief already went out under this slug (e.g. a
    // duplicate cron fire, or a same-day re-run that raced past the guard).
    // Nothing has been persisted, so exit clean — the stories remain
    // eligible for tomorrow rather than being marked seen-but-unsent.
    if (isCampaignAlreadySentError(e)) {
      console.log(
        `campaign "${slug}" already sent — skipping (idempotent no-op).`,
      );
      return;
    }
    throw e;
  }
  console.log(`\nKlaviyo draft ${result.mode}: ${result.klaviyoUrl}`);

  let sentAt: Date | null = null;
  if (send) {
    // The only line in the whole engine that emails anyone. Sends to the
    // campaign's audience (NEWSLETTER_KLAVIYO_LIST_ID).
    await klaviyoClient.sendCampaign(result.campaignId);
    sentAt = new Date();
    console.log(`SENT to list ${NEWSLETTER.klaviyoListId}`);
  }

  // Now that the issue has shipped, record it. Upsert on the Klaviyo id so
  // a same-slug re-draft updates its one row rather than inserting a
  // duplicate (which the klaviyo_campaign_id unique index would reject).
  const htmlHash = createHash("sha256").update(html).digest("hex");
  const status = send ? "sent" : "draft";
  const [campaign] = await db
    .insert(newsletterCampaign)
    .values({
      klaviyoCampaignId: result.campaignId,
      subject,
      articleCount: brief.length,
      htmlHash,
      status,
      sentAt,
    })
    .onConflictDoUpdate({
      target: newsletterCampaign.klaviyoCampaignId,
      set: { subject, articleCount: brief.length, htmlHash, status, sentAt },
    })
    .returning({ id: newsletterCampaign.id });

  const sourceIds = await seedSources();
  await persistArticles(sourceIds, brief, droppedForPersist, campaign.id);

  console.log(`subject: ${subject} · ${brief.length} stories`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
