import type {
  ShopifyOrder,
  ShopifyCustomer,
  ShopifyProduct,
} from "@/types/shopify";

const SHOPIFY_API_VERSION = "2025-01";
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_MS = 500;

/**
 * Parse RFC 5988 Link header to extract the "next" page URL.
 * Format: `<https://...>; rel="next"`, possibly with other links comma-separated.
 */
function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/** Convert a Shopify decimal string ("49.95") to cents integer (4995). */
export function toCents(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

class ShopifyClient {
  private domain: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private baseUrl: string;

  constructor() {
    this.domain = process.env.SHOPIFY_STORE_DOMAIN ?? "";
    this.clientId = process.env.SHOPIFY_CLIENT_ID ?? "";
    this.clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? "";

    if (!this.domain) {
      console.warn("Shopify client: SHOPIFY_STORE_DOMAIN not set");
    }
    if (!this.clientId || !this.clientSecret) {
      console.warn(
        "Shopify client: SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set",
      );
    }
    this.baseUrl = `https://${this.domain}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const res = await fetch(
      `https://${this.domain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Shopify token exchange failed: ${res.status} ${await res.text()}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;
    console.log(
      `Shopify token refreshed, expires in ${Math.round(data.expires_in / 3600)}h`,
    );
    return this.accessToken;
  }

  /**
   * Core fetch with rate-limit awareness and exponential backoff on 429.
   * Returns the parsed JSON body. Throws on non-retryable errors.
   */
  async fetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = endpoint.startsWith("https://")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    let lastError: Error | null = null;
    const token = await this.getToken();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      // Check rate limit bucket before processing response
      const callLimit = res.headers.get("X-Shopify-Shop-Api-Call-Limit");
      if (callLimit) {
        const [used, limit] = callLimit.split("/").map(Number);
        const ratio = used / limit;
        if (ratio > 0.5) {
          console.log(
            `Shopify rate limit: ${used}/${limit} (${Math.round(ratio * 100)}%)`,
          );
        }
        if (ratio > 0.75) {
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }

      // Handle 429 with exponential backoff
      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(
            `Shopify 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(
          `Shopify API rate limited after ${MAX_RETRIES} retries`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = new Error(
          `Shopify API error: ${res.status} ${res.statusText} — ${body}`,
        );
        // Retry on 5xx server errors
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(
            `Shopify ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      return res.json() as Promise<T>;
    }

    throw lastError ?? new Error("Shopify API: max retries exceeded");
  }

  /**
   * Fetch a single page with Link-header pagination info.
   * Returns the parsed body and the next page URL if present.
   */
  private async fetchPage<T>(
    endpoint: string,
    init?: RequestInit,
  ): Promise<{ body: T; nextPageUrl: string | null }> {
    const url = endpoint.startsWith("https://")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    let lastError: Error | null = null;
    const token = await this.getToken();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      const callLimit = res.headers.get("X-Shopify-Shop-Api-Call-Limit");
      if (callLimit) {
        const [used, limit] = callLimit.split("/").map(Number);
        const ratio = used / limit;
        if (ratio > 0.5) {
          console.log(
            `Shopify rate limit: ${used}/${limit} (${Math.round(ratio * 100)}%)`,
          );
        }
        if (ratio > 0.75) {
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }

      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(
            `Shopify 429, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(
          `Shopify API rate limited after ${MAX_RETRIES} retries`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = new Error(
          `Shopify API error: ${res.status} ${res.statusText} — ${body}`,
        );
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(
            `Shopify ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      const linkHeader = res.headers.get("Link");
      const nextPageUrl = parseLinkHeader(linkHeader);
      const body = (await res.json()) as T;

      return { body, nextPageUrl };
    }

    throw lastError ?? new Error("Shopify API: max retries exceeded");
  }

  // ── Orders ────────────────────────────────────────────────────────

  async getOrders(
    params: {
      limit?: number;
      status?: string;
      created_at_min?: string;
      updated_at_min?: string;
      page_info?: string;
    } = {},
  ): Promise<{ orders: ShopifyOrder[]; nextPageUrl: string | null }> {
    // If page_info is provided, it's the full URL from a Link header
    if (params.page_info) {
      const { body, nextPageUrl } = await this.fetchPage<{
        orders: ShopifyOrder[];
      }>(params.page_info);
      return { orders: body.orders, nextPageUrl };
    }

    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? 250));
    if (params.status) sp.set("status", params.status);
    if (params.created_at_min) sp.set("created_at_min", params.created_at_min);
    if (params.updated_at_min) sp.set("updated_at_min", params.updated_at_min);

    const { body, nextPageUrl } = await this.fetchPage<{
      orders: ShopifyOrder[];
    }>(`/orders.json?${sp.toString()}`);
    return { orders: body.orders, nextPageUrl };
  }

  async getOrder(id: number | string): Promise<ShopifyOrder> {
    const result = await this.fetch<{ order: ShopifyOrder }>(
      `/orders/${id}.json`,
    );
    return result.order;
  }

  async getOrderCount(
    params: {
      status?: string;
      created_at_min?: string;
      updated_at_min?: string;
    } = {},
  ): Promise<number> {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.created_at_min) sp.set("created_at_min", params.created_at_min);
    if (params.updated_at_min) sp.set("updated_at_min", params.updated_at_min);

    const result = await this.fetch<{ count: number }>(
      `/orders/count.json?${sp.toString()}`,
    );
    return result.count;
  }

  // ── Customers ─────────────────────────────────────────────────────

  async getCustomers(
    params: {
      limit?: number;
      updated_at_min?: string;
      page_info?: string;
    } = {},
  ): Promise<{ customers: ShopifyCustomer[]; nextPageUrl: string | null }> {
    if (params.page_info) {
      const { body, nextPageUrl } = await this.fetchPage<{
        customers: ShopifyCustomer[];
      }>(params.page_info);
      return { customers: body.customers, nextPageUrl };
    }

    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? 250));
    if (params.updated_at_min) sp.set("updated_at_min", params.updated_at_min);

    const { body, nextPageUrl } = await this.fetchPage<{
      customers: ShopifyCustomer[];
    }>(`/customers.json?${sp.toString()}`);
    return { customers: body.customers, nextPageUrl };
  }

  async getCustomer(id: number | string): Promise<ShopifyCustomer> {
    const result = await this.fetch<{ customer: ShopifyCustomer }>(
      `/customers/${id}.json`,
    );
    return result.customer;
  }

  async getCustomerCount(
    params: { updated_at_min?: string } = {},
  ): Promise<number> {
    const sp = new URLSearchParams();
    if (params.updated_at_min) sp.set("updated_at_min", params.updated_at_min);

    const result = await this.fetch<{ count: number }>(
      `/customers/count.json?${sp.toString()}`,
    );
    return result.count;
  }

  // ── Products ──────────────────────────────────────────────────────

  async getProducts(
    params: {
      limit?: number;
      page_info?: string;
    } = {},
  ): Promise<{ products: ShopifyProduct[]; nextPageUrl: string | null }> {
    if (params.page_info) {
      const { body, nextPageUrl } = await this.fetchPage<{
        products: ShopifyProduct[];
      }>(params.page_info);
      return { products: body.products, nextPageUrl };
    }

    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? 250));

    const { body, nextPageUrl } = await this.fetchPage<{
      products: ShopifyProduct[];
    }>(`/products.json?${sp.toString()}`);
    return { products: body.products, nextPageUrl };
  }

  // ── Collections ───────────────────────────────────────────────────

  /**
   * All collections (both manual "custom" and rule-based "smart"), flattened
   * to id + title. Paginates each type via the Link-header paginator.
   */
  async getCollections(): Promise<{ id: number; title: string }[]> {
    const out: { id: number; title: string }[] = [];
    const sources: Array<["custom_collections" | "smart_collections", string]> = [
      ["custom_collections", "/custom_collections.json?limit=250"],
      ["smart_collections", "/smart_collections.json?limit=250"],
    ];
    for (const [key, endpoint] of sources) {
      for await (const page of this.fetchAll<{ id: number; title: string }>(
        endpoint,
        key,
      )) {
        for (const c of page) out.push({ id: c.id, title: c.title });
      }
    }
    return out;
  }

  /**
   * Products in a collection. `/collections/{id}/products.json` resolves both
   * custom and smart collections (unlike the `collects` endpoint, which only
   * covers manual ones).
   */
  async getCollectionProducts(collectionId: number): Promise<ShopifyProduct[]> {
    const out: ShopifyProduct[] = [];
    for await (const page of this.fetchAll<ShopifyProduct>(
      `/collections/${collectionId}/products.json?limit=250`,
      "products",
    )) {
      out.push(...page);
    }
    return out;
  }

  // ── GraphQL (companies, markets — no REST equivalents) ─────────────

  /** POST a GraphQL query to the Admin API. Throws on transport or GraphQL errors. */
  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetch<{ data?: T; errors?: Array<{ message: string }> }>(
      "/graphql.json",
      { method: "POST", body: JSON.stringify({ query, variables }) },
    );
    if (res.errors && res.errors.length > 0) {
      throw new Error(`Shopify GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
    }
    if (!res.data) throw new Error("Shopify GraphQL returned no data");
    return res.data;
  }

  /** Active locations (warehouses). Requires the read_locations scope. */
  async getLocations(): Promise<{ id: string; name: string }[]> {
    const { locations } = await this.fetch<{
      locations: { id: number; name: string; active: boolean }[];
    }>("/locations.json");
    return locations
      .filter((l) => l.active)
      .map((l) => ({ id: String(l.id), name: l.name }));
  }

  /** A single location with its address. Requires the read_locations scope. */
  async getLocation(id: string | number): Promise<{
    id: string;
    name: string;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
  }> {
    const { location } = await this.fetch<{
      location: {
        id: number;
        name: string;
        address1: string | null;
        address2: string | null;
        city: string | null;
        province: string | null;
        zip: string | null;
        country: string | null;
        phone: string | null;
      };
    }>(`/locations/${id}.json`);
    return { ...location, id: String(location.id) };
  }

  /**
   * The store's name + registered business address (Settings → General →
   * Business details). Uses Shop.billingAddress, which is the legal address
   * shown there (can differ from the store/location address).
   */
  async getShop(): Promise<{
    name: string;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  }> {
    const data = await this.graphql<{
      shop: {
        name: string;
        billingAddress: {
          address1: string | null;
          address2: string | null;
          city: string | null;
          province: string | null;
          zip: string | null;
          country: string | null;
        } | null;
      };
    }>(`{ shop { name billingAddress { address1 address2 city province zip country } } }`);
    const b = data.shop.billingAddress;
    return {
      name: data.shop.name,
      address1: b?.address1 ?? null,
      address2: b?.address2 ?? null,
      city: b?.city ?? null,
      province: b?.province ?? null,
      zip: b?.zip ?? null,
      country: b?.country ?? null,
    };
  }

  /**
   * The store's brand logo URL (Settings → Brand). Requires the brand field to
   * be available to the app (an extra scope, e.g. read_content). Returns null
   * when unset; throws if the field isn't in the app's schema.
   */
  async getBrandLogoUrl(): Promise<string | null> {
    const data = await this.graphql<{
      shop: { brand: { logo: { image: { url: string } | null } | null } | null };
    }>(`{ shop { brand { logo { image { url } } } } }`);
    return data.shop.brand?.logo?.image?.url ?? null;
  }

  // ── Inventory (C2 receiving) ──────────────────────────────────────

  /** The inventory_item_id backing a variant — needed to adjust its stock. */
  async getVariantInventoryItemId(variantId: string | number): Promise<number> {
    // Tolerate a GraphQL gid as well as a bare REST id.
    const id = String(variantId).split("/").pop();
    const { variant } = await this.fetch<{
      variant: { id: number; inventory_item_id: number };
    }>(`/variants/${id}.json`);
    return variant.inventory_item_id;
  }

  /**
   * Adjust a variant's available stock at a location (C2 receiving). Resolves
   * the variant's inventory_item_id, then posts an inventory adjustment.
   * Requires the write_inventory scope — until it's granted in the Shopify Dev
   * Dashboard (store re-auth), Shopify returns 403 and this throws; the receive
   * route surfaces that as a clear "scope not granted" message.
   */
  async adjustInventory(params: {
    variantId: string | number;
    locationId: string | number;
    delta: number;
  }): Promise<{ available: number }> {
    const inventoryItemId = await this.getVariantInventoryItemId(params.variantId);
    const { inventory_level } = await this.fetch<{
      inventory_level: { available: number };
    }>("/inventory_levels/adjust.json", {
      method: "POST",
      body: JSON.stringify({
        location_id: Number(params.locationId),
        inventory_item_id: inventoryItemId,
        available_adjustment: params.delta,
      }),
    });
    return { available: inventory_level.available };
  }

  // ── Generic paginator ─────────────────────────────────────────────

  /**
   * Follow Link-header pagination to fetch ALL pages.
   * Yields one array of items per page so callers can process incrementally.
   *
   * @param firstEndpoint - The initial endpoint (relative or absolute URL)
   * @param key - The JSON key containing the array (e.g., "orders", "customers")
   */
  async *fetchAll<T>(
    firstEndpoint: string,
    key: string,
  ): AsyncGenerator<T[], void, unknown> {
    let url: string | null = firstEndpoint.startsWith("https://")
      ? firstEndpoint
      : `${this.baseUrl}${firstEndpoint}`;

    while (url) {
      const result: { body: Record<string, T[]>; nextPageUrl: string | null } =
        await this.fetchPage<Record<string, T[]>>(url);
      const items = result.body[key];
      if (items && items.length > 0) {
        yield items;
      }
      url = result.nextPageUrl;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Singleton ─────────────────────────────────────────────────────

let client: ShopifyClient | null = null;

export function getShopifyClient(): ShopifyClient {
  if (!client) {
    client = new ShopifyClient();
  }
  return client;
}
