/**
 * Template pipeline for the Klaviyo write side (Phase 1).
 *
 * Two pure-ish primitives:
 *  - compileMjml: MJML source → email-ready HTML
 *  - injectUtms: rewrites every Fitwell href to carry utm_* params so
 *    /funnel/strategy can attribute per-email
 *
 * Used by the Phase 2 campaign draft script and the Phase 4 flow deploy
 * script. No DB, no network.
 */
// mjml v5 is async and CommonJS — the dynamic import keeps tsc happy
// without needing a custom type stub.
import mjml2html from "mjml";

export interface CompileResult {
  html: string;
  warnings: string[];
}

/**
 * Compile MJML source to HTML using mjml v5's async API. Surfaces any
 * validation warnings (mjml's `errors` array is informational unless the
 * `validationLevel: "strict"` option is set).
 */
export async function compileMjml(source: string): Promise<CompileResult> {
  // mjml v5 returns a Promise. The cast here is only needed because the
  // @types/mjml package hasn't caught up to v5's async signature yet.
  // Parse errors (totally malformed input) throw; surface them as a
  // single warning rather than letting them blow up the caller.
  try {
    const result = await (mjml2html as unknown as (
      s: string,
    ) => Promise<{
      html?: string;
      errors?: Array<{ formattedMessage?: string; message?: string }>;
    }>)(source);
    return {
      html: result.html ?? "",
      warnings: (result.errors ?? []).map(
        (e) => e.formattedMessage ?? e.message ?? String(e),
      ),
    };
  } catch (e) {
    return {
      html: "",
      warnings: [e instanceof Error ? e.message : String(e)],
    };
  }
}

const FITWELL_HOST = "fitwellbuckle.co";

export interface UtmParams {
  /** e.g. flow name "post-purchase" or campaign slug */
  campaign: string;
  /** e.g. flow step id "03-outfit-your-collection" or "blast" for campaigns */
  content: string;
  /** Defaults to "klaviyo" — override if reusing this from a non-Klaviyo channel */
  source?: string;
  /** Defaults to "email" — override for SMS etc. */
  medium?: string;
}

const HREF_PATTERN = /(href)=(["'])([^"']+)\2/gi;

/**
 * Rewrite every Fitwell href in the given HTML to carry utm_* params.
 *
 * Rules:
 *  - Only absolute http(s) URLs are touched.
 *  - Only `fitwellbuckle.co` (and subdomains) are touched. Other hosts —
 *    youtube.com, partner domains, etc. — pass through untouched.
 *  - If the URL already has a `utm_source`, leave it alone. Per-email
 *    overrides (set by hand in the MJML source) win.
 *  - Existing query params on the URL are preserved.
 *  - Klaviyo's own merge tags like `{{ unsubscribe_link }}` and
 *    `{% web_view %}` aren't absolute URLs, so they pass through.
 */
export function injectUtms(html: string, params: UtmParams): string {
  const source = params.source ?? "klaviyo";
  const medium = params.medium ?? "email";
  return html.replace(HREF_PATTERN, (match, attr, quote, url) => {
    if (!/^https?:\/\//i.test(url)) return match;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return match;
    }
    if (
      parsed.hostname !== FITWELL_HOST &&
      !parsed.hostname.endsWith(`.${FITWELL_HOST}`)
    ) {
      return match;
    }
    if (parsed.searchParams.has("utm_source")) return match;
    parsed.searchParams.set("utm_source", source);
    parsed.searchParams.set("utm_medium", medium);
    parsed.searchParams.set("utm_campaign", params.campaign);
    parsed.searchParams.set("utm_content", params.content);
    return `${attr}=${quote}${parsed.toString()}${quote}`;
  });
}
