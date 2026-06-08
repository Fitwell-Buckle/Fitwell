// Open-tracking pixel URLs. The token lives on outbound_message.track_token;
// the pixel hits the public /api/track/open/[token] route, which records the
// open. Base URL resolves from NextAuth's own origin (correct portal host in
// every env) with a hardcoded production fallback.

const FALLBACK_BASE = "https://portal.fitwellbuckle.co";

export function trackingBaseUrl(): string {
  const raw =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || FALLBACK_BASE;
  return raw.replace(/\/+$/, "");
}

// Pure: build the pixel URL from a base + token. The token carries a `.gif`
// suffix so it reads like an image to mail-client proxies (the route strips it).
export function buildPixelUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/api/track/open/${encodeURIComponent(token)}.gif`;
}

export function trackingPixelUrl(token: string): string {
  return buildPixelUrl(trackingBaseUrl(), token);
}
