/**
 * BrightData residential-proxy fetch — the only reliable way past
 * Cloudflare's residential bot challenge from a datacenter IP (GitHub
 * Actions). Same mechanism the cannabis engine's ResidentialProxyScraper
 * uses; reuses Tom's existing BrightData account (any zone — the creds
 * aren't site-specific).
 *
 * BrightData does TLS interception on the tunneled request, so cert
 * verification is disabled for the proxied connection (matches the
 * cannabis engine's verify=False). Only proxied traffic is affected —
 * direct fetches elsewhere keep normal TLS.
 */
// Use undici's own fetch — the global fetch is backed by Node's *bundled*
// undici, whose dispatcher interface differs from this installed undici
// package's ProxyAgent (version skew → "invalid onRequestStart method").
// Pairing fetch + ProxyAgent from the same package avoids that mismatch.
import { ProxyAgent, fetch as undiciFetch } from "undici";

const FETCH_TIMEOUT_MS = 45_000; // proxied fetches are slow; CF solve + residential hop
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let cachedAgent: ProxyAgent | null = null;
let cachedKey = "";

export function isProxyConfigured(): boolean {
  return Boolean(
    process.env.BRIGHTDATA_USERNAME && process.env.BRIGHTDATA_PASSWORD,
  );
}

function getAgent(): ProxyAgent | null {
  const username = process.env.BRIGHTDATA_USERNAME;
  const password = process.env.BRIGHTDATA_PASSWORD;
  if (!username || !password) return null;
  const host = process.env.BRIGHTDATA_HOST ?? "brd.superproxy.io";
  const port = process.env.BRIGHTDATA_PORT ?? "33335";
  const key = `${username}@${host}:${port}`;
  if (!cachedAgent || cachedKey !== key) {
    cachedAgent = new ProxyAgent({
      uri: `http://${host}:${port}`,
      token: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      // BrightData intercepts TLS on the tunneled request.
      requestTls: { rejectUnauthorized: false },
    });
    cachedKey = key;
  }
  return cachedAgent;
}

/**
 * Fetch a URL through the BrightData proxy and return the body text.
 * Returns null when the proxy isn't configured or the request fails —
 * callers fall back to a direct fetch or skip the source.
 */
export async function proxiedFetch(
  url: string,
  // Broad accept: residential proxies are fussy and some origins
  // content-negotiate; "*/*" avoids spurious non-2xx on feeds.
  accept = "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
): Promise<string | null> {
  const agent = getAgent();
  if (!agent) return null;
  // Residential proxies fail a fraction of requests per hop (bad exit
  // node, transient CF challenge, or concurrent-session throttling when
  // several sources hit the zone at once). Retry WITH BACKOFF — immediate
  // retries are useless against rate limits; a short wait lets the zone
  // free a session. The cannabis engine's scraper had the same ladder.
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await undiciFetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
        dispatcher: agent,
      });
      if (res.ok) return await res.text();
      // 403/429/5xx → likely a bad exit node or throttle; a fresh hop may work
    } catch {
      // timeout / connection reset → retry
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  return null;
}
