export interface ShopifyAddress {
  /** Shopify's address id — present on saved customer addresses. */
  id?: number;
  first_name: string | null;
  last_name: string | null;
  company?: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code?: string | null;
  country: string | null;
  country_code?: string | null;
  zip: string | null;
  phone: string | null;
  /** Present on entries in `customer.addresses[]` — marks the default. */
  default?: boolean;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  tags: string;
  created_at: string;
  updated_at: string;
  default_address?: ShopifyAddress;
  /** All saved addresses (including the default). REST returns this on the
   *  customer endpoints. */
  addresses?: ShopifyAddress[];
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  /** Shipping charged, in a money-set. `shop_money.amount` is the store-currency value. */
  total_shipping_price_set?: {
    shop_money: { amount: string; currency_code: string };
  };
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  /** Set when the order was cancelled; null/absent otherwise. */
  cancelled_at?: string | null;
  discount_codes: Array<{ code: string; amount: string; type: string }>;
  /**
   * Refunds embedded in the order payload. Each refund's `transactions` carry
   * the actual money moved — sum `kind === 'refund' && status === 'success'`
   * for the total refunded amount (see `sumRefundedCents`).
   */
  refunds: Array<{
    id: number;
    created_at: string;
    transactions?: Array<{ amount: string; kind: string; status: string }>;
  }>;
  processed_at: string;
  created_at: string;
  updated_at: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer;
  source_name: string | null;
  landing_site: string | null;
  referring_site: string | null;
  note: string | null;
  note_attributes: Array<{ name: string; value: string }>;
  tags: string;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  options: Array<{ name: string; values: string[] }>;
  variants: ShopifyVariant[];
  images: Array<{ id: number; src: string; position: number }>;
}

export interface WebhookPayload {
  topic: string;
  domain: string;
  body: ShopifyOrder | ShopifyCustomer;
}
