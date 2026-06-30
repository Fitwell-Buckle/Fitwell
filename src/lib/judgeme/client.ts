/**
 * Judge.me REST API client.
 *
 * Auth: `api_token` + `shop_domain` as query parameters (no header,
 * no OAuth). The token is a read-only key generated in Judge.me
 * dashboard → Settings → API.
 *
 * Endpoint pattern: GET https://judge.me/api/v1/reviews
 *   ?api_token=<token>&shop_domain=<host>&page=<n>&per_page=100
 *
 * Returns { reviews: [...], current_page, per_page, total }. We page
 * until current_page * per_page >= total, with a small inter-request
 * delay so a bulk sync doesn't trip rate limits.
 *
 * Public functions live here; the upsert/sync orchestration lives in
 * /api/cron/extract-judgeme/route.ts so this module stays free of DB
 * imports and is unit-testable on the response-mapping logic.
 */

const JUDGEME_API_BASE = "https://judge.me/api/v1";

export interface JudgemeReviewRaw {
  id: number | string;
  title?: string | null;
  body?: string | null;
  // Some Judge.me clients return ratings as strings (e.g. "5"). Accept both.
  rating?: number | string | null;
  verified?: boolean | string | null;
  reviewer?: {
    email?: string | null;
    name?: string | null;
  } | null;
  product_external_id?: string | null;
  product_handle?: string | null;
  created_at?: string | null;
  // Some Judge.me responses also include these:
  ip_address?: string | null;
  source?: string | null;
  // Customer-uploaded photos. Each picture exposes a `urls` map of sizes.
  pictures?: Array<{
    urls?: {
      original?: string | null;
      huge?: string | null;
      compact?: string | null;
      small?: string | null;
    } | null;
  } | null> | null;
}

export interface NormalizedReview {
  externalId: string;
  source: "judgeme";
  reviewerEmail: string | null;
  reviewerName: string | null;
  rating: number | null;
  title: string | null;
  body: string | null;
  verified: boolean;
  productId: string | null;
  productHandle: string | null;
  location: string | null;
  reviewDate: Date | null;
  imageUrls: string[] | null;
}

export interface JudgemeListResponse {
  reviews?: JudgemeReviewRaw[];
  current_page?: number;
  per_page?: number;
  total?: number;
}

export interface JudgemeConfig {
  apiToken: string;
  shopDomain: string;
  /** Optional override of base URL — primarily for tests. */
  apiBase?: string;
  /** Pagination size; Judge.me allows up to 100. */
  perPage?: number;
  /** Sleep between page requests in ms. Default 200ms. */
  delayMs?: number;
}

export function judgemeConfigFromEnv(): JudgemeConfig {
  const apiToken = process.env.JUDGEME_API_TOKEN;
  const shopDomain = process.env.JUDGEME_SHOP_DOMAIN;
  if (!apiToken || !shopDomain) {
    throw new Error(
      "Judge.me sync requires JUDGEME_API_TOKEN + JUDGEME_SHOP_DOMAIN env vars.",
    );
  }
  return { apiToken, shopDomain };
}

/**
 * Pure mapper from a raw Judge.me review object to our normalized
 * shape. Exported so unit tests can exercise it without HTTP.
 */
export function normalizeReview(raw: JudgemeReviewRaw): NormalizedReview {
  const verifiedRaw = raw.verified;
  const verified =
    verifiedRaw === true ||
    verifiedRaw === "true" ||
    verifiedRaw === "verified-buyer" ||
    verifiedRaw === "verified-customer";

  // Judge.me's `created_at` is an ISO string. Treat null/empty as no date.
  let reviewDate: Date | null = null;
  if (raw.created_at) {
    const d = new Date(raw.created_at);
    if (!Number.isNaN(d.getTime())) reviewDate = d;
  }

  // Rating defensively — some clients return strings.
  let rating: number | null = null;
  if (typeof raw.rating === "number") rating = raw.rating;
  else if (typeof raw.rating === "string" && raw.rating.trim() !== "") {
    const r = Number(raw.rating);
    if (Number.isFinite(r)) rating = r;
  }

  // Customer-uploaded photos → flat list of CDN URLs, preferring larger sizes.
  const pictureUrls = (raw.pictures ?? [])
    .map(
      (p) =>
        p?.urls?.huge ??
        p?.urls?.original ??
        p?.urls?.compact ??
        p?.urls?.small ??
        null,
    )
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  return {
    externalId: String(raw.id),
    source: "judgeme",
    reviewerEmail: raw.reviewer?.email?.toLowerCase().trim() || null,
    reviewerName: raw.reviewer?.name?.trim() || null,
    rating,
    title: raw.title?.trim() || null,
    body: raw.body?.trim() || null,
    verified,
    productId: raw.product_external_id || null,
    productHandle: raw.product_handle || null,
    // Judge.me's review object doesn't expose a location field on the
    // API at the moment; the CSV export does. Kept nullable so the
    // export-driven backfill can populate it.
    location: null,
    reviewDate,
    imageUrls: pictureUrls.length > 0 ? pictureUrls : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Paginated fetch of all reviews. Yields one batch (array of
 * normalized reviews) per page so the caller can upsert incrementally
 * without holding the entire set in memory.
 */
export async function* fetchAllReviews(
  config: JudgemeConfig,
): AsyncGenerator<NormalizedReview[]> {
  const apiBase = config.apiBase ?? JUDGEME_API_BASE;
  const perPage = config.perPage ?? 100;
  const delayMs = config.delayMs ?? 200;

  let page = 1;
  let totalSeen = 0;

  while (true) {
    const url = new URL(`${apiBase}/reviews`);
    url.searchParams.set("api_token", config.apiToken);
    url.searchParams.set("shop_domain", config.shopDomain);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(
        `Judge.me API ${res.status} ${res.statusText} on page ${page}`,
      );
    }
    const json = (await res.json()) as JudgemeListResponse;
    const reviews = json.reviews ?? [];
    if (reviews.length === 0) break;

    const normalized = reviews.map(normalizeReview);
    yield normalized;
    totalSeen += reviews.length;

    // Stop when we've seen all reported reviews, or when the page is
    // shorter than per_page (last partial page).
    const total = json.total;
    if (typeof total === "number" && totalSeen >= total) break;
    if (reviews.length < perPage) break;

    page += 1;
    await sleep(delayMs);
  }
}
