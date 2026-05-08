import type { ShopifyOrder, ShopifyCustomer } from "@/types/shopify";

const SHOPIFY_API_VERSION = "2024-10";

interface ShopifyPaginatedResponse<T> {
  data: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

class ShopifyClient {
  private domain: string;
  private token: string;
  private baseUrl: string;

  constructor() {
    this.domain = process.env.SHOPIFY_STORE_DOMAIN ?? "";
    this.token = process.env.SHOPIFY_ADMIN_API_TOKEN ?? "";
    this.baseUrl = `https://${this.domain}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  private async fetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    // Respect rate limits
    const remaining = res.headers.get("x-shopify-shop-api-call-limit");
    if (remaining) {
      const [used, limit] = remaining.split("/").map(Number);
      if (used / limit > 0.8) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async getOrders(
    params: {
      limit?: number;
      since_id?: string;
      status?: string;
      created_at_min?: string;
    } = {},
  ): Promise<ShopifyPaginatedResponse<ShopifyOrder>> {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(params.limit ?? 50));
    if (params.since_id) searchParams.set("since_id", params.since_id);
    if (params.status) searchParams.set("status", params.status);
    if (params.created_at_min)
      searchParams.set("created_at_min", params.created_at_min);

    const result = await this.fetch<{ orders: ShopifyOrder[] }>(
      `/orders.json?${searchParams.toString()}`,
    );

    return {
      data: result.orders,
      pageInfo: {
        hasNextPage: result.orders.length === (params.limit ?? 50),
        endCursor: result.orders.at(-1)?.id.toString() ?? null,
      },
    };
  }

  async getCustomers(
    params: { limit?: number; since_id?: string } = {},
  ): Promise<ShopifyPaginatedResponse<ShopifyCustomer>> {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(params.limit ?? 50));
    if (params.since_id) searchParams.set("since_id", params.since_id);

    const result = await this.fetch<{ customers: ShopifyCustomer[] }>(
      `/customers.json?${searchParams.toString()}`,
    );

    return {
      data: result.customers,
      pageInfo: {
        hasNextPage: result.customers.length === (params.limit ?? 50),
        endCursor: result.customers.at(-1)?.id.toString() ?? null,
      },
    };
  }

  async getProducts(params: { limit?: number } = {}) {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(params.limit ?? 50));

    return this.fetch<{
      products: Array<{
        id: number;
        title: string;
        variants: Array<{ id: number; sku: string; price: string }>;
      }>;
    }>(`/products.json?${searchParams.toString()}`);
  }
}

// Singleton
let client: ShopifyClient | null = null;

export function getShopifyClient(): ShopifyClient {
  if (!client) {
    client = new ShopifyClient();
  }
  return client;
}
