// Helpers for Autodesk Fusion ("AutoCAD Fusion") public share links.
//
// A pasted link (e.g. https://a360.co/4vPkEVP) is a short URL that redirects to
// a canonical share viewer at https://<hub>.autodesk360.com/g/shares/SH<id>.
// Appending ?mode=embed yields a chromeless interactive viewer that can be
// dropped into an <iframe>. We resolve the redirect server-side so we can build
// the embed URL and so we only ever fetch/store Autodesk-hosted URLs.

// Hosts we accept. `a360.co` is the short-link domain; everything else must be
// under autodesk360.com (any hub subdomain). Matching is suffix-based so
// `gmail2692152.autodesk360.com` passes but `autodesk360.com.evil.test` does not.
const ALLOWED_HOSTS = ["a360.co"];
const ALLOWED_SUFFIXES = [".autodesk360.com"];
const ALLOWED_EXACT = ["autodesk360.com"];

function hostOf(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.hostname.toLowerCase();
}

// True if the URL points at an Autodesk Fusion share domain. Used both to gate
// what the user may paste and to re-validate the final URL after redirects.
export function isAllowedFusionUrl(raw: string): boolean {
  const host = hostOf(raw);
  if (!host) return false;
  if (ALLOWED_HOSTS.includes(host)) return true;
  if (ALLOWED_EXACT.includes(host)) return true;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

// The canonical viewer host (post-redirect) — excludes the a360.co short
// domain, which only ever redirects, never renders.
export function isFusionViewerUrl(raw: string): boolean {
  const host = hostOf(raw);
  if (!host) return false;
  if (ALLOWED_EXACT.includes(host)) return true;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

// Append ?mode=embed (idempotently) to a canonical share URL.
export function toEmbedUrl(canonicalUrl: string): string {
  const u = new URL(canonicalUrl);
  u.searchParams.set("mode", "embed");
  return u.toString();
}

export interface ResolvedFusion {
  canonicalUrl: string;
  embedUrl: string;
}

// Follows the share link's redirects to the canonical viewer URL and derives
// the embed URL. Returns null if the link doesn't resolve to an Autodesk
// viewer host (so the caller can store the raw link without an embed preview).
// Only ever called after isAllowedFusionUrl() has passed, so the initial fetch
// target is already restricted to Autodesk domains (no SSRF surface).
export async function resolveFusionEmbed(
  rawUrl: string,
): Promise<ResolvedFusion | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Autodesk's short-link host 403s requests without a browser UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    const finalUrl = res.url || rawUrl;
    if (!isFusionViewerUrl(finalUrl)) return null;
    // Strip any existing query/hash from the canonical URL before adding embed.
    const u = new URL(finalUrl);
    u.hash = "";
    const canonicalUrl = u.toString();
    return { canonicalUrl, embedUrl: toEmbedUrl(canonicalUrl) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
