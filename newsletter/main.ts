/**
 * Newsletter engine entry point.
 *
 *   npm run newsletter:dry-run   # fetch → triage → summarize → HTML to /tmp; no DB writes, no Klaviyo
 *   npm run newsletter:draft     # full run: DB writes + Klaviyo DRAFT campaign (never sends)
 *
 * Sending stays a manual action in Klaviyo's UI while the voice settles
 * (first ~3 sends, per specs/strategy/newsletter.md). The GitHub Actions
 * workflow runs --draft each weekday morning.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { eq, gte } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  newsletterArticle,
  newsletterCampaign,
  newsletterSource,
} from "../src/lib/schema";
import { KlaviyoClient } from "../src/lib/klaviyo/client";
import { draftCampaign } from "../src/lib/klaviyo/draft-campaign";
import type { CampaignConfig } from "../src/lib/klaviyo/campaign-config";
import { NEWSLETTER, buildSubject, campaignSlug } from "./config";
import { SOURCES, activeSources } from "./sources";
import { fetchAllSources } from "./fetch";
import { filterNew, contentHash, normalizeUrl, type SeenArticle } from "./dedup";
import { triageStories, summarizeAll } from "./editorial";
import { enrichStories } from "./images";
import { renderBrief } from "./generate";
import type { BriefStory, RawStory, Segment, StoryType } from "./types";

const SEEN_WINDOW_DAYS = 14;

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
  const modeCount = [dryRun, draft].filter(Boolean).length;
  if (modeCount !== 1) {
    console.error("Usage: tsx newsletter/main.ts (--dry-run | --draft | --send)");
    process.exit(1);
  }

  const now = new Date();
  const slug = campaignSlug(now);
  const mode = dryRun ? "dry-run" : send ? "send" : "draft";
  console.log(`[${slug}] mode=${mode}`);

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
    return;
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

  const hardNews = included
    .filter((s) => s.type !== "release")
    .slice(0, NEWSLETTER.maxStories);
  const releases = included.filter((s) => s.type === "release");

  // Hard-news lead enforced in code too: never lead with a podcast-shaped
  // community story when a business/auction story exists
  const leadIdx = hardNews.findIndex(
    (s) => s.type === "business" || s.type === "auction",
  );
  if (leadIdx > 0) hardNews.unshift(hardNews.splice(leadIdx, 1)[0]);

  const selected = [...hardNews, ...releases];
  const triagedOut = fresh
    .filter((s) => !verdictByUrl.get(s.url)?.include)
    .map((s) => ({
      story: s,
      reason: verdictByUrl.get(s.url)?.droppedReason ?? "dropped by triage",
    }));
  stats.included = selected.length;
  console.log(
    `triage kept ${hardNews.length} hard-news + ${releases.length} releases, dropped ${triagedOut.length}`,
  );
  if (dryRun && triagedOut.length > 0) {
    console.log(`\ndropped by triage:`);
    for (const { story, reason } of triagedOut) {
      console.log(`  ✗ [${story.sourceName}] ${story.title}\n      → ${reason}`);
    }
  }
  if (selected.length === 0) {
    console.log("triage dropped everything — no brief today");
    return;
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

  // 5. Render
  const subject = buildSubject(now, brief[0].title);
  const { html, warnings } = await renderBrief(brief, now, slug);
  for (const w of warnings) console.warn(`mjml: ${w}`);

  if (dryRun) {
    const outPath = `/tmp/${slug}.html`;
    writeFileSync(outPath, html);
    console.log(`\nsubject: ${subject}`);
    console.log(
      `stories: ${brief.map((s) => `\n  [${s.segment}/${s.type}] ${s.title}`).join("")}`,
    );
    console.log(`\nwrote ${outPath} — open it in a browser to review`);
    return;
  }

  // 6. Persist + Klaviyo draft (never sends — draftCampaign's hard contract)
  if (!NEWSLETTER.klaviyoListId) {
    throw new Error(
      "NEWSLETTER_KLAVIYO_LIST_ID not set — create the newsletter list in Klaviyo first",
    );
  }
  const htmlHash = createHash("sha256").update(html).digest("hex");
  const [campaign] = await db
    .insert(newsletterCampaign)
    .values({ subject, articleCount: brief.length, htmlHash })
    .returning({ id: newsletterCampaign.id });

  const sourceIds = await seedSources();
  await persistArticles(sourceIds, brief, [...duplicates, ...triagedOut], campaign.id);

  const config: CampaignConfig = {
    subject,
    preview_text: NEWSLETTER.tagline,
    from_email: NEWSLETTER.fromEmail,
    from_label: NEWSLETTER.fromLabel,
    audiences: { included: [NEWSLETTER.klaviyoListId] },
  };
  // Newsletter uses its own write-scoped Klaviyo key (campaigns + templates
  // write) so the analytics KLAVIYO_API_KEY can stay read-only. Falls back
  // to KLAVIYO_API_KEY if the dedicated key isn't set.
  const klaviyoClient = new KlaviyoClient({
    apiKey: process.env.NEWSLETTER_KLAVIYO_API_KEY ?? process.env.KLAVIYO_API_KEY,
  });
  const result = await draftCampaign({ slug, config, html, client: klaviyoClient });
  await db
    .update(newsletterCampaign)
    .set({ klaviyoCampaignId: result.campaignId })
    .where(eq(newsletterCampaign.id, campaign.id));
  console.log(`\nKlaviyo draft ${result.mode}: ${result.klaviyoUrl}`);

  if (send) {
    // The only line in the whole engine that emails anyone. Sends to the
    // campaign's audience (NEWSLETTER_KLAVIYO_LIST_ID).
    await klaviyoClient.sendCampaign(result.campaignId);
    await db
      .update(newsletterCampaign)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(newsletterCampaign.id, campaign.id));
    console.log(`SENT to list ${NEWSLETTER.klaviyoListId}`);
  }
  console.log(`subject: ${subject} · ${brief.length} stories`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
