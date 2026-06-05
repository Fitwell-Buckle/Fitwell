import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  real,
  date,
  index,
  uniqueIndex,
  primaryKey,
  check,
  pgSequence,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  // Set for users with role='supplier' so the supplier portal can scope queries
  // to their own POs (production module, Phase 3).
  supplierId: text("supplier_id"),
  // Set for users with role='company' so the B2B portal can scope to their
  // company + apply their price tier (Phase 7).
  companyId: text("company_id"),
  // NOTE: a future `influencer_id` column (for the influencer self-serve portal)
  // will be added in its own migration when that phase lands — intentionally not
  // here yet, so the running app never queries a column the DB doesn't have.
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
    // PostHog distinct_id observed at the customer's first pixel-linked
    // order. The DB column name stays as fw_distinct_id for historical
    // reasons (pre-rename); the actual column rename is queued for a
    // focused drizzle-kit interactive session.
    posthogDistinctId: text("fw_distinct_id"),
    // Optional link to a B2B company this person belongs to (a company's
    // "People" list = its leads + these customers). Manually associated in admin.
    // Annotated return type breaks the customer<->company circular inference.
    companyId: text("company_id").references((): AnyPgColumn => company.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_shopify_id_idx").on(t.shopifyId),
    index("customer_email_idx").on(t.email),
    index("customer_fw_distinct_id_idx").on(t.posthogDistinctId),
    index("customer_company_id_idx").on(t.companyId),
  ],
);

// Shopify customer addresses (multiple per customer). Populated by the customer
// sync — Shopify's customer payload returns `default_address` + an `addresses`
// array. Synced delete-and-replace on every customer upsert; Shopify is source
// of truth.
export const customerAddress = pgTable(
  "customer_address",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    // Shopify's address id — unique per customer.
    shopifyAddressId: text("shopify_address_id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    province: text("province"),
    provinceCode: text("province_code"),
    country: text("country"),
    countryCode: text("country_code"),
    zip: text("zip"),
    phone: text("phone"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("customer_address_customer_id_idx").on(t.customerId),
  ],
);

export const customerAddressRelations = relations(customerAddress, ({ one }) => ({
  customer: one(customer, {
    fields: [customerAddress.customerId],
    references: [customer.id],
  }),
}));

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
    // Money breakdown (cents) for reconciling with Shopify "Total sales":
    //   Total sales = total_price - total_refunded   (per non-cancelled order).
    // total_price already nets discounts and adds tax + shipping, so subtracting
    // refunds nets item/tax/shipping returns in one shot. The tax/discount/
    // shipping splits are stored for the Shopify-style columnar breakdown.
    totalTax: integer("total_tax").default(0),
    totalDiscounts: integer("total_discounts").default(0),
    totalShipping: integer("total_shipping").default(0),
    totalRefunded: integer("total_refunded").default(0),
    currency: text("currency").default("USD"),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    sourceName: text("source_name"),
    landingSite: text("landing_site"),
    referringSite: text("referring_site"),
    // PostHog distinct_id carried from the storefront snippet via the
    // _fw_distinct_id checkout note attribute. (DB column name kept as
    // fw_distinct_id; rename queued — see customer.posthogDistinctId.)
    posthogDistinctId: text("fw_distinct_id"),
    // How the order was linked to a pre-purchase touch:
    // 'self_report' (Grapevine survey response) | 'pixel' | 'email_match' | null
    linkMethod: text("link_method"),
    processedAt: timestamp("processed_at", { mode: "date" }),
    // Set when Shopify cancelled the order; null otherwise. Used to exclude
    // cancelled orders from "Total sales".
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("order_shopify_id_idx").on(t.shopifyId),
    index("order_customer_id_idx").on(t.customerId),
    index("order_processed_at_idx").on(t.processedAt),
    index("order_fw_distinct_id_idx").on(t.posthogDistinctId),
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
    gclid: text("gclid"),
    sessionId: text("session_id"),
    // PostHog distinct_id from the storefront snippet (first-touch identity).
    // DB column kept as fw_distinct_id; see customer.posthogDistinctId note.
    posthogDistinctId: text("fw_distinct_id"),
    // Set when this touch is linked to a purchase (attribution invariant §4)
    converted: boolean("converted").default(false),
    convertedAt: timestamp("converted_at", { mode: "date" }),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("utm_visitor_id_idx").on(t.visitorId),
    index("utm_captured_at_idx").on(t.capturedAt),
    index("utm_fw_distinct_id_idx").on(t.posthogDistinctId),
    uniqueIndex("utm_session_id_idx").on(t.sessionId),
  ],
);

// Self-reported attribution from post-purchase surveys (Grapevine today;
// multi-provider safe via `provider`). One row per (order, question) so the
// same survey can carry multiple questions without a schema change.
export const attributionSurveyResponse = pgTable(
  "attribution_survey_response",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull().default("grapevine"),
    // Idempotency key from the provider; lets Shopify Flow retry safely.
    providerResponseId: text("provider_response_id").notNull(),
    surveyCode: text("survey_code"),
    surveyName: text("survey_name"),
    // Surface the response came in on: 'checkout_app_block', 'pos_*', 'email', 'standalone'.
    surface: text("surface"),
    // Resolved FK into order. Nullable to handle the race where the survey
    // response arrives before the Shopify order webhook lands; a backfill pass
    // resolves it via shopifyOrderId.
    orderId: text("order_id").references(() => order.id),
    shopifyOrderId: text("shopify_order_id"),
    customerEmail: text("customer_email"),
    // Multi-question safe — defaults to the current single-question survey.
    questionKey: text("question_key").notNull(),
    // The chosen multiple-choice label as the provider sent it.
    rawAnswer: text("raw_answer"),
    // True when the respondent picked "Other" and provided free text.
    isOtherText: boolean("is_other_text").default(false),
    // Platform the customer self-reported (e.g. 'instagram', 'tiktok',
    // 'google_search'). Always set for platform-only answers where the
    // paid-vs-organic distinction can't be inferred from the survey alone.
    // The attribution engine (link_method='self_report') merges this with
    // utm_attribution + order.landing_site / referring_site to commit to a
    // specific funnel.md channel.
    platformHint: text("platform_hint"),
    // Canonical channel ID from specs/strategy/funnel.md — set only when the
    // survey answer commits to one channel (e.g. creator_partnerships,
    // press_editorial, in_person_sighting). Left NULL for ambiguous platform
    // answers (Meta, TikTok, Google) where paid-vs-organic requires UTM
    // context, and for unclassified "Other" free-text rows (Phase 4 normalizes).
    channelHint: text("channel_hint"),
    // Optional finer-grained detail (specific creator name, specific forum)
    // preserved alongside the coarser channelHint for per-creator rollups.
    channelDetail: text("channel_detail"),
    respondedAt: timestamp("responded_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("asr_provider_response_id_idx").on(
      t.provider,
      t.providerResponseId,
    ),
    index("asr_order_id_idx").on(t.orderId),
    index("asr_shopify_order_id_idx").on(t.shopifyOrderId),
    index("asr_channel_hint_idx").on(t.channelHint),
    index("asr_platform_hint_idx").on(t.platformHint),
    index("asr_responded_at_idx").on(t.respondedAt),
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
    adGroupName: text("ad_group_name"),
    adGroupId: text("ad_group_id"),
    adName: text("ad_name"),
    adId: text("ad_id"),
    platform: text("platform"),
    landingUrl: text("landing_url"),
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
    // Delivery diagnostics (Meta's analogue to "lost to rank")
    // Values: "above_average" | "average" | "below_average_*" | "unknown"
    qualityRanking: text("quality_ranking"),
    engagementRanking: text("engagement_ranking"),
    conversionRanking: text("conversion_ranking"),
  },
  (t) => [index("meta_ads_daily_date_idx").on(t.date)],
);

// Google Ads impression share metrics, queried FROM ad_group (not ad_group_ad).
// Stored as ratios in [0,1]; null when Google doesn't report (e.g. PMax, low volume).
export const googleAdsAdGroupDaily = pgTable(
  "google_ads_adgroup_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    adGroupId: text("ad_group_id"),
    adGroupName: text("ad_group_name"),
    platform: text("platform"),
    impressions: integer("impressions").default(0),
    // % of eligible impressions we got
    searchImpressionShare: real("search_impression_share"),
    // % missed because budget capped delivery
    searchBudgetLostIs: real("search_budget_lost_is"),
    // % missed because Ad Rank (bid × Quality Score) was too low
    searchRankLostIs: real("search_rank_lost_is"),
    // % of shown impressions that were at the very top
    searchAbsoluteTopIs: real("search_absolute_top_is"),
  },
  (t) => [
    index("google_ads_adgroup_daily_date_idx").on(t.date),
    index("google_ads_adgroup_daily_lookup_idx").on(t.campaignId, t.adGroupId),
  ],
);

// Slow-changing per-adset audience size estimate from Meta's /delivery_estimate.
// Snapshot-based: we keep the latest per adset and read it back at query time.
export const metaAdsetAudience = pgTable(
  "meta_adset_audience",
  {
    adsetId: text("adset_id").primaryKey(),
    adsetName: text("adset_name"),
    audienceLowerBound: integer("audience_lower_bound"),
    audienceUpperBound: integer("audience_upper_bound"),
    snapshotAt: timestamp("snapshot_at", { mode: "date" }).notNull(),
  },
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

// ─── Companies & price tiers (our own, not Shopify) ─────────────────

export const priceTier = pgTable("price_tier", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // Percentage off the Shopify retail price (e.g. 30 = 30% off).
  discountPercent: real("discount_percent").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export const company = pgTable(
  "company",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // Legacy free-text contact, kept as a fallback (invoicing/email read it) when
    // no person is attached. The displayed "Contact" now prefers an attached
    // person — see primaryContact* below + lib/crm/company-contact.ts.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    // The company's designated Primary Contact — one of its attached People
    // (a lead or a Shopify customer). Pointer (kind + id), no FK since it can
    // reference either table. Only meaningful when ≥2 people are attached; with
    // one person they're implicitly the contact.
    primaryContactKind: text("primary_contact_kind"),
    primaryContactId: text("primary_contact_id"),
    // Free-text postal address for this brand (shipping / invoicing). Multi-line.
    address: text("address"),
    // Optional link to a synced Shopify customer (the contact person).
    customerId: text("customer_id").references(() => customer.id),
    priceTierId: text("price_tier_id").references(() => priceTier.id),
    // Catalog restriction (B2B portal + order forms): Shopify collection ids and
    // product ids this brand may order from. Both empty/null = the whole catalog.
    assignedCollectionIds: text("assigned_collection_ids").array(),
    assignedProductIds: text("assigned_product_ids").array(),
    // Upfront deposit required from this brand, as a % of order value (0 = pay
    // in full). The remaining balance is billed when the order is fulfilled.
    depositPercent: real("deposit_percent").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("company_price_tier_id_idx").on(t.priceTierId),
    index("company_customer_id_idx").on(t.customerId),
  ],
);

// Allowlist of emails that may sign in to the B2B company portal (Phase 7).
export const companyContact = pgTable(
  "company_contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased; one company per email
    name: text("name"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("company_contact_email_idx").on(t.email),
    index("company_contact_company_id_idx").on(t.companyId),
  ],
);

export const priceTierRelations = relations(priceTier, ({ many }) => ({
  companies: many(company),
}));

export const companyRelations = relations(company, ({ one, many }) => ({
  priceTier: one(priceTier, {
    fields: [company.priceTierId],
    references: [priceTier.id],
  }),
  customer: one(customer, {
    fields: [company.customerId],
    references: [customer.id],
  }),
  contacts: many(companyContact),
}));

export const companyContactRelations = relations(companyContact, ({ one }) => ({
  company: one(company, {
    fields: [companyContact.companyId],
    references: [company.id],
  }),
}));

// ─── Production module ──────────────────────────────────────────────

// Fixed, ordered stage progression. Every line item passes through all
// stages in this order; "complete" is the terminal stage.
export const productionStage = pgEnum("production_stage", [
  "supplier_po",
  "stamping",
  "edm",
  "polishing",
  "logo",
  "plating",
  "qc",
  "packaging",
  "complete",
]);

// Auto-incrementing PO number source (this system owns PO numbering). First
// value is 100 → formatted "00100". Read via nextval() when creating a PO.
export const productionPoNumberSeq = pgSequence("production_po_number_seq", {
  startWith: 100,
});

export const supplier = pgTable("supplier", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  phone: text("phone"),
  // Free-text address we ship to this supplier (raw materials / handoffs).
  shippingAddress: text("shipping_address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// Authorized login emails for a supplier — anyone listed here can magic-link in
// (Phase 3) and is scoped to this supplier. Lets a whole vendor team have access.
export const supplierContact = pgTable(
  "supplier_contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased; one supplier per email
    name: text("name"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_contact_email_idx").on(t.email),
    index("supplier_contact_supplier_id_idx").on(t.supplierId),
  ],
);

export const productionPo = pgTable(
  "production_po",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id),
    // Auto-generated by this system (the source of truth) from
    // production_po_number_seq, zero-padded to 5 digits ("00100", "00101", …).
    // Also stamped onto the Shopify inventory adjustment reference on receipt.
    shopifyPoNumber: text("shopify_po_number").notNull(),
    issuedDate: date("issued_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    // When true the whole PO advances together; when false each line item
    // moves independently and the PO's displayed stage is "mixed".
    lockStagesTogether: boolean("lock_stages_together").notNull().default(true),
    status: text("status").notNull().default("active"), // active | on_hold | complete | cancelled
    // Set manually when the user confirms they marked the PO received in Shopify.
    shopifyReceivedAt: timestamp("shopify_received_at", { mode: "date" }),
    // When the PO was sent to the supplier. Emailing it auto-stamps this;
    // "Mark as sent" sets it manually (WhatsApp / phone / in person). null = not
    // sent. Per-row, so each sub-PO tracks its own send.
    sentAt: timestamp("sent_at", { mode: "date" }),
    sentVia: text("sent_via"), // 'email' | 'manual'
    // Multi-supplier split: a PO routed across several suppliers becomes a
    // "master" (parent_po_id null, has children); each supplier gets a sub-PO
    // (parent_po_id = master, po_suffix "A"/"B"…, supplier_id = that supplier,
    // no own line items — it renders the master's). Standalone PO: both null.
    parentPoId: text("parent_po_id"),
    poSuffix: text("po_suffix"),
    // What this supplier charges for their portion (sub-PO only; the only field
    // editable on a sub-PO — everything else lives on the master). Cents.
    supplierPriceCents: integer("supplier_price_cents"),
    // Default B2B company the batch is for (our own company list; line items can
    // override). Its price tier drives the discount off retail.
    companyId: text("company_id").references(() => company.id),
    // Default receiving warehouse (Shopify location, id + name snapshot).
    shopifyLocationId: text("shopify_location_id"),
    locationName: text("location_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("production_po_supplier_id_idx").on(t.supplierId),
    index("production_po_status_idx").on(t.status),
    index("production_po_company_id_idx").on(t.companyId),
    index("production_po_parent_po_id_idx").on(t.parentPoId),
  ],
);

export const productionPoLineItem = pgTable(
  "production_po_line_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    // Product identity: no FK yet — line items reference Shopify ids + a
    // denormalized snapshot until a product/variant table exists.
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    quantity: integer("quantity").notNull(),
    unitCostCents: integer("unit_cost_cents"),
    // Dynamic stage key (references production_stage_def.key). Text, not the
    // legacy enum, so stages can be added/removed at runtime.
    currentStage: text("current_stage").notNull().default("supplier_po"),
    expectedCompletionDate: date("expected_completion_date"),
    actualCompletionDate: date("actual_completion_date"),
    // C2 receiving: set when this line's quantity has been pushed to Shopify as
    // an inventory adjustment. Per-line so a retry never double-counts; the
    // PO-level shopify_received_at marks "all lines received".
    shopifyReceivedAt: timestamp("shopify_received_at", { mode: "date" }),
    // Optional customer earmark; if orderLineItemId is set, customer derives from it.
    customerId: text("customer_id").references(() => customer.id),
    orderLineItemId: text("order_line_item_id").references(
      () => orderLineItem.id,
    ),
    // Optional overrides of the PO-level company / warehouse for this line.
    companyId: text("company_id").references(() => company.id),
    shopifyLocationId: text("shopify_location_id"),
    locationName: text("location_name"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("production_li_po_id_idx").on(t.poId),
    index("production_li_customer_id_idx").on(t.customerId),
    index("production_li_order_line_item_id_idx").on(t.orderLineItemId),
    index("production_li_current_stage_idx").on(t.currentStage),
    index("production_li_company_id_idx").on(t.companyId),
  ],
);

export const productionStageEvent = pgTable(
  "production_stage_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lineItemId: text("line_item_id")
      .notNull()
      .references(() => productionPoLineItem.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    enteredAt: timestamp("entered_at", { mode: "date" }).notNull().defaultNow(),
    exitedAt: timestamp("exited_at", { mode: "date" }),
    triggeredByUserId: text("triggered_by_user_id").references(() => user.id),
    notes: text("notes"),
  },
  (t) => [index("production_stage_event_line_item_id_idx").on(t.lineItemId)],
);

// Polymorphic attachment — exactly one of poId or lineItemId is set (CHECK).
export const productionAttachment = pgTable(
  "production_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id").references(() => productionPo.id, {
      onDelete: "cascade",
    }),
    lineItemId: text("line_item_id").references(
      () => productionPoLineItem.id,
      { onDelete: "cascade" },
    ),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("production_attachment_po_id_idx").on(t.poId),
    index("production_attachment_line_item_id_idx").on(t.lineItemId),
    check(
      "production_attachment_one_parent",
      sql`(${t.poId} is null) <> (${t.lineItemId} is null)`,
    ),
  ],
);

// Polymorphic comment — exactly one of poId or lineItemId is set (CHECK).
export const productionComment = pgTable(
  "production_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id").references(() => productionPo.id, {
      onDelete: "cascade",
    }),
    lineItemId: text("line_item_id").references(
      () => productionPoLineItem.id,
      { onDelete: "cascade" },
    ),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("production_comment_po_id_idx").on(t.poId),
    index("production_comment_line_item_id_idx").on(t.lineItemId),
    check(
      "production_comment_one_parent",
      sql`(${t.poId} is null) <> (${t.lineItemId} is null)`,
    ),
  ],
);

// ─── Relations ──────────────────────────────────────────────────────

export const customerRelations = relations(customer, ({ many }) => ({
  orders: many(order),
  events: many(customerEvent),
  addresses: many(customerAddress),
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

export const attributionSurveyResponseRelations = relations(
  attributionSurveyResponse,
  ({ one }) => ({
    order: one(order, {
      fields: [attributionSurveyResponse.orderId],
      references: [order.id],
    }),
  }),
);

export const customerEventRelations = relations(customerEvent, ({ one }) => ({
  customer: one(customer, {
    fields: [customerEvent.customerId],
    references: [customer.id],
  }),
}));

export const supplierRelations = relations(supplier, ({ many }) => ({
  pos: many(productionPo),
  contacts: many(supplierContact),
}));

export const supplierContactRelations = relations(supplierContact, ({ one }) => ({
  supplier: one(supplier, {
    fields: [supplierContact.supplierId],
    references: [supplier.id],
  }),
}));

// Per-PO stage ownership: which supplier is responsible for each production
// stage. A stage with no row defaults to the PO's primary supplier — so an
// existing PO behaves unchanged. Lets different vendors own different steps
// (e.g. one supplier stamps, another finishes).
export const productionStageAssignment = pgTable(
  "production_stage_assignment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("stage_assignment_po_stage_idx").on(t.poId, t.stage),
    index("stage_assignment_supplier_idx").on(t.supplierId),
  ],
);

// Per-supplier, per-line-item production cost on a multi-supplier PO. Keyed by
// the MASTER po + the supplier (not the sub-PO id) so it survives sub-PO regen
// on edit. Each supplier prices the line items they touch (a stamping supplier's
// raw-blank price is written per covered SKU — same per-piece cost on each). The
// master rolls these up: sum of suppliers' unit costs per line × qty = line cost.
export const productionSupplierLineCost = pgTable(
  "production_supplier_line_cost",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // The master PO these costs roll up onto.
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    lineItemId: text("line_item_id")
      .notNull()
      .references(() => productionPoLineItem.id, { onDelete: "cascade" }),
    // Per-unit (per-piece) production cost this supplier charges for this line.
    unitCostCents: integer("unit_cost_cents"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_line_cost_po_supplier_line_idx").on(
      t.poId,
      t.supplierId,
      t.lineItemId,
    ),
    index("supplier_line_cost_po_idx").on(t.poId),
  ],
);

// In-app admin notifications (e.g. a supplier handed off a stage). Unread =
// read_at is null.
export const adminNotification = pgTable(
  "admin_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    poId: text("po_id").references(() => productionPo.id, { onDelete: "cascade" }),
    // Optional deep-link target for lead-related alerts (e.g. drafted follow-up).
    leadId: text("lead_id"),
    lineItemId: text("line_item_id"),
    supplierId: text("supplier_id"),
    // Optional deep-link target for the in-app inbox "Open" button (e.g. a
    // customer-message alert links to /customers). Generic so any notification
    // type can point somewhere without a dedicated FK column.
    href: text("href"),
    // Which team inbox this notification relates to (for email-derived alerts
    // — customer messages, lead replies). Lets the inbox color-code + filter by
    // mailbox like the messaging views. Null for non-email notifications.
    mailboxLabel: text("mailbox_label"),
    mailboxEmail: text("mailbox_email"),
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("admin_notification_read_at_idx").on(t.readAt)],
);

export const productionPoRelations = relations(productionPo, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [productionPo.supplierId],
    references: [supplier.id],
  }),
  company: one(company, {
    fields: [productionPo.companyId],
    references: [company.id],
  }),
  lineItems: many(productionPoLineItem),
  comments: many(productionComment),
  attachments: many(productionAttachment),
  stageAssignments: many(productionStageAssignment),
}));

export const productionStageAssignmentRelations = relations(
  productionStageAssignment,
  ({ one }) => ({
    po: one(productionPo, {
      fields: [productionStageAssignment.poId],
      references: [productionPo.id],
    }),
    supplier: one(supplier, {
      fields: [productionStageAssignment.supplierId],
      references: [supplier.id],
    }),
  }),
);

export const productionPoLineItemRelations = relations(
  productionPoLineItem,
  ({ one, many }) => ({
    po: one(productionPo, {
      fields: [productionPoLineItem.poId],
      references: [productionPo.id],
    }),
    customer: one(customer, {
      fields: [productionPoLineItem.customerId],
      references: [customer.id],
    }),
    orderLineItem: one(orderLineItem, {
      fields: [productionPoLineItem.orderLineItemId],
      references: [orderLineItem.id],
    }),
    company: one(company, {
      fields: [productionPoLineItem.companyId],
      references: [company.id],
    }),
    stageEvents: many(productionStageEvent),
    comments: many(productionComment),
    attachments: many(productionAttachment),
  }),
);

export const productionStageEventRelations = relations(
  productionStageEvent,
  ({ one }) => ({
    lineItem: one(productionPoLineItem, {
      fields: [productionStageEvent.lineItemId],
      references: [productionPoLineItem.id],
    }),
  }),
);

export const productionCommentRelations = relations(
  productionComment,
  ({ one }) => ({
    po: one(productionPo, {
      fields: [productionComment.poId],
      references: [productionPo.id],
    }),
    lineItem: one(productionPoLineItem, {
      fields: [productionComment.lineItemId],
      references: [productionPoLineItem.id],
    }),
    author: one(user, {
      fields: [productionComment.authorUserId],
      references: [user.id],
    }),
  }),
);

export const productionAttachmentRelations = relations(
  productionAttachment,
  ({ one }) => ({
    po: one(productionPo, {
      fields: [productionAttachment.poId],
      references: [productionPo.id],
    }),
    lineItem: one(productionPoLineItem, {
      fields: [productionAttachment.lineItemId],
      references: [productionPoLineItem.id],
    }),
    uploadedBy: one(user, {
      fields: [productionAttachment.uploadedByUserId],
      references: [user.id],
    }),
  }),
);

// ─── B2B Invoicing (Phase 6) ────────────────────────────────────────

// Auto-incrementing invoice number source (formatted "INV-00100").
export const invoiceNumberSeq = pgSequence("invoice_number_seq", {
  startWith: 100,
});

export const invoice = pgTable(
  "invoice",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Auto-generated from invoice_number_seq, e.g. "INV-00100".
    invoiceNumber: text("invoice_number").notNull(),
    // Bill-to company (our B2B customer).
    companyId: text("company_id")
      .notNull()
      .references(() => company.id),
    status: text("status").notNull().default("draft"), // draft | sent | paid | void
    issuedDate: date("issued_date").notNull(),
    dueDate: date("due_date"),
    notes: text("notes"),
    // Money in cents. subtotal = Σ(qty × unit retail); discount from the
    // company's price-tier snapshot; total = subtotal − discount.
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountPercent: real("discount_percent"),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    // Provenance + hybrid links.
    sourcePoId: text("source_po_id").references(() => productionPo.id, {
      onDelete: "set null",
    }),
    // The "primary" draft order = the deposit (when depositPercent > 0) or the
    // full amount (when 0).
    shopifyDraftOrderId: text("shopify_draft_order_id"),
    shopifyInvoiceUrl: text("shopify_invoice_url"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    // Deposit billing (snapshot of the brand's deposit_percent at order time).
    // null/0 = single full payment. deposit_cents is billed up front; the
    // balance (total − deposit) is billed via a second draft order at fulfillment.
    depositPercent: real("deposit_percent"),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaidAt: timestamp("deposit_paid_at", { mode: "date" }),
    shopifyBalanceDraftOrderId: text("shopify_balance_draft_order_id"),
    shopifyBalanceInvoiceUrl: text("shopify_balance_invoice_url"),
    balancePaidAt: timestamp("balance_paid_at", { mode: "date" }),
    // Set when the order is marked fulfilled — this is what generates + sends
    // the balance draft order.
    fulfilledAt: timestamp("fulfilled_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("invoice_company_id_idx").on(t.companyId),
    index("invoice_status_idx").on(t.status),
    index("invoice_source_po_id_idx").on(t.sourcePoId),
  ],
);

export const invoiceLineItem = pgTable(
  "invoice_line_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    quantity: integer("quantity").notNull(),
    // Retail unit price (pre-discount); the invoice-level tier % applies.
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    // Optional provenance back to the production line it was billed from.
    sourceLineItemId: text("source_line_item_id").references(
      () => productionPoLineItem.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("invoice_line_item_invoice_id_idx").on(t.invoiceId)],
);

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  company: one(company, {
    fields: [invoice.companyId],
    references: [company.id],
  }),
  sourcePo: one(productionPo, {
    fields: [invoice.sourcePoId],
    references: [productionPo.id],
  }),
  lineItems: many(invoiceLineItem),
  attachments: many(invoiceAttachment),
}));

export const invoiceLineItemRelations = relations(invoiceLineItem, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceLineItem.invoiceId],
    references: [invoice.id],
  }),
}));

// Customer-supplied documents attached to an invoice (e.g. the customer's own
// PDF purchase order). Stored in Vercel Blob; the row keeps the metadata.
export const invoiceAttachment = pgTable(
  "invoice_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("invoice_attachment_invoice_id_idx").on(t.invoiceId)],
);

export const invoiceAttachmentRelations = relations(invoiceAttachment, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceAttachment.invoiceId],
    references: [invoice.id],
  }),
}));

// ─── Influencer Tracking ────────────────────────────────────────────

// Auto-incrementing influencer gifting-order number source (formatted
// "GIFT-00100"). Separate from the B2B invoice sequence.
export const influencerOrderNumberSeq = pgSequence("influencer_order_number_seq", {
  startWith: 100,
});

// An influencer/creator we gift product to in exchange for content. Orders are
// gifting (100% off) and carry an affiliate link per order. They may only order
// from the Shopify collections assigned here (enforced in the future portal).
export const influencer = pgTable(
  "influencer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // Social handle (e.g. "@maker.minute") + the platform it's on.
    handle: text("handle"),
    platform: text("platform"), // instagram | tiktok | youtube | ...
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    // Optional link to a synced Shopify customer (the gifting recipient).
    customerId: text("customer_id").references(() => customer.id),
    // Shopify collection ids this influencer may order from. Empty = all.
    assignedCollectionIds: text("assigned_collection_ids").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("influencer_customer_id_idx").on(t.customerId)],
);

// Allowlist of emails that may sign in to the influencer self-serve portal
// (next phase). Mirrors company_contact / supplier_contact.
export const influencerContact = pgTable(
  "influencer_contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    influencerId: text("influencer_id")
      .notNull()
      .references(() => influencer.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased; one influencer per email
    name: text("name"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("influencer_contact_email_idx").on(t.email),
    index("influencer_contact_influencer_id_idx").on(t.influencerId),
  ],
);

// A gifting order placed for an influencer. Pushed to Shopify as a draft order
// at 100% off. Content-deadline tracking: contentDueDate is when their content
// must publish; publishedAt is set when it goes live. The Tracking page derives
// approaching / missed / hit from these.
export const influencerOrder = pgTable(
  "influencer_order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Auto-generated from influencer_order_number_seq, e.g. "GIFT-00100".
    orderNumber: text("order_number").notNull(),
    influencerId: text("influencer_id")
      .notNull()
      .references(() => influencer.id),
    status: text("status").notNull().default("draft"), // draft | sent | cancelled
    issuedDate: date("issued_date").notNull(),
    // When the influencer's content is due to be published (the deadline).
    contentDueDate: date("content_due_date"),
    // Set when the content actually goes live (deadline "hit").
    publishedAt: date("published_at"),
    // The affiliate/tracking link for this order's content.
    affiliateLink: text("affiliate_link"),
    notes: text("notes"),
    // Money in cents. Gifting => discountPercent 100, totalCents 0; subtotal is
    // the retail gift value (kept for reporting).
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountPercent: real("discount_percent"),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    shopifyDraftOrderId: text("shopify_draft_order_id"),
    shopifyInvoiceUrl: text("shopify_invoice_url"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("influencer_order_influencer_id_idx").on(t.influencerId),
    index("influencer_order_status_idx").on(t.status),
    index("influencer_order_content_due_date_idx").on(t.contentDueDate),
  ],
);

export const influencerOrderLineItem = pgTable(
  "influencer_order_line_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => influencerOrder.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    quantity: integer("quantity").notNull(),
    // Retail unit price (the gift value); the order-level 100% discount applies.
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("influencer_order_line_item_order_id_idx").on(t.orderId)],
);

export const influencerRelations = relations(influencer, ({ one, many }) => ({
  customer: one(customer, {
    fields: [influencer.customerId],
    references: [customer.id],
  }),
  contacts: many(influencerContact),
  orders: many(influencerOrder),
}));

export const influencerContactRelations = relations(
  influencerContact,
  ({ one }) => ({
    influencer: one(influencer, {
      fields: [influencerContact.influencerId],
      references: [influencer.id],
    }),
  }),
);

export const influencerOrderRelations = relations(
  influencerOrder,
  ({ one, many }) => ({
    influencer: one(influencer, {
      fields: [influencerOrder.influencerId],
      references: [influencer.id],
    }),
    lineItems: many(influencerOrderLineItem),
  }),
);

export const influencerOrderLineItemRelations = relations(
  influencerOrderLineItem,
  ({ one }) => ({
    order: one(influencerOrder, {
      fields: [influencerOrderLineItem.orderId],
      references: [influencerOrder.id],
    }),
  }),
);

// Single-row remittance / bank-wire details shown on invoices (id is always
// "default"). Editable in admin Settings.
export const billingSettings = pgTable("billing_settings", {
  id: text("id").primaryKey().default("default"),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  routingNumber: text("routing_number"),
  swiftBic: text("swift_bic"),
  iban: text("iban"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// Lead follow-up automation settings (single row, id="default"). Two rules,
// edited in admin Settings:
//   - initial_draft_enabled: auto-draft an initial follow-up when a new lead is
//     captured (the lead-create flow).
//   - enabled + nudge_after_days: the sent-followups cron — when an email you
//     sent (to any contact) goes N days with no reply, draft a threaded
//     follow-up. NOTE: still a single global rule per kind for now — a general,
//     AI-assisted multi-rule engine is planned (see
//     specs/work-plans/todo/lead-followup-rule-engine.md).
export const leadFollowupSettings = pgTable("lead_followup_settings", {
  id: text("id").primaryKey().default("default"),
  // Rule 2 — unanswered-email follow-up (the sent-followups cron).
  enabled: boolean("enabled").notNull().default(true),
  nudgeAfterDays: integer("nudge_after_days").notNull().default(14),
  // Rule 1 — auto-draft an initial follow-up email on new-lead capture.
  initialDraftEnabled: boolean("initial_draft_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// The production pipeline's stages — now data-driven (add / rename / delete /
// reorder). `key` is the stable identifier stored on line items / events /
// assignments; `position` defines pipeline order (0 = opening, highest =
// terminal/receive); `active=false` is a soft delete that keeps history intact.
export const productionStageDef = pgTable("production_stage_def", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// ─── CRM (leads) ────────────────────────────────────────────────────
//
// Stages, source channels, persona tags, and statuses are kept as `text`
// (validated at the API layer) rather than pgEnum so spec changes in
// specs/strategy/b2b-pipeline.md don't require a migration each time.

export const lead = pgTable(
  "lead",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    capturedAt: timestamp("captured_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    capturedByUserId: text("captured_by_user_id").references(() => user.id),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    // Free-text until/unless promoted to a real `company` row via companyId.
    companyName: text("company_name"),
    // Mailing address. All free-text (no state/country enum) so foreign /
    // international formats fit. Auto-filled from the card OCR when present,
    // editable on the lead. `region` = state / province / region.
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    // 'prospect' | 'lead' | 'sample' | 'pilot_order' | 'recurring_order' |
    // 'partnership'. Default 'prospect' per b2b-pipeline.md anti-pattern:
    // a booth scan alone isn't a `lead` until a named decision-maker is
    // captured and they engage post-show.
    stage: text("stage").notNull().default("prospect"),
    // Coarse buyer type: watch_oem | strap_oem | retailer | distributor.
    personaTag: text("persona_tag"),
    // One of the 7 B2B entry channels from specs/strategy/b2b-pipeline.md.
    sourceChannel: text("source_channel").notNull(),
    // The date we actually met this person (editable; defaults to today in
    // the capture/create form). Distinct from capturedAt (row-creation time).
    meetingDate: date("meeting_date"),
    // Set when the lead emails us back (detected from the owner's Gmail, or
    // marked manually). Stops the two-week follow-up nudge cron.
    repliedAt: timestamp("replied_at", { mode: "date" }),
    // When the user last viewed this lead's Replies tab — a reply newer than
    // this counts as "new" (drives the Replies tab's blue dot).
    repliesSeenAt: timestamp("replies_seen_at", { mode: "date" }),
    // When the reply-detection cron last raised a "lead replied" notification.
    // A reply newer than this triggers a fresh notification (dedup guard).
    repliesNotifiedAt: timestamp("replies_notified_at", { mode: "date" }),
    // Gmail message ids of replies the user dismissed from the Replies tab, so
    // they stop showing. The emails live in Gmail — we only store which ids
    // were hidden.
    dismissedReplyIds: text("dismissed_reply_ids").array(),
    ownerUserId: text("owner_user_id").references(() => user.id),
    notes: text("notes"),
    cardImageUrl: text("card_image_url"),
    // Claude's raw read of the card — kept so a desktop fixer can recover
    // anything the structured extraction missed.
    cardRawText: text("card_raw_text"),
    // { firstName: 0..1, email: 0..1, ... } from the vision model.
    ocrConfidence: jsonb("ocr_confidence"),
    // Set when the lead is promoted to a B2B brand record.
    companyId: text("company_id").references(() => company.id),
    // Populated *only* when a real Shopify order lands and a `customer` row
    // materializes via the existing sync — never written by lead conversion
    // (would otherwise pollute the Shopify-synced table with shopify_id=null
    // rows). See specs/work-plans/todo/crm-leads.md decision 3.
    customerId: text("customer_id").references(() => customer.id),
    // 'active' | 'converted' | 'dropped' (soft-delete uses 'dropped').
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_email_idx").on(t.email),
    index("lead_stage_idx").on(t.stage),
    index("lead_source_channel_idx").on(t.sourceChannel),
    index("lead_status_idx").on(t.status),
    index("lead_owner_user_id_idx").on(t.ownerUserId),
    index("lead_company_id_idx").on(t.companyId),
    index("lead_customer_id_idx").on(t.customerId),
    index("lead_captured_at_idx").on(t.capturedAt),
  ],
);

// History of every business-card image scanned for a lead. The lead's
// `cardImageUrl` mirrors the most recent row's blobUrl for convenience.
// Multi-row so re-captures (new card, follow-up scan) don't overwrite.
export const leadCardImage = pgTable(
  "lead_card_image",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lead_card_image_lead_id_idx").on(t.leadId),
    index("lead_card_image_uploaded_at_idx").on(t.uploadedAt),
  ],
);

export const leadCardImageRelations = relations(leadCardImage, ({ one }) => ({
  lead: one(lead, {
    fields: [leadCardImage.leadId],
    references: [lead.id],
  }),
  uploadedBy: one(user, {
    fields: [leadCardImage.uploadedByUserId],
    references: [user.id],
  }),
}));

// Free-text notes a team member adds to a lead over time. Distinct from
// `lead.notes` (the single capture-time scratch field): these are timestamped,
// attributed timeline entries that show up in the lead's History tab alongside
// drafted/sent follow-up emails.
export const leadComment = pgTable(
  "lead_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_comment_lead_id_idx").on(t.leadId),
    index("lead_comment_created_at_idx").on(t.createdAt),
  ],
);

export const leadCommentRelations = relations(leadComment, ({ one }) => ({
  lead: one(lead, {
    fields: [leadComment.leadId],
    references: [lead.id],
  }),
  author: one(user, {
    fields: [leadComment.authorUserId],
    references: [user.id],
  }),
}));

// Inbound (and sent) WhatsApp messages via the Meta Cloud API webhook, matched
// to a stored lead/customer by phone number. Mirrors customer_message but for
// the WhatsApp channel (keyed by phone, no Gmail thread). One row per WA
// message id (dedup); `dismissed_at` hides it.
export const whatsappMessage = pgTable(
  "whatsapp_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    waMessageId: text("wa_message_id").notNull().unique(),
    // 'inbound' (from a contact) | 'outbound' (we sent it).
    direction: text("direction").notNull().default("inbound"),
    fromPhone: text("from_phone").notNull(),
    toPhone: text("to_phone"),
    contactName: text("contact_name"),
    body: text("body"),
    receivedAt: timestamp("received_at", { mode: "date" }),
    leadId: text("lead_id").references(() => lead.id),
    customerId: text("customer_id").references(() => customer.id),
    supplierId: text("supplier_id").references(() => supplier.id),
    dismissedAt: timestamp("dismissed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("whatsapp_message_lead_id_idx").on(t.leadId),
    index("whatsapp_message_customer_id_idx").on(t.customerId),
    index("whatsapp_message_supplier_id_idx").on(t.supplierId),
    index("whatsapp_message_received_at_idx").on(t.receivedAt),
    index("whatsapp_message_dismissed_at_idx").on(t.dismissedAt),
  ],
);

// Inbound emails from existing customers (matched to a stored customer/company
// by sender email) detected across the team's connected Gmail inboxes. Surfaced
// at the top of the Customers B2B/Consumer tabs. One row per Gmail message
// (dedup on gmail_message_id); `dismissed_at` hides it once handled.
export const customerMessage = pgTable(
  "customer_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    threadId: text("thread_id"),
    // Which connected inbox the message was found in.
    mailboxUserId: text("mailbox_user_id").references(() => user.id),
    mailboxLabel: text("mailbox_label"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { mode: "date" }),
    // 'b2b' (company contact) | 'consumer' (customer row) | 'supplier'
    // (supplier contact) | 'influencer' (influencer contact). Drives which
    // tab/list the message surfaces on.
    audience: text("audience").notNull(),
    customerId: text("customer_id").references(() => customer.id),
    companyId: text("company_id").references(() => company.id),
    supplierId: text("supplier_id").references(() => supplier.id),
    influencerId: text("influencer_id").references(() => influencer.id),
    dismissedAt: timestamp("dismissed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("customer_message_audience_idx").on(t.audience),
    index("customer_message_dismissed_at_idx").on(t.dismissedAt),
    index("customer_message_received_at_idx").on(t.receivedAt),
    index("customer_message_customer_id_idx").on(t.customerId),
    index("customer_message_company_id_idx").on(t.companyId),
    index("customer_message_supplier_id_idx").on(t.supplierId),
    index("customer_message_influencer_id_idx").on(t.influencerId),
  ],
);

// Drafted follow-up emails awaiting human review/send. Auto-generated from a
// lead's notes when the lead is created (the "Next Steps" queue).
// status: 'draft' (in queue) | 'scheduled' (auto-send at scheduled_at) | 'sent'
// | 'dismissed'.
export const outboundMessage = pgTable(
  "outbound_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // The recipient — exactly one of these is set. lead_id is nullable now that
    // follow-ups can target a customer or supplier too (Next Steps is no longer
    // lead-only). All cascade so the draft goes when the contact is deleted.
    leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "cascade",
    }),
    supplierId: text("supplier_id").references(() => supplier.id, {
      onDelete: "cascade",
    }),
    channel: text("channel").notNull().default("email"),
    // 1 = initial follow-up (drafted at capture); 2 = two-week nudge when the
    // contact hasn't replied. Lets the nudge cron find leads without a step-2 yet.
    sequenceStep: integer("sequence_step").notNull().default(1),
    toEmail: text("to_email"),
    // Optional Cc / Bcc recipients — comma-separated email lists, added by the
    // rep when reviewing an AI draft / follow-up. Surfaced as Cc:/Bcc: headers
    // on the Gmail send.
    cc: text("cc"),
    bcc: text("bcc"),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status").notNull().default("draft"),
    // For a threaded follow-up: the Gmail thread to reply into + the original
    // message's RFC822 Message-ID (In-Reply-To/References), so the send lands in
    // the same thread with the original right there.
    threadId: text("thread_id"),
    inReplyTo: text("in_reply_to"),
    // Which model drafted it (audit / future re-draft), e.g. claude-sonnet-4-5.
    generatedByModel: text("generated_by_model"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    // Open tracking: a unique token embedded as an invisible 1×1 pixel in the
    // sent email's HTML part. The public /api/track/open/[token] route bumps
    // open_count + first/last when the recipient's client loads the pixel.
    // Opens are APPROXIMATE — proxies (Apple Mail Privacy Protection) pre-load
    // pixels → false opens; image-blockers / text-only clients → missed opens.
    trackToken: text("track_token").$defaultFn(() => crypto.randomUUID()),
    openCount: integer("open_count").notNull().default(0),
    firstOpenedAt: timestamp("first_opened_at", { mode: "date" }),
    lastOpenedAt: timestamp("last_opened_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { mode: "date" }),
    // When status='scheduled': the send-scheduled cron sends it once this time
    // passes, via createdByUserId's Gmail.
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  },
  (t) => [
    index("outbound_message_lead_id_idx").on(t.leadId),
    index("outbound_message_customer_id_idx").on(t.customerId),
    index("outbound_message_supplier_id_idx").on(t.supplierId),
    index("outbound_message_status_idx").on(t.status),
    index("outbound_message_created_at_idx").on(t.createdAt),
    index("outbound_message_scheduled_at_idx").on(t.scheduledAt),
    uniqueIndex("outbound_message_track_token_idx").on(t.trackToken),
  ],
);

// Tracks emails WE sent (scanned from connected admins' Gmail Sent folders) to a
// known lead/customer/supplier, so the sent-followups cron can surface a
// threaded follow-up into Next Steps when there's no reply after the configured
// wait. Dedup on the Gmail message id. Mirrors customer_message but for the
// outbound direction.
export const sentEmail = pgTable(
  "sent_email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    threadId: text("thread_id"),
    // RFC822 Message-ID header of the sent message (for In-Reply-To when we
    // draft the threaded follow-up).
    messageIdHeader: text("message_id_header"),
    mailboxUserId: text("mailbox_user_id").references(() => user.id),
    fromEmail: text("from_email"),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "cascade",
    }),
    supplierId: text("supplier_id").references(() => supplier.id, {
      onDelete: "cascade",
    }),
    // Set when a reply from the contact is detected (stops the follow-up).
    repliedAt: timestamp("replied_at", { mode: "date" }),
    // Set when we've queued a follow-up for this sent message (dedup — one
    // follow-up per original).
    followupQueuedAt: timestamp("followup_queued_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sent_email_gmail_message_id_idx").on(t.gmailMessageId),
    index("sent_email_sent_at_idx").on(t.sentAt),
    index("sent_email_lead_id_idx").on(t.leadId),
    index("sent_email_customer_id_idx").on(t.customerId),
    index("sent_email_supplier_id_idx").on(t.supplierId),
  ],
);

export const outboundMessageRelations = relations(
  outboundMessage,
  ({ one }) => ({
    lead: one(lead, {
      fields: [outboundMessage.leadId],
      references: [lead.id],
    }),
  }),
);

export const leadRelations = relations(lead, ({ one }) => ({
  capturedBy: one(user, {
    fields: [lead.capturedByUserId],
    references: [user.id],
    relationName: "leadCapturedBy",
  }),
  owner: one(user, {
    fields: [lead.ownerUserId],
    references: [user.id],
    relationName: "leadOwner",
  }),
  company: one(company, {
    fields: [lead.companyId],
    references: [company.id],
  }),
  customer: one(customer, {
    fields: [lead.customerId],
    references: [customer.id],
  }),
}));

// ─── Klaviyo email/SMS analytics ────────────────────────────────────
// Populated by /api/cron/extract-klaviyo. See specs/work-plans/todo/
// klaviyo-integration.md (Phase 0). Read-side measurement that
// replaces the UTM-heuristic split in scripts/klaviyo-acquisition-
// vs-retention.ts.

// Daily snapshot of newsletter list size + new/unsub events. Unique on
// (date, list_id) so each day has at most one row per tracked list.
export const klaviyoListGrowthDaily = pgTable(
  "klaviyo_list_growth_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: timestamp("date", { mode: "date" }).notNull(),
    listId: text("list_id").notNull(),
    listName: text("list_name"),
    subscribers: integer("subscribers"),
    newSubscribers: integer("new_subscribers").default(0),
    unsubscribes: integer("unsubscribes").default(0),
  },
  (t) => [
    index("klaviyo_list_growth_daily_date_idx").on(t.date),
    uniqueIndex("klaviyo_list_growth_daily_date_list_uniq").on(
      t.date,
      t.listId,
    ),
  ],
);

// One row per campaign. Cumulative engagement totals (opens/clicks/etc
// keep accruing for weeks after send), so the cron upserts on
// campaign_id rather than appending a time series.
export const klaviyoEmailPerformance = pgTable(
  "klaviyo_email_performance",
  {
    campaignId: text("campaign_id").primaryKey(),
    campaignName: text("campaign_name"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    sends: integer("sends").default(0),
    opens: integer("opens").default(0),
    clicks: integer("clicks").default(0),
    conversions: integer("conversions").default(0),
    revenueCents: integer("revenue_cents").default(0),
    capturedAt: timestamp("captured_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("klaviyo_email_performance_sent_at_idx").on(t.sentAt)],
);

// Flow attribution. Phase 0 populates AGGREGATE rows (one per flow at
// each sync, customer_id/order_id NULL) from /api/flow-values-reports
// so the dashboard can show flow-level totals immediately. Per-order
// grain (rows with customer_id + order_id populated, sourced from the
// "Placed Order" event stream with $flow attribution) is a Phase 0.5
// follow-up — the schema is shaped for it now to avoid a rewrite.
export const klaviyoFlowAttribution = pgTable(
  "klaviyo_flow_attribution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    flowId: text("flow_id").notNull(),
    flowName: text("flow_name"),
    customerId: text("customer_id").references(() => customer.id, {
      onDelete: "set null",
    }),
    orderId: text("order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    attributedRevenueCents: integer("attributed_revenue_cents").default(0),
    attributedOrderCount: integer("attributed_order_count").default(0),
    touchedAt: timestamp("touched_at", { mode: "date" }).notNull(),
  },
  (t) => [
    index("klaviyo_flow_attribution_flow_id_idx").on(t.flowId),
    index("klaviyo_flow_attribution_touched_at_idx").on(t.touchedAt),
  ],
);

// ─── Reviews (Judge.me + future sources) ───────────────────────────
// Populated by /api/cron/extract-judgeme. One row per source review;
// upsert on judgeme_id (or generic external_id when a different source
// arrives). `reviewer_email` is the join key to `customer.email` for
// the advocate-stage detection in /funnel/strategy retention loop and
// for the personas.md Outfitter-reviewers cross-reference.
export const review = pgTable(
  "review",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Source identifier (Judge.me's own review id, etc.). Unique per
    // source so upserts can dedupe; the same email may have multiple
    // reviews and that's fine.
    externalId: text("external_id").notNull(),
    // 'judgeme' for now; the column exists so a future Stamped /
    // Yotpo / Loox source can land in the same table.
    source: text("source").notNull().default("judgeme"),
    reviewerEmail: text("reviewer_email"),
    reviewerName: text("reviewer_name"),
    rating: integer("rating"),
    title: text("title"),
    body: text("body"),
    verified: boolean("verified").default(false),
    productId: text("product_id"),
    productHandle: text("product_handle"),
    location: text("location"),
    reviewDate: timestamp("review_date", { mode: "date" }),
    capturedAt: timestamp("captured_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_source_external_id_uniq").on(t.source, t.externalId),
    index("review_reviewer_email_idx").on(t.reviewerEmail),
    index("review_rating_idx").on(t.rating),
    index("review_review_date_idx").on(t.reviewDate),
  ],
);
