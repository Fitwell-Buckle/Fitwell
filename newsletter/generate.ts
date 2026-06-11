/**
 * Brief assembly: BriefStory[] → MJML → HTML.
 *
 * Structure: sections are organized by NEWS TYPE (Business & Industry →
 * Auction & Market → Community & Analysis), because news doesn't sort by
 * brand price tier — segment (luxury/micro/…) is just the eyebrow tag on
 * each story. "New Releases" renders LAST and is complete: featured
 * releases get full cards, routine drops get a compact "Also new" list.
 * Stories carry images when resolution succeeded, and "Also at" links
 * when triage collapsed multi-outlet coverage. Reuses the Klaviyo MJML
 * pipeline (compileMjml + injectUtms).
 */
import { compileMjml, injectUtms } from "../src/lib/klaviyo/templates";
import { NEWSLETTER } from "./config";
import { cleanHeadline } from "./text";
import {
  NEWS_SECTION_ORDER,
  TYPE_LABELS,
  type BriefStory,
  type StoryType,
} from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BriefLayout {
  /** Hard news grouped by type: business → auction → community. */
  news: Map<StoryType, BriefStory[]>;
  /** All releases — equal full-card treatment, rendered last. */
  releases: BriefStory[];
}

export function layoutBrief(stories: BriefStory[]): BriefLayout {
  const releases = stories.filter((s) => s.type === "release");
  const hardNews = stories.filter((s) => s.type !== "release");
  const news = new Map<StoryType, BriefStory[]>();
  for (const type of NEWS_SECTION_ORDER) {
    const inSection = hardNews.filter((s) => s.type === type);
    if (inSection.length > 0) news.set(type, inSection);
  }
  return { news, releases };
}

function alsoCoveredLine(story: BriefStory): string {
  const others = story.alsoCovered ?? [];
  if (others.length === 0) return "";
  const links = others
    .map(
      (o) =>
        `<a href="${escapeHtml(o.url)}" style="color:#8a8a8a;text-decoration:underline;">${escapeHtml(o.sourceName)}</a>`,
    )
    .join(" · ");
  return `
        <mj-text padding="0 0 12px 0" font-size="12px" color="#8a8a8a">
          Also at: ${links}
        </mj-text>`;
}

function storyImage(story: BriefStory): string {
  if (!story.imageUrl) return "";
  return `
        <mj-image src="${escapeHtml(story.imageUrl)}" alt="${escapeHtml(story.title)}" href="${escapeHtml(story.url)}" padding="12px 0 0 0" border-radius="4px" />`;
}

// Eyebrow is the source only. Brand-tier (segment) is intentionally NOT
// shown — the headline already names the brand, and a visible tier reads
// as a ranking of brands we court. segment stays in the data model for
// analytics; it's just never displayed.
function storyBlock(story: BriefStory): string {
  const bottomPad = story.alsoCovered?.length ? "4px" : "12px";
  return `${storyImage(story)}
        <mj-text padding="12px 0 0 0" font-size="11px" letter-spacing="1px" text-transform="uppercase" color="#8a8a8a">
          ${escapeHtml(story.sourceName)}
        </mj-text>
        <mj-text padding="4px 0 0 0" font-size="17px" font-weight="600" line-height="1.3">
          <a href="${escapeHtml(story.url)}" style="color:#1a1a1a;text-decoration:none;">${escapeHtml(cleanHeadline(story.title))}</a>
        </mj-text>
        <mj-text padding="6px 0 ${bottomPad} 0" font-size="14px" line-height="1.55" color="#3d3d3d">
          ${escapeHtml(story.summary)}
        </mj-text>${alsoCoveredLine(story)}`;
}

function sectionShell(header: string, body: string): string {
  return `
    <mj-section background-color="#ffffff" padding="8px 24px">
      <mj-column>
        <mj-text padding="16px 0 0 0" font-size="13px" font-weight="700" letter-spacing="2px" text-transform="uppercase" color="#b4541e">
          ${escapeHtml(header)}
        </mj-text>
        <mj-divider border-width="1px" border-color="#e8e4dc" padding="8px 0 0 0" />
        ${body}
      </mj-column>
    </mj-section>`;
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
};

export function buildMjml(stories: BriefStory[], date: Date): string {
  const { news, releases } = layoutBrief(stories);

  const newsSections = [...news.entries()]
    .map(([type, group]) =>
      sectionShell(TYPE_LABELS[type], group.map(storyBlock).join("\n")),
    )
    .join("\n");

  const releaseSection =
    releases.length > 0
      ? sectionShell(TYPE_LABELS.release, releases.map(storyBlock).join("\n"))
      : "";

  return `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Georgia, 'Times New Roman', serif" />
    </mj-attributes>
    <mj-preview>${escapeHtml(NEWSLETTER.tagline)}</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f1ea">
    <mj-section background-color="#1a1a1a" padding="28px 24px 20px 24px">
      <mj-column>
        <mj-text align="center" font-size="26px" font-weight="700" color="#f4f1ea" letter-spacing="1px">
          ${escapeHtml(NEWSLETTER.title)}
        </mj-text>
        <mj-text align="center" font-size="12px" color="#b8b3a8" padding="6px 0 0 0">
          ${escapeHtml(date.toLocaleDateString("en-US", DATE_FMT))} · ${escapeHtml(NEWSLETTER.tagline)}
        </mj-text>
      </mj-column>
    </mj-section>
${newsSections}
${releaseSection}
    <mj-section background-color="#1a1a1a" padding="20px 24px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#b8b3a8" line-height="1.6">
          ${escapeHtml(NEWSLETTER.title)} is the industry-intelligence arm of
          <a href="https://fitwellbuckle.co" style="color:#e8e4dc;">Fitwell Buckle Co.</a>,
          makers of precision micro-adjust watch buckles.
        </mj-text>
        <mj-text align="center" font-size="11px" color="#8a8a8a" padding="8px 0 0 0">
          {% unsubscribe %}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}

export interface RenderedBrief {
  html: string;
  warnings: string[];
}

/** MJML → HTML with Fitwell-link UTM tagging. */
export async function renderBrief(
  stories: BriefStory[],
  date: Date,
  slug: string,
): Promise<RenderedBrief> {
  const { html, warnings } = await compileMjml(buildMjml(stories, date));
  if (!html) {
    throw new Error(`MJML compile produced no HTML: ${warnings.join("; ")}`);
  }
  return {
    html: injectUtms(html, {
      campaign: slug,
      content: "brief",
      source: NEWSLETTER.utmSource,
    }),
    warnings,
  };
}
