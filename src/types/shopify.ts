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
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
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

export interface WebhookPayload {
  topic: string;
  domain: string;
  body: ShopifyOrder | ShopifyCustomer;
}
