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

/**
 * Shipping address for a draft order. Field names match the GraphQL
 * `MailingAddressInput` (camelCase), NOT the REST `ShopifyAddress` read-shape.
 * All fields optional — null/empty entries are dropped before sending.
 */
export interface DraftShippingAddress {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
}

/** Drop null/undefined/empty fields so MailingAddressInput stays clean. */
function cleanAddress(a: DraftShippingAddress): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

export interface DraftOrderInvoiceParams {
  email: string | null;
  shopifyCustomerId?: string | null;
  discountPercent: number;
  /** Label for the order-level discount (defaults to the B2B tier). */
  discountTitle?: string;
  note?: string;
  /** Order tags (e.g. ["sample"]). Used to flag samples on the Shopify side. */
  tags?: string[];
  /** Ship-to address. Required for a sample that Shopify will actually ship. */
  shippingAddress?: DraftShippingAddress;
  /**
   * When true, complete the draft into a real order marked paid
   * (paymentPending: false) so Shopify fulfillment ships it without a human
   * completing it in Admin. Used by the B2B samples flow.
   */
  completeAsPaid?: boolean;
  lines: {
    variantId: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
  }[];
}

/**
 * Build the `DraftOrderInput` payload for createDraftOrderInvoice. Pure and
 * exported so the mapping (line items, discount, tags, shipping address,
 * purchasing entity) is unit-testable without an HTTP round-trip.
 */
export function buildDraftOrderInput(
  params: DraftOrderInvoiceParams,
): Record<string, unknown> {
  const lineItems = params.lines.map((l) =>
    l.variantId
      ? {
          variantId: `gid://shopify/ProductVariant/${String(l.variantId).split("/").pop()}`,
          quantity: l.quantity,
        }
      : {
          title: l.title,
          originalUnitPrice: (l.unitPriceCents / 100).toFixed(2),
          quantity: l.quantity,
        },
  );

  const input: Record<string, unknown> = { lineItems };
  if (params.email) input.email = params.email;
  if (params.note) input.note = params.note;
  if (params.tags && params.tags.length > 0) input.tags = params.tags;
  if (params.shippingAddress) {
    input.shippingAddress = cleanAddress(params.shippingAddress);
  }
  if (params.discountPercent > 0) {
    input.appliedDiscount = {
      valueType: "PERCENTAGE",
      value: params.discountPercent,
      title: params.discountTitle ?? "B2B price tier",
    };
  }
  if (params.shopifyCustomerId) {
    input.purchasingEntity = {
      customerId: `gid://shopify/Customer/${String(params.shopifyCustomerId).split("/").pop()}`,
    };
  }
  return input;
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

  // Add an ADDITIONAL address to a Shopify customer (never the default, never
  // overwriting an existing one). De-dupes against the customer's current
  // addresses on address1+city+zip so re-running is a no-op. Requires the
  // `write_customers` scope. Returns whether a new address was actually created.
  async createCustomerAddress(
    shopifyCustomerId: string | number,
    address: {
      address1?: string | null;
      address2?: string | null;
      city?: string | null;
      province?: string | null;
      zip?: string | null;
      country?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      company?: string | null;
      phone?: string | null;
    },
  ): Promise<{ created: boolean; reason?: "duplicate" }> {
    const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
    const existing = await this.fetch<{
      addresses: Array<{ address1?: string; city?: string; zip?: string }>;
    }>(`/customers/${shopifyCustomerId}/addresses.json`);
    const dup = (existing.addresses ?? []).some(
      (a) =>
        norm(a.address1) === norm(address.address1) &&
        norm(a.city) === norm(address.city) &&
        norm(a.zip) === norm(address.zip),
    );
    if (dup) return { created: false, reason: "duplicate" };

    await this.fetch(`/customers/${shopifyCustomerId}/addresses.json`, {
      method: "POST",
      body: JSON.stringify({
        address: {
          address1: address.address1 ?? undefined,
          address2: address.address2 ?? undefined,
          city: address.city ?? undefined,
          province: address.province ?? undefined,
          zip: address.zip ?? undefined,
          country: address.country ?? undefined,
          first_name: address.firstName ?? undefined,
          last_name: address.lastName ?? undefined,
          company: address.company ?? undefined,
          phone: address.phone ?? undefined,
        },
      }),
    });
    return { created: true };
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
    // Return EVERY product regardless of sales-channel publish state — otherwise
    // the REST default can omit unpublished / "unlisted" products entirely, so
    // they'd never reach the catalog no matter how we filter client-side. (Status
    // — active/draft/archived — is filtered in loadCatalog, not here.) The
    // filter carries through pagination via the page_info link.
    sp.set("published_status", "any");

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

  /** A variant's retail price in cents — the basis for B2B invoice pricing. */
  async getVariantPriceCents(variantId: string | number): Promise<number> {
    const id = String(variantId).split("/").pop();
    const { variant } = await this.fetch<{
      variant: { id: number; price: string | null };
    }>(`/variants/${id}.json`);
    return toCents(variant.price);
  }

  /**
   * Adjust a variant's available stock at a location (C2 receiving). Resolves
   * the variant's inventory_item_id, then runs the GraphQL
   * inventoryAdjustQuantities mutation with reason "received" and an optional
   * `reference` (we pass the PO number's URL) recorded as the adjustment's
   * referenceDocumentUri — so the receipt is traceable in Shopify's inventory
   * history. Requires the write_inventory scope — until it's granted (store
   * re-auth), Shopify returns "access denied" and this throws; the receive
   * route surfaces that as a clear "scope not granted" message.
   */
  async adjustInventory(params: {
    variantId: string | number;
    locationId: string | number;
    delta: number;
    reference?: string;
    /** Optional per-unit cost (cents) to record on the inventory item (C2). */
    costCents?: number | null;
  }): Promise<{ available: number | null }> {
    const inventoryItemId = await this.getVariantInventoryItemId(params.variantId);

    const data = await this.graphql<{
      inventoryAdjustQuantities: {
        userErrors: { field: string[] | null; message: string }[];
        inventoryAdjustmentGroup: {
          changes: { name: string; quantityAfterChange: number | null }[];
        } | null;
      };
    }>(
      `mutation FitwellReceive($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors { field message }
          inventoryAdjustmentGroup { changes { name quantityAfterChange } }
        }
      }`,
      {
        input: {
          reason: "received",
          name: "available",
          referenceDocumentUri: params.reference,
          changes: [
            {
              delta: params.delta,
              inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
              locationId: `gid://shopify/Location/${params.locationId}`,
            },
          ],
        },
      },
    );

    const errs = data.inventoryAdjustQuantities.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(
        `Inventory adjust failed: ${errs.map((e) => e.message).join("; ")}`,
      );
    }
    const change = data.inventoryAdjustQuantities.inventoryAdjustmentGroup?.changes?.find(
      (c) => c.name === "available",
    );

    // Record the unit cost on the inventory item (best-effort): the quantity
    // adjust already succeeded and the line will be stamped received, so a cost
    // failure must NOT throw here (that would lose the idempotency stamp and
    // risk double-counting on retry).
    if (params.costCents != null) {
      try {
        await this.setInventoryItemCost(inventoryItemId, params.costCents);
      } catch (err) {
        console.warn(
          `Set inventory cost failed for item ${inventoryItemId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { available: change?.quantityAfterChange ?? null };
  }

  /**
   * Set an inventory item's unit cost (the "cost per item" in Shopify). Used on
   * receipt so the Total Cost from production flows into Shopify's cost basis.
   * Cost is the shop currency in major units (e.g. 8.00). Requires write_inventory.
   */
  async setInventoryItemCost(
    inventoryItemId: string | number,
    costCents: number,
  ): Promise<void> {
    const id = String(inventoryItemId).split("/").pop();
    const cost = (costCents / 100).toFixed(2);
    const data = await this.graphql<{
      inventoryItemUpdate: {
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation FitwellSetCost($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
          inventoryItem { id }
        }
      }`,
      { id: `gid://shopify/InventoryItem/${id}`, input: { cost } },
    );
    const errs = data.inventoryItemUpdate.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(
        `Set inventory cost failed: ${errs.map((e) => e.message).join("; ")}`,
      );
    }
  }

  // ── Variant updates (barcode sync) ────────────────────────────────

  /**
   * Set the `barcode` field on a batch of variants under a single product, via
   * the `productVariantsBulkUpdate` GraphQL mutation. Requires write_products —
   * until the scope is granted (store re-auth after toml change + deploy),
   * Shopify returns "access denied" and this throws.
   *
   * Pass the bare numeric Shopify variant ids; gids are constructed here.
   */
  async bulkUpdateVariantBarcodes(params: {
    productId: string | number;
    variants: { id: string | number; barcode: string }[];
  }): Promise<void> {
    if (params.variants.length === 0) return;
    const productGid = `gid://shopify/Product/${String(params.productId).split("/").pop()}`;
    const variantInputs = params.variants.map((v) => ({
      id: `gid://shopify/ProductVariant/${String(v.id).split("/").pop()}`,
      barcode: v.barcode,
    }));

    const data = await this.graphql<{
      productVariantsBulkUpdate: {
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation FitwellBarcodeSync($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
          productVariants { id barcode }
        }
      }`,
      { productId: productGid, variants: variantInputs },
    );

    const errs = data.productVariantsBulkUpdate.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(
        `Variant barcode update failed: ${errs.map((e) => e.message).join("; ")}`,
      );
    }
  }

  // ── B2B invoicing (draft orders) ──────────────────────────────────

  /**
   * Create a Shopify draft order (B2B invoice or sample) and return the draft
   * id + invoice (payment) URL. Lines with a variant use Shopify's retail
   * price; lines without fall back to a custom price. The discount is applied
   * order-level (a B2B tier %, or 100% for a sample). `tags` flag the order
   * (e.g. ["sample"]); `shippingAddress` sets ship-to. Requires the
   * write_draft_orders scope — without it Shopify returns "access denied" and
   * this throws; callers surface that as a skip note.
   *
   * When `completeAsPaid` is set, the draft is immediately completed into a
   * real order with paymentPending: false (also needs write_orders), so
   * Shopify fulfillment ships it without a human completing it in Admin — this
   * is how the B2B samples flow ships a $0 order. The returned `orderId` /
   * `orderName` are the completed order's; they're undefined otherwise.
   */
  async createDraftOrderInvoice(params: DraftOrderInvoiceParams): Promise<{
    draftOrderId: string;
    invoiceUrl: string | null;
    orderId?: string;
    orderName?: string;
  }> {
    const input = buildDraftOrderInput(params);

    const created = await this.graphql<{
      draftOrderCreate: {
        draftOrder: { id: string; invoiceUrl: string | null } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation FitwellDraftCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id invoiceUrl }
          userErrors { field message }
        }
      }`,
      { input },
    );

    const errs = created.draftOrderCreate.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(`Draft order failed: ${errs.map((e) => e.message).join("; ")}`);
    }
    const draftOrder = created.draftOrderCreate.draftOrder;
    if (!draftOrder) throw new Error("Draft order was not created");

    // Complete the draft into a real, paid order so fulfillment can ship it.
    // paymentPending: false marks it paid (correct for a $0 sample — there's
    // nothing to collect). The `sample` tag is what keeps this $0 paid order
    // out of our revenue, not its financial status.
    if (params.completeAsPaid) {
      const completed = await this.graphql<{
        draftOrderComplete: {
          draftOrder: {
            id: string;
            order: { id: string; name: string } | null;
          } | null;
          userErrors: { field: string[] | null; message: string }[];
        };
      }>(
        `mutation FitwellDraftComplete($id: ID!) {
          draftOrderComplete(id: $id, paymentPending: false) {
            draftOrder { id order { id name } }
            userErrors { field message }
          }
        }`,
        { id: draftOrder.id },
      );

      const cErrs = completed.draftOrderComplete.userErrors;
      if (cErrs && cErrs.length > 0) {
        throw new Error(
          `Draft order completion failed: ${cErrs.map((e) => e.message).join("; ")}`,
        );
      }
      const completedOrder = completed.draftOrderComplete.draftOrder?.order;
      return {
        draftOrderId: draftOrder.id,
        invoiceUrl: draftOrder.invoiceUrl,
        orderId: completedOrder?.id,
        orderName: completedOrder?.name,
      };
    }

    // We do NOT call draftOrderInvoiceSend here — Shopify would otherwise send
    // its own branded invoice email to the customer, duplicating the one we
    // send via Resend. The returned `invoiceUrl` is a fully-functional payment
    // link without needing Shopify to email it.
    return { draftOrderId: draftOrder.id, invoiceUrl: draftOrder.invoiceUrl };
  }

  // ── Creator discount codes ────────────────────────────────────────

  /**
   * Create a basic percentage discount code (creator program Phase 4).
   * Defaults match the spec: single-use-per-customer, applies to all
   * items/customers, no expiry unless given. Requires the write_discounts
   * scope — without it Shopify returns "access denied" and this throws;
   * the API route surfaces that as a graceful 502 (same pattern as the
   * leads address-sync button).
   */
  async createBasicDiscountCode(params: {
    code: string;
    percentOff: number; // e.g. 15
    title?: string;
    expiresAt?: Date | null;
  }): Promise<{ discountNodeId: string }> {
    const result = await this.graphql<{
      discountCodeBasicCreate: {
        codeDiscountNode: { id: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      `mutation FitwellCreatorCodeCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      {
        basicCodeDiscount: {
          title: params.title ?? `Creator: ${params.code}`,
          code: params.code,
          startsAt: new Date().toISOString(),
          ...(params.expiresAt ? { endsAt: params.expiresAt.toISOString() } : {}),
          customerSelection: { all: true },
          customerGets: {
            value: { percentage: params.percentOff / 100 },
            items: { all: true },
          },
          appliesOncePerCustomer: true,
        },
      },
    );

    const errs = result.discountCodeBasicCreate.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(
        `Discount code failed: ${errs.map((e) => e.message).join("; ")}`,
      );
    }
    const node = result.discountCodeBasicCreate.codeDiscountNode;
    if (!node) throw new Error("Discount code was not created");
    return { discountNodeId: node.id };
  }

  /**
   * The draft order a real order was completed from (null if none).
   * REST webhook payloads don't carry this link — one GraphQL lookup
   * connects gifting draft orders to their fulfilled orders.
   */
  async getOrderDraftOrderId(orderId: string): Promise<string | null> {
    const result = await this.graphql<{
      order: { draftOrder: { id: string } | null } | null;
    }>(
      `query FitwellOrderDraftLink($id: ID!) {
        order(id: $id) { draftOrder { id } }
      }`,
      { id: `gid://shopify/Order/${orderId}` },
    );
    return result.order?.draftOrder?.id ?? null;
  }

  /**
   * Countries covered by at least one shipping zone — "where we actually
   * deliver" (the checkbox list in Settings → Shipping and delivery).
   * Returns null when a zone covers Rest of World (= ships anywhere).
   * Requires read_shipping; callers fall back to markets-only until the
   * scope is granted.
   */
  async getShippingCountryCodes(): Promise<string[] | null> {
    const result = await this.graphql<{
      deliveryProfiles: {
        nodes: {
          profileLocationGroups: {
            locationGroupZones: {
              nodes: {
                zone: {
                  countries: {
                    code: { countryCode: string | null; restOfWorld: boolean };
                  }[];
                };
              }[];
            };
          }[];
        }[];
      };
    }>(
      `query FitwellShippingCountries {
        deliveryProfiles(first: 10) {
          nodes {
            profileLocationGroups {
              locationGroupZones(first: 50) {
                nodes {
                  zone {
                    countries { code { countryCode restOfWorld } }
                  }
                }
              }
            }
          }
        }
      }`,
    );

    const codes = new Set<string>();
    for (const profile of result.deliveryProfiles.nodes) {
      for (const group of profile.profileLocationGroups) {
        for (const zoneNode of group.locationGroupZones.nodes) {
          for (const country of zoneNode.zone.countries) {
            if (country.code.restOfWorld) return null; // ships anywhere
            if (country.code.countryCode) {
              codes.add(country.code.countryCode.toUpperCase());
            }
          }
        }
      }
    }
    return [...codes];
  }

  // ── Markets ───────────────────────────────────────────────────────

  /**
   * Country codes (ISO 3166-1 alpha-2) of all ENABLED Shopify Markets —
   * i.e., where we actually sell. Drives creator market-gating: enabling
   * a market in Shopify automatically returns that country's sidelined
   * creators to the pipeline. Requires read_markets (granted).
   */
  async getActiveMarketCountryCodes(): Promise<string[]> {
    const result = await this.graphql<{
      markets: {
        nodes: {
          enabled: boolean;
          regions: { nodes: { code?: string }[] };
        }[];
      };
    }>(
      `query FitwellActiveMarkets {
        markets(first: 50) {
          nodes {
            enabled
            regions(first: 250) {
              nodes { ... on MarketRegionCountry { code } }
            }
          }
        }
      }`,
    );

    const codes = new Set<string>();
    for (const market of result.markets.nodes) {
      if (!market.enabled) continue;
      for (const region of market.regions.nodes) {
        if (region.code) codes.add(region.code.toUpperCase());
      }
    }
    return [...codes];
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
