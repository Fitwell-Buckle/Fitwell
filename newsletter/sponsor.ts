/**
 * Fitwell sponsor modules — the monetization layer. One module renders
 * per issue at the hard-news → New Releases break, rotating daily so
 * collectors (D2C), brands/OEM (B2B), and the universal pain angle each
 * get airtime over a business week without any single issue feeling like
 * an ad. Copy is grounded in the persona + vocabulary-map playbook
 * (specs/strategy/personas.md, vocabulary-map.md); see
 * specs/strategy/newsletter.md → Monetization & Fitwell branding.
 */
import { NEWSLETTER } from "./config";

const SHOP = "https://www.fitwellbuckle.co";
const OEM = "https://www.fitwellbuckle.co/pages/oe-services";

/**
 * Default module visual: the buckle micro-adjust mechanism animating.
 * Animated GIF — loops in Gmail/Apple Mail/most clients; Outlook desktop
 * shows the first frame only (which still reads as the buckle). Cropped to
 * the buckle, shrunk to 480px and palette-reduced to 555KB (from the 7.5MB
 * website-header master) so it renders instantly in inbox. Hosted on Vercel
 * Blob. A module can override via its own imageUrl.
 */
export const SPONSOR_GIF =
  "https://u7unnafmnzoxkkki.public.blob.vercel-storage.com/newsletter/fitwell-buckle.gif?v=3";

export interface SponsorModule {
  /** Stable id → utm_content=module-<id> for per-message attribution. */
  id: string;
  headline: string;
  body: string;
  ctaLabel: string;
  /** Destination before UTMs (added at render). */
  ctaUrl: string;
  /**
   * Optional image or animated GIF shown above the copy. GIFs animate in
   * Gmail/Apple Mail/most clients; Outlook desktop shows frame 1 only, so
   * the first frame must read as a good static. Host on Vercel Blob.
   */
  imageUrl?: string;
}

export const SPONSOR_MODULES: SponsorModule[] = [
  {
    id: "outfit",
    headline: "Micro-adjust, for every watch in the collection.",
    body: "Does your bracelet already dial in on the fly? Fitwell brings the same on-the-wrist adjustment to every strap you own — the detail you'll want on the whole collection.",
    ctaLabel: "Shop Fitwell",
    ctaUrl: SHOP,
  },
  {
    id: "notice",
    headline: "For collectors who notice the details.",
    body: "If you like your watches to fit perfectly, the strap's the weak link. Precision micro-adjust buckles in steel and titanium, finished to match any watch in your collection.",
    ctaLabel: "Find your fit",
    ctaUrl: SHOP,
  },
  {
    id: "between",
    headline: "Always between two holes.",
    body: "You know the feeling. One hole's too tight, the next too loose — and your wrist size changes throughout the day. Fitwell's micro-adjust buckle lands you right between the two — exactly where you want — and holds it there. Adjust on or off the wrist. No tools. The fix for every strap's inherent weakness.",
    ctaLabel: "Shop the fix",
    ctaUrl: SHOP,
  },
  {
    id: "rescue",
    headline: "The watch you stopped wearing.",
    body: "Some of your favorites sit in the box — not for lack of love, but because the strap never quite fit. One Fitwell buckle brings them back into rotation. As an owner put it: “I can wear this watch now.”",
    ctaLabel: "Bring it back",
    ctaUrl: SHOP,
  },
  {
    id: "spec",
    headline: "Trusted by brands across the industry.",
    body: "Fitwell's micro-adjust mechanism integrates into any brand's design language. Buckles, deployants, and even bracelets. Awake, Sherpa, Kuoe, Atelier 1776 and more deliver Fitwell micro-adjust to their collectors as original hardware.",
    ctaLabel: "Explore OEM services",
    ctaUrl: OEM,
  },
  {
    id: "punch",
    headline: "The hole punch had a good run.",
    body: "For a hundred years, the answer to a strap that didn't quite fit was to punch another hole in it. Effective. Also barbaric. Fitwell is the civilized version — a precision micro-adjust buckle that dials the fit in by the millimeter. No extra holes. No compromise.",
    ctaLabel: "Lose the hole punch",
    ctaUrl: SHOP,
  },
  {
    id: "partner",
    headline: "A premium add-on, no SKU overlap.",
    body: "Forward-thinking brands like Delugs offer Fitwell as an upsell on their product pages. The Fitwell buckle lifts AOV without competing with your core line.",
    ctaLabel: "Partner with Fitwell",
    ctaUrl: OEM,
  },
  {
    id: "obsess",
    headline: "We obsess over microns.",
    body: "Fitwell makes precision micro-adjust solutions for collectors and the brands that build for them. We read the entire industry every morning to stay sharp. This brief is how we share the view.",
    ctaLabel: "About Fitwell",
    ctaUrl: SHOP,
  },
  {
    id: "detail",
    headline: "The detail that sets you apart.",
    body: "Brands win on details. The movement, the dial, the hands, the case, the strap. THE FIT. Distinguish your brand with Fitwell micro-adjust built into your buckle or clasp.",
    ctaLabel: "Build it in",
    ctaUrl: OEM,
  },
  {
    id: "built",
    headline: "Built by collectors, for collectors.",
    body: "Fitwell didn't come out of a boardroom — it came from the same frustration every enthusiast feels. Our straps just didn't fit right. And we weren't wearing some of our favorites because of it. We built the fix we wanted. And now every watch has a place in the rotation.",
    ctaLabel: "Discover the perfect fit",
    ctaUrl: SHOP,
  },
];

/**
 * Count of weekdays (Mon–Fri) from a fixed Monday anchor (2024-01-01).
 * The brief only sends on weekdays, so indexing rotation on this count —
 * rather than raw calendar day — advances the module exactly one slot per
 * issue: a clean 1→2→…→N→1 cycle with no weekend lump and no module
 * skipped. Still stateless and deterministic (pure function of the date),
 * so re-runs and tests stay stable. Weekend dates resolve to the same
 * index as the following Monday, but weekends never send so it's moot.
 */
export function weekdayIndex(date: Date): number {
  const MS_DAY = 86_400_000;
  const anchor = Date.UTC(2024, 0, 1); // a Monday
  const days = Math.floor((date.getTime() - anchor) / MS_DAY);
  const weeks = Math.floor(days / 7);
  const dow = ((days % 7) + 7) % 7; // 0 = Mon … 6 = Sun
  return weeks * 5 + Math.min(dow, 5);
}

/**
 * Deterministic rotation: one module per issue, advancing one slot per
 * weekday send and cycling evenly through every module.
 */
export function pickSponsorModule(date: Date): SponsorModule {
  return SPONSOR_MODULES[weekdayIndex(date) % SPONSOR_MODULES.length];
}

/**
 * Module CTA URL with full UTMs baked in (utm_content=module-<id>) so
 * each message is attributable. injectUtms skips links that already carry
 * utm_source, so these survive the global pass unchanged.
 */
export function sponsorHref(module: SponsorModule, slug: string): string {
  const u = new URL(module.ctaUrl);
  u.searchParams.set("utm_source", NEWSLETTER.utmSource);
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", slug);
  u.searchParams.set("utm_content", `module-${module.id}`);
  return u.toString();
}
