import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── NextAuth tables ────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role").default("user"),
});

export const account = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const session = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ─── Business tables ────────────────────────────────────────────────

export const customer = pgTable(
  "customer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopifyId: text("shopify_id").unique(),
    email: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    totalSpent: integer("total_spent").default(0),
    orderCount: integer("order_count").default(0),
    firstOrderAt: timestamp("first_order_at", { mode: "date" }),
    lastOrderAt: timestamp("last_order_at", { mode: "date" }),
    tags: text("tags").array(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_shopify_id_idx").on(t.shopifyId),
    index("customer_email_idx").on(t.email),
  ],
);

export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shopifyId: text("shopify_id").unique(),
    shopifyOrderNumber: integer("shopify_order_number"),
    customerId: text("customer_id").references(() => customer.id),
    totalPrice: integer("total_price").default(0),
    subtotalPrice: integer("subtotal_price").default(0),
    currency: text("currency").default("USD"),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    sourceName: text("source_name"),
    landingSite: text("landing_site"),
    referringSite: text("referring_site"),
    processedAt: timestamp("processed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("order_shopify_id_idx").on(t.shopifyId),
    index("order_customer_id_idx").on(t.customerId),
    index("order_processed_at_idx").on(t.processedAt),
  ],
);

export const orderLineItem = pgTable(
  "order_line_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    title: text("title"),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    quantity: integer("quantity").default(1),
    price: integer("price").default(0),
  },
  (t) => [index("line_item_order_id_idx").on(t.orderId)],
);

export const utmAttribution = pgTable(
  "utm_attribution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    visitorId: text("visitor_id"),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    term: text("term"),
    content: text("content"),
    landingPage: text("landing_page"),
    referrer: text("referrer"),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("utm_visitor_id_idx").on(t.visitorId),
    index("utm_captured_at_idx").on(t.capturedAt),
  ],
);

export const campaign = pgTable("campaign", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  platform: text("platform"),
  externalId: text("external_id"),
  status: text("status").default("active"),
  startDate: timestamp("start_date", { mode: "date" }),
  endDate: timestamp("end_date", { mode: "date" }),
  budget: integer("budget"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const ga4Daily = pgTable(
  "ga4_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    sessions: integer("sessions").default(0),
    users: integer("users").default(0),
    newUsers: integer("new_users").default(0),
    pageviews: integer("pageviews").default(0),
    bounceRate: real("bounce_rate"),
    avgSessionDuration: real("avg_session_duration"),
    source: text("source"),
    medium: text("medium"),
  },
  (t) => [index("ga4_daily_date_idx").on(t.date)],
);

export const gscDaily = pgTable(
  "gsc_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    query: text("query"),
    page: text("page"),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    ctr: real("ctr"),
    position: real("position"),
  },
  (t) => [index("gsc_daily_date_idx").on(t.date)],
);

export const googleAdsDaily = pgTable(
  "google_ads_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    campaignName: text("campaign_name"),
    campaignId: text("campaign_id"),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    cost: integer("cost").default(0),
    conversions: real("conversions"),
    conversionValue: real("conversion_value"),
  },
  (t) => [index("google_ads_daily_date_idx").on(t.date)],
);

export const metaAdsDaily = pgTable(
  "meta_ads_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    campaignName: text("campaign_name"),
    campaignId: text("campaign_id"),
    adsetName: text("adset_name"),
    adsetId: text("adset_id"),
    adName: text("ad_name"),
    adId: text("ad_id"),
    platform: text("platform"),
    landingUrl: text("landing_url"),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    cost: integer("cost").default(0),
    conversions: real("conversions"),
    conversionValue: real("conversion_value"),
    reach: integer("reach").default(0),
    frequency: real("frequency"),
  },
  (t) => [index("meta_ads_daily_date_idx").on(t.date)],
);

export const posthogDaily = pgTable(
  "posthog_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    eventName: text("event_name"),
    count: integer("count").default(0),
    uniqueUsers: integer("unique_users").default(0),
  },
  (t) => [index("posthog_daily_date_idx").on(t.date)],
);

export const customerEvent = pgTable(
  "customer_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("customer_event_customer_id_idx").on(t.customerId),
    index("customer_event_occurred_at_idx").on(t.occurredAt),
  ],
);

// ─── Relations ──────────────────────────────────────────────────────

export const customerRelations = relations(customer, ({ many }) => ({
  orders: many(order),
  events: many(customerEvent),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  customer: one(customer, {
    fields: [order.customerId],
    references: [customer.id],
  }),
  lineItems: many(orderLineItem),
}));

export const orderLineItemRelations = relations(orderLineItem, ({ one }) => ({
  order: one(order, {
    fields: [orderLineItem.orderId],
    references: [order.id],
  }),
}));

export const customerEventRelations = relations(customerEvent, ({ one }) => ({
  customer: one(customer, {
    fields: [customerEvent.customerId],
    references: [customer.id],
  }),
}));
