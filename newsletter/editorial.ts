/**
 * Editorial brain: triage (include/drop + Segment × Type) and summarize,
 * via the Claude API. Mirrors the forced-tool + zod-validate pattern in
 * src/lib/ai/anthropic.ts. Editorial cut and voice are defined in
 * specs/strategy/newsletter.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NEWSLETTER } from "./config";
import {
  SEGMENTS,
  STORY_TYPES,
  type RawStory,
  type StoryType,
  type TriageVerdict,
} from "./types";

const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

// Test seam: lets unit tests inject a mock client.
export function __setAnthropicClientForTesting(c: Anthropic | null): void {
  client = c;
}

const EDITORIAL_CUT = `You are the editor of "${NEWSLETTER.title}", a daily B2B-leaning watch-industry briefing read by strap makers, retailers, microbrand founders, brand sourcing directors, OEM manufacturers, and serious collectors.

COVER HEAVY: brand financials and earnings; M&A and credible M&A rumors; retail movements (boutique openings/closings, dealer changes, curation shifts); auction results with market significance; microbrand drops with business context (run size, founder backstory, trajectory); supply chain news (movement makers, dial suppliers — anything affecting multiple brands); executive moves and brand strategy shifts.

DROP: reviews of watches that are not newly released; "top N watches under $X" listicles; lifestyle / wrist-shot / collector-of-the-day content; sponsored or advertorial content; a publication's own promos (magazine issues, awards-show plugs, podcasts about nothing). KEEP (as type=community): vintage/collector features with genuine market or provenance interest — a notable piece coming to market, a story behind a significant watch, market-trend analysis. Pure nostalgia with no market angle still drops.

NEW RELEASES rule (the brief closes with a New Releases section — readers expect it to be COMPLETE and NEUTRAL): every genuinely new release is INCLUDED — never drop a release for being routine, and never act as the arbiter of which brand's release is more interesting. The publication courts every brand it covers; all releases get equal treatment. Still DROP (include=false): reviews of watches that are not newly released, buyer's-guide listicles, wrist-shot content.

DUPLICATES: when multiple outlets cover the same story, include EXACTLY ONE — the version with the strongest business framing — and drop the rest with duplicateOfUrl set to the kept story's url (this powers "Also at" links under the kept story, so the reader still gets every outlet's take).

PRIORITY: give every included story a priority from 1 (lead) to 10, ranking by NEWS HARDNESS — not just topic. Format caps hardness: a CEO interview or podcast is soft EVEN IF it is about business. Use these tiers:

- TIER 1 (priority 1–3, lead-eligible): hard business/market news — earnings & financials, M&A and credible M&A rumors, legal action, executive moves, price changes, dealer/retail openings/closings/shifts, supply-chain news; and auction RESULTS with market significance. The lead (priority 1) MUST be a Tier 1 story.
- TIER 2 (priority 4–6, never the lead): sponsorships, official-timekeeper deals, partnerships, brand collaborations, marketing tie-ins, anniversary campaigns — real but soft. Always rank below every Tier 1 story.
- TIER 3 (priority 7–10, include only if genuinely notable): podcasts, interviews, photo essays/reports, opinion/analysis. These NEVER get priority 1–6 regardless of how business-y the topic is.

Releases are not part of this hard-news ranking (they live in their own section); give them priority 5+ so they never displace hard news at the top. If no Tier 1 story exists on a given day, lead with the strongest Tier 2 — but NEVER a podcast, interview, or release at priority 1.

Segment (exactly one): "luxury" (Rolex, Patek, AP, Vacheron, Lange, Breguet, Blancpain, high-end Cartier), "mid" (Omega, IWC, Jaeger, Tudor, Grand Seiko, Longines, TAG, Zenith), "microbrand" (Halios, Nodus, Lorier, Baltic, Christopher Ward, Farer, Anordain, Studio Underd0g, MB&F, Urwerk, Massena LAB and peers), "vintage-auction" (vintage market and auction stories).

Type (exactly one): "release", "business", "auction", "community".`;

const TRIAGE_TOOL = "record_triage";

const triageSchema = z.object({
  verdicts: z.array(
    z.object({
      url: z.string(),
      include: z.boolean(),
      droppedReason: z.string().nullable(),
      segment: z.enum(SEGMENTS).nullable(),
      type: z.enum(STORY_TYPES).nullable(),
      priority: z.number().int().min(1).max(10).nullable(),
      duplicateOfUrl: z.string().nullable(),
    }),
  ),
});

const TRIAGE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          include: { type: "boolean" },
          droppedReason: { type: ["string", "null"] },
          segment: { type: ["string", "null"], enum: [...SEGMENTS, null] },
          type: { type: ["string", "null"], enum: [...STORY_TYPES, null] },
          priority: { type: ["integer", "null"], minimum: 1, maximum: 10 },
          duplicateOfUrl: { type: ["string", "null"] },
        },
        required: [
          "url",
          "include",
          "droppedReason",
          "segment",
          "type",
          "priority",
          "duplicateOfUrl",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

function storyDigest(story: RawStory): string {
  return [
    `URL: ${story.url}`,
    `Source: ${story.sourceName}`,
    `Title: ${story.title}`,
    story.excerpt ? `Excerpt: ${story.excerpt}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callTriageOnce(stories: RawStory[]): Promise<unknown> {
  const result = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: EDITORIAL_CUT,
    tools: [
      {
        name: TRIAGE_TOOL,
        description:
          "Record an include/drop verdict for every candidate story. One verdict per story, matched by url, in any order. droppedReason is required when include=false; segment, type and priority are required when include=true. When dropping a story because another outlet's version of the same story is kept, set duplicateOfUrl to the kept story's url.",
        input_schema: TRIAGE_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: TRIAGE_TOOL },
    messages: [
      {
        role: "user",
        content: `Triage today's candidate stories. Apply the editorial cut strictly for hard news — aim for the strongest ${NEWSLETTER.maxStories} or fewer hard-news stories. Releases are NOT capped: include every genuine new release.\n\n${stories
          .map((s, i) => `--- Story ${i + 1} ---\n${storyDigest(s)}`)
          .join("\n\n")}\n\nCall ${TRIAGE_TOOL} with one verdict per story.`,
      },
    ],
  });

  const toolUse = result.content.find(
    (block) => block.type === "tool_use" && block.name === TRIAGE_TOOL,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Anthropic response did not include a ${TRIAGE_TOOL} tool_use block`);
  }
  return toolUse.input;
}

/**
 * One call over the whole batch. Retries once on zod-validation failure.
 * Stories the model omits a verdict for are treated as dropped
 * ("no verdict returned") rather than failing the run.
 */
export async function triageStories(stories: RawStory[]): Promise<TriageVerdict[]> {
  if (stories.length === 0) return [];
  let firstError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callTriageOnce(stories);
    const parsed = triageSchema.safeParse(raw);
    if (parsed.success) {
      const byUrl = new Map(parsed.data.verdicts.map((v) => [v.url, v]));
      return stories.map((s) => {
        const v = byUrl.get(s.url);
        if (!v) {
          return {
            url: s.url,
            include: false,
            droppedReason: "no verdict returned",
            segment: null,
            type: null,
            priority: null,
            duplicateOfUrl: null,
          };
        }
        // A verdict missing its required follow-on fields is unusable
        if (v.include && (!v.segment || !v.type)) {
          return {
            url: s.url,
            include: false,
            droppedReason: "verdict missing segment/type",
            segment: null,
            type: null,
            priority: null,
            duplicateOfUrl: null,
          };
        }
        return v;
      });
    }
    if (firstError === null) firstError = parsed.error;
  }
  throw firstError instanceof Error
    ? firstError
    : new Error("triageStories: validation failed");
}

const VOICE = `Write in the voice of "${NEWSLETTER.title}": insider-knowing, like Puck News scaled to watches. Opinionated, name-dropping when justified, attentive to what the news means commercially. No trade-press blandness, no enthusiast gushing, never "we're excited to share". 2–3 sentences. Lead with the fact, land on why it matters to someone in the industry.

BRAND-NEUTRALITY rule for NEW RELEASES: the publication courts every brand it covers. Release write-ups are factual and generous — what it is, the specs that matter, price, run size, availability. NEVER a verdict on the watch, never snark, never ranking one brand's release against another's. Save the opinionated voice for business and market analysis, where the opinion is about the market, not about a brand's product.`;

const SUMMARY_TOOL = "record_summary";

const summarySchema = z.object({ summary: z.string().min(20) });

const SUMMARY_INPUT_SCHEMA = {
  type: "object" as const,
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
};

async function callSummaryOnce(
  story: RawStory & { type?: StoryType },
): Promise<unknown> {
  const releaseNote =
    story.type === "release"
      ? " This is a NEW RELEASE — apply the brand-neutrality rule: factual and generous, specs/price/run-size/availability, no verdicts on the watch."
      : "";
  // Grounding: facts must come from the provided text, full stop. A brief
  // that misstates a price or run size in front of retailers and the
  // brands themselves is a credibility wound — vague beats invented.
  const grounding =
    " Use ONLY facts stated in the source material below. If a price, run size, date, dimension, or spec is not in the text, do not state one — never invent or estimate numbers.";
  const articleSection = story.articleText
    ? `\n\nFull article text:\n${story.articleText}`
    : "\n\n(No article text available — only the excerpt above. Be correspondingly careful with specifics.)";
  const result = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: VOICE,
    tools: [
      {
        name: SUMMARY_TOOL,
        description: "Record the 2-3 sentence brief for this story.",
        input_schema: SUMMARY_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: SUMMARY_TOOL },
    messages: [
      {
        role: "user",
        content: `Summarize for the brief:${releaseNote}${grounding}\n\n${storyDigest(story)}${articleSection}\n\nCall ${SUMMARY_TOOL}.`,
      },
    ],
  });

  const toolUse = result.content.find(
    (block) => block.type === "tool_use" && block.name === SUMMARY_TOOL,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Anthropic response did not include a ${SUMMARY_TOOL} tool_use block`);
  }
  return toolUse.input;
}

export async function summarizeStory(
  story: RawStory & { type?: StoryType },
): Promise<string> {
  let firstError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callSummaryOnce(story);
    const parsed = summarySchema.safeParse(raw);
    if (parsed.success) return parsed.data.summary;
    if (firstError === null) firstError = parsed.error;
  }
  throw firstError instanceof Error
    ? firstError
    : new Error("summarizeStory: validation failed");
}

/**
 * Summarize all included stories with bounded concurrency. Fail-soft:
 * a story whose summary call dies keeps its feed excerpt so the brief
 * still ships (per the failure-mode table in newsletter-engine.md).
 */
export async function summarizeAll<T extends RawStory>(
  stories: T[],
  concurrency = 4,
): Promise<Array<T & { summary: string }>> {
  const out: Array<T & { summary: string }> = new Array(stories.length);
  let next = 0;
  async function worker() {
    while (next < stories.length) {
      const i = next++;
      const story = stories[i];
      let summary: string;
      try {
        summary = await summarizeStory(story);
      } catch (e) {
        console.warn(
          `summary failed for ${story.url}: ${e instanceof Error ? e.message : e}`,
        );
        summary = story.excerpt;
      }
      out[i] = { ...story, summary };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, stories.length) }, worker),
  );
  return out;
}
