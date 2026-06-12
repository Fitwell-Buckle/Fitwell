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
import { SPONSOR_GIF, pickSponsorModule, sponsorHref } from "./sponsor";
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
        <mj-text padding="16px 0 0 0" font-size="13px" font-weight="700" letter-spacing="2px" text-transform="uppercase" color="#c08a4d">
          ${escapeHtml(header)}
        </mj-text>
        <mj-divider border-width="1px" border-color="#e8e4dc" padding="8px 0 0 0" />
        ${body}
      </mj-column>
    </mj-section>`;
}

/**
 * The day's rotating Fitwell sponsor module — the monetization block.
 * Two columns: the micro-adjust buckle GIF on the left, logo + copy + CTA
 * on the right. The GIF column is FIRST in source on purpose — on desktop
 * it's the left column; on mobile (where clients stack columns in source
 * order) it becomes a full-width visual hook at the top, with the pitch and
 * CTA below it. The GIF is fluid (fills its column) so it reads right at
 * both the ~230px desktop width and full-bleed on mobile. Uses the cropped,
 * lightweight SPONSOR_GIF unless a module overrides it.
 */
function sponsorSection(date: Date, slug: string): string {
  const m = pickSponsorModule(date);
  const href = sponsorHref(m, slug);
  const mediaUrl = m.imageUrl ?? SPONSOR_GIF;
  return `
    <mj-section background-color="#f0ead8" padding="18px 24px" border="1px solid #e0d8c4">
      <mj-column width="40%" vertical-align="middle">
        <mj-image src="${escapeHtml(mediaUrl)}" alt="Fitwell micro-adjust buckle" href="${escapeHtml(href)}" border-radius="6px" padding="0 0 18px 0" />
      </mj-column>
      <mj-column width="60%" vertical-align="middle" padding="0 0 0 16px">
        <mj-image src="${escapeHtml(NEWSLETTER.logoGoldUrl)}" alt="Fitwell" width="82px" align="left" padding="0 0 10px 0" />
        <mj-text padding="0" font-size="18px" font-weight="700" line-height="1.25" color="#1a1a1a">
          ${escapeHtml(m.headline)}
        </mj-text>
        <mj-text padding="6px 0 0 0" font-size="13px" line-height="1.5" color="#3d3d3d">
          ${escapeHtml(m.body)}
        </mj-text>
        <mj-button href="${escapeHtml(href)}" background-color="#1a1a1a" color="#f4f1ea" font-size="13px" font-weight="600" border-radius="2px" padding="12px 0 0 0" inner-padding="10px 20px" align="left">
          ${escapeHtml(m.ctaLabel)} →
        </mj-button>
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

export function buildMjml(
  stories: BriefStory[],
  date: Date,
  slug = "preview",
  preheader: string = NEWSLETTER.tagline,
): string {
  const { news, releases } = layoutBrief(stories);

  // Footer shop CTA — UTM-tagged (utm_content=footer) so persistent
  // brand-sign-off clicks are attributable apart from the rotating module.
  const footerHref = (() => {
    const u = new URL("https://www.fitwellbuckle.co");
    u.searchParams.set("utm_source", NEWSLETTER.utmSource);
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", slug);
    u.searchParams.set("utm_content", "footer");
    return u.toString();
  })();

  // The Fitwell module sits right after Business & Industry (the top of the
  // brief), not buried after the softer sections. Falls back to after the
  // last news section if there's no Business section that day.
  const sponsor = sponsorSection(date, slug);
  const parts: string[] = [];
  let sponsorPlaced = false;
  for (const [type, group] of news.entries()) {
    parts.push(sectionShell(TYPE_LABELS[type], group.map(storyBlock).join("\n")));
    if (type === "business") {
      parts.push(sponsor);
      sponsorPlaced = true;
    }
  }
  if (!sponsorPlaced) parts.push(sponsor);
  const newsSections = parts.join("\n");

  const releaseSection =
    releases.length > 0
      ? sectionShell(TYPE_LABELS.release, releases.map(storyBlock).join("\n"))
      : "";

  return `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Georgia, 'Times New Roman', serif" />
    </mj-attributes>
    <mj-preview>${escapeHtml(preheader)}</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f1ea">
    <mj-section background-color="#1a1a1a" padding="18px 24px 16px 24px">
      <mj-column>
        <mj-image src="${escapeHtml(NEWSLETTER.logoUrl)}" alt="Fitwell" href="https://www.fitwellbuckle.co" width="150px" align="center" padding="0 0 4px 0" />
        <mj-text align="center" font-size="24px" font-weight="700" color="#c08a4d" letter-spacing="1px">
          ${escapeHtml(NEWSLETTER.title)}
        </mj-text>
        <mj-text align="center" font-size="11px" color="#b8b3a8" padding="4px 0 0 0">
          ${escapeHtml(date.toLocaleDateString("en-US", DATE_FMT))} · ${escapeHtml(NEWSLETTER.tagline)}
        </mj-text>
      </mj-column>
    </mj-section>
${newsSections}
${releaseSection}
    <mj-section background-color="#1a1a1a" padding="28px 24px 22px 24px">
      <mj-column>
        <mj-image src="${escapeHtml(NEWSLETTER.logoUrl)}" alt="Fitwell" href="${escapeHtml(footerHref)}" width="124px" align="center" padding="0 0 14px 0" />
        <mj-text align="center" font-size="12px" color="#b8b3a8" line-height="1.6">
          ${escapeHtml(NEWSLETTER.title)} is the industry-intelligence arm of
          <a href="https://fitwellbuckle.co" style="color:#e8e4dc;">Fitwell Buckle Co.</a>,
          makers of precision micro-adjust technology for watches.
        </mj-text>
        <mj-button href="${escapeHtml(footerHref)}" background-color="#c08a4d" color="#f4f1ea" font-size="13px" font-weight="600" border-radius="10px" padding="16px 0 4px 0" inner-padding="11px 26px" align="center">
          Discover the perfect fit →
        </mj-button>
        <mj-divider border-width="1px" border-color="#333333" padding="22px 0 16px 0" />
        <!-- Compliance footer (CAN-SPAM / CASL / GDPR): sender identity +
             physical postal address pulled from Klaviyo org settings, the
             reason-for-receipt line, preference + unsubscribe controls, a
             contact method (CASL) and the privacy policy (GDPR). -->
        <mj-text align="center" font-size="11px" color="#8a8a8a" line-height="1.6">
          You're receiving this because you subscribed to ${escapeHtml(NEWSLETTER.title)} at
          <a href="https://fitwellbuckle.co" style="color:#a8a39a;">fitwellbuckle.co</a>.
        </mj-text>
        <mj-text align="center" font-size="11px" color="#8a8a8a" line-height="1.6" padding="8px 0 0 0">
          {{ organization.name }}<br />{{ organization.full_address }}
        </mj-text>
        <mj-text align="center" font-size="11px" color="#8a8a8a" line-height="1.9" padding="10px 0 0 0">
          {% manage_preferences %} &nbsp;·&nbsp; {% unsubscribe %} &nbsp;·&nbsp; <a href="https://www.fitwellbuckle.co/policies/privacy-policy" style="color:#8a8a8a;text-decoration:underline;">Privacy Policy</a> &nbsp;·&nbsp; <a href="mailto:info@fitwellbuckle.co" style="color:#8a8a8a;text-decoration:underline;">Contact</a>
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
  preheader?: string,
): Promise<RenderedBrief> {
  const { html, warnings } = await compileMjml(
    buildMjml(stories, date, slug, preheader),
  );
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
