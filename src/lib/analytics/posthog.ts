import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client (posthog-node), lazy singleton.
 *
 * Returns `null` when credentials are absent so callers degrade gracefully —
 * an unconfigured analytics layer must never break an order webhook or cron.
 *
 * On Vercel the function process dies after the response, so every caller that
 * captures events MUST `await flushEvents()` before returning.
 */

let client: PostHog | null = null;
let initialized = false;

export function getPostHogClient(): PostHog | null {
  if (initialized) return client;
  initialized = true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!key) {
    console.warn("PostHog not configured (NEXT_PUBLIC_POSTHOG_KEY missing)");
    client = null;
    return null;
  }

  client = new PostHog(key, {
    host,
    // Serverless: send eagerly, we flush explicitly before the function exits.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export function captureEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getPostHogClient();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}

/**
 * Identify / enrich a person. `set` overwrites; `setOnce` only writes if the
 * property is unset (first-touch — see specs/invariants/attribution.md §1).
 * Implemented via a `$identify` capture so $set / $set_once are explicit and
 * version-stable across posthog-node releases.
 */
export function identify(
  distinctId: string,
  set?: Record<string, unknown>,
  setOnce?: Record<string, unknown>,
): void {
  const ph = getPostHogClient();
  if (!ph) return;
  ph.capture({
    distinctId,
    event: "$identify",
    properties: {
      ...(set ? { $set: set } : {}),
      ...(setOnce ? { $set_once: setOnce } : {}),
    },
  });
}

/** Alias an anonymous distinct_id to a known one (e.g. pixel id → email). */
export function aliasIdentity(distinctId: string, alias: string): void {
  const ph = getPostHogClient();
  if (!ph) return;
  ph.alias({ distinctId, alias });
}

/** Flush buffered events. Call before any serverless handler returns. */
export async function flushEvents(): Promise<void> {
  if (!client) return;
  try {
    await client.flush();
  } catch (err) {
    console.error("PostHog flush failed:", err);
  }
}

/** Back-compat helper: capture one event and flush immediately. */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  captureEvent(distinctId, event, properties);
  await flushEvents();
}

/** Test-only: reset the singleton between unit tests. */
export function __resetPostHogForTests(): void {
  client = null;
  initialized = false;
}
