/**
 * Operational funnel — event-based progression for storefront visitors.
 *
 * Uses HogQL `windowFunnel` so each stage's count is "persons who reached
 * at least this step within 30 days, in time order." Doesn't constrain
 * URL paths — visitors can enter on the homepage, /collections/buckles,
 * a /pages landing PDP, or anywhere else and still count in the funnel as
 * long as the event order holds.
 *
 * For URL-path visibility (which entry pages? what intermediate routes?)
 * see getLandingPageBreakdown below.
 */

interface HogQLResponse {
  results: Array<Array<unknown>>;
}

async function runHogQL(query: string): Promise<HogQLResponse> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!projectId || !apiKey) {
    throw new Error(
      "PostHog query needs POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY",
    );
  }

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as HogQLResponse;
}

export interface FunnelStage {
  name: string;
  count: number;
  conversionRate: number;
}

/**
 * Five-stage event funnel: $pageview → product_viewed → product_added_to_cart
 * → checkout_started → purchase_completed.
 *
 * `product_viewed` includes both Shopify's standard event (fires on
 * `/products/*`) and the storefront snippet's custom emission on
 * declared landing PDPs (currently /pages/m1-micro-adjust-buckle), so
 * the second stage isn't artificially low. See
 * specs/strategy/event-taxonomy.md.
 *
 * Returns zeros (and a `posthogConfigured: false` flag) if PostHog env
 * vars aren't set or the query fails — page still renders.
 */
export async function getFunnelData(): Promise<FunnelStage[]> {
  if (!process.env.POSTHOG_PROJECT_ID || !process.env.POSTHOG_PERSONAL_API_KEY) {
    return emptyStages();
  }

  // windowFunnel(window_seconds)(timestamp, cond1, cond2, ...) returns the
  // deepest step number reached, in time order, within the window. We use
  // a 30-day window matched to the outer time filter.
  const query = `
    SELECT
      countIf(level >= 1) AS s1,
      countIf(level >= 2) AS s2,
      countIf(level >= 3) AS s3,
      countIf(level >= 4) AS s4,
      countIf(level >= 5) AS s5
    FROM (
      SELECT
        person_id,
        windowFunnel(2592000)(
          toUnixTimestamp(timestamp),
          event = '$pageview',
          event = 'product_viewed',
          event = 'product_added_to_cart',
          event = 'checkout_started',
          event = 'purchase_completed'
        ) AS level
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event IN ('$pageview', 'product_viewed', 'product_added_to_cart', 'checkout_started', 'purchase_completed')
      GROUP BY person_id
    )
  `;

  let row: Array<unknown> | undefined;
  try {
    const res = await runHogQL(query);
    row = res.results?.[0];
  } catch (err) {
    console.error("getFunnelData HogQL failed:", err);
    return emptyStages();
  }

  const counts = (row ?? []).map((v) => Number(v) || 0);
  const [pageview = 0, productView = 0, addToCart = 0, checkoutStart = 0, purchase = 0] = counts;

  return [
    { name: "Page Views", count: pageview, conversionRate: 100 },
    {
      name: "Product Views",
      count: productView,
      conversionRate: pageview > 0 ? (productView / pageview) * 100 : 0,
    },
    {
      name: "Add to Cart",
      count: addToCart,
      conversionRate: productView > 0 ? (addToCart / productView) * 100 : 0,
    },
    {
      name: "Checkout Started",
      count: checkoutStart,
      conversionRate: addToCart > 0 ? (checkoutStart / addToCart) * 100 : 0,
    },
    {
      name: "Purchase",
      count: purchase,
      conversionRate: checkoutStart > 0 ? (purchase / checkoutStart) * 100 : 0,
    },
  ];
}

function emptyStages(): FunnelStage[] {
  return [
    { name: "Page Views", count: 0, conversionRate: 100 },
    { name: "Product Views", count: 0, conversionRate: 0 },
    { name: "Add to Cart", count: 0, conversionRate: 0 },
    { name: "Checkout Started", count: 0, conversionRate: 0 },
    { name: "Purchase", count: 0, conversionRate: 0 },
  ];
}

export interface LandingPageRow {
  path: string;
  visitors: number;
  conversions: number;
}

/**
 * Top entry pathnames for storefront visitors in the last 30 days, with
 * how many of those visitors later progressed to product_added_to_cart.
 *
 * "Entry path" = the pathname of the first $pageview in a visitor's
 * 30-day window. Conversions = the subset of those visitors who also
 * fired product_added_to_cart anywhere in the window.
 *
 * This is the "flexible flows" view: shows where people actually come in
 * (Meta lands /pages/m1, organic lands /, ad-of-the-week lands /products/X,
 * etc.) and which entry doors lead to cart-add.
 */
export async function getLandingPageBreakdown(): Promise<LandingPageRow[]> {
  if (!process.env.POSTHOG_PROJECT_ID || !process.env.POSTHOG_PERSONAL_API_KEY) {
    return [];
  }

  // Per person: their first storefront pathname, and whether they later
  // added to cart. Group at the outer level by entry path.
  const query = `
    SELECT
      entry_path,
      count() AS visitors,
      countIf(added_to_cart) AS conversions
    FROM (
      SELECT
        person_id,
        argMin(properties.$pathname, timestamp) AS entry_path,
        max(event = 'product_added_to_cart') AS added_to_cart
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND properties.$host = 'www.fitwellbuckle.co'
        AND event IN ('$pageview', 'product_added_to_cart')
      GROUP BY person_id
    )
    WHERE entry_path IS NOT NULL
    GROUP BY entry_path
    ORDER BY visitors DESC
    LIMIT 15
  `;

  try {
    const res = await runHogQL(query);
    return (res.results ?? []).map((r) => ({
      path: String(r[0] ?? ""),
      visitors: Number(r[1]) || 0,
      conversions: Number(r[2]) || 0,
    }));
  } catch (err) {
    console.error("getLandingPageBreakdown HogQL failed:", err);
    return [];
  }
}
