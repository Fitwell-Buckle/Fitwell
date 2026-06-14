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

// Serialize proxied fetches: every proxied source shares ONE BrightData
// residential zone, and the zone throttles concurrent sessions. When
// WatchTime + WatchPro fire at once (fetchAllSources runs every source in
// parallel) they compete for a session and one transiently fails all its
// retries — exactly what was killing WatchTime. Running proxied fetches
// one-at-a-time trades a little wall-clock (a few proxied sources, each a
// few seconds) for reliability; direct RSS fetches still run in parallel.
let proxyTail: Promise<unknown> = Promise.resolve();

/** Run fn only after all previously-queued proxied fetches have settled. */
export function runProxiedExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = proxyTail.then(fn, fn);
  // Keep the chain alive regardless of individual success/failure.
  proxyTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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
  // Serialized against other proxied fetches (one zone session at a time).
  return runProxiedExclusive(async () => {
    // Residential proxies fail a fraction of requests per hop — a bad exit
    // node, a transient CF challenge, or concurrent-session throttle when
    // sources compete for the zone. Those ARE transient: a fresh hop on a
    // later attempt clears them, so retry with jittered backoff.
    //
    // What retries CANNOT clear is a policy refusal: BrightData's unlocker
    // honors robots.txt and returns `400 ... bad_endpoint ... in accordance
    // with robots.txt` for disallowed paths (WatchTime's /feed/atom is
    // robots-disallowed — homepage proxies fine, the feed doesn't). Retrying
    // that just burns ~20s/run for nothing, so bail immediately and log the
    // real cause. Fix is BrightData-side (disable robots.txt compliance on
    // the zone) or scrape WatchTime's listing instead — see newsletter-engine.md.
    const MAX_ATTEMPTS = 4;
    let lastDetail = "no response";
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
        const snippet = (await res.text().catch(() => ""))
          .slice(0, 160)
          .replace(/\s+/g, " ")
          .trim();
        lastDetail = `HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`;
        // Permanent policy refusal — no fresh hop will satisfy robots.txt.
        if (res.status === 400 && /bad_endpoint|robots\.txt/i.test(snippet)) {
          console.warn(`proxiedFetch refused (not retrying): ${url} — ${lastDetail}`);
          return null;
        }
        // else 403/429/5xx → bad hop or throttle; a fresh hop may work.
      } catch (e) {
        // timeout / connection reset → retry
        lastDetail = `fetch error: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (attempt < MAX_ATTEMPTS) {
        // Backoff (0.8→3.2s) + jitter to de-sync retries from any zone-side
        // rate cycle and give the throttle a moment to free a session.
        const base = Math.min(3200, 800 * 2 ** (attempt - 1));
        await new Promise((r) =>
          setTimeout(r, base + Math.floor(Math.random() * 400)),
        );
      }
    }
    console.warn(
      `proxiedFetch gave up after ${MAX_ATTEMPTS} attempts: ${url} — last: ${lastDetail}`,
    );
    return null;
  });
}
