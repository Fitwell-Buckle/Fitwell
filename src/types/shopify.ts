export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
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
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  discount_codes: Array<{ code: string; amount: string; type: string }>;
  refunds: Array<{ id: number; created_at: string }>;
  processed_at: string;
  created_at: string;
  updated_at: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer;
  landing_site: string | null;
  referring_site: string | null;
  note: string | null;
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
  variants: ShopifyVariant[];
  images: Array<{ id: number; src: string; position: number }>;
}

export interface WebhookPayload {
  topic: string;
  domain: string;
  body: ShopifyOrder | ShopifyCustomer;
}
