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
    // True when this order is a B2B sample shipment (a $0, sample-tagged
    // Shopify order). Set from the Shopify `sample` order tag during sync —
    // the tag is authoritative, so re-tagging in Shopify Admin flows back
    // either way. MUST be excluded from all revenue/attribution queries; see
    // specs/work-plans/todo/b2b-samples-system.md.
    isSample: boolean("is_sample").notNull().default(false),
    // The B2B lead this sample was shipped to (sample orders only; null for
    // ordinary synced orders). Lets the lead detail show "samples shipped"
    // and ties a sample to its pipeline record. Written once at sample-
    // creation time; the Shopify sync upsert must NOT overwrite it.
    leadId: text("lead_id").references(() => lead.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("order_shopify_id_idx").on(t.shopifyId),
    index("order_customer_id_idx").on(t.customerId),
    index("order_processed_at_idx").on(t.processedAt),
    index("order_fw_distinct_id_idx").on(t.posthogDistinctId),
    // Fast filtering of samples out of revenue dashboards, and the samples
    // list view (which orders by processed_at within is_sample = true).
    index("order_is_sample_idx").on(t.isSample, t.processedAt),
    index("order_lead_id_idx").on(t.leadId),
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

// Per-order discount-code redemptions from Shopify's discount_codes array.
// Powers the first-order discount split (welcome vs creator vs review —
// 360 W5 §6 C1 measurement) and per-creator revenue rollups. Family
// classification is computed at query time (src/lib/discount-codes.ts),
// never stored — see specs/work-plans/todo/discount-code-visibility.md.
// The creator program's future generated-codes table joins on `code`.
export const orderDiscountCode = pgTable(
  "order_discount_code",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    // Normalized lowercase for grouping/joins; Shopify treats codes
    // case-insensitively but echoes whatever casing the buyer typed.
    code: text("code").notNull(),
    codeRaw: text("code_raw").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    // Shopify discount type: 'fixed_amount' | 'percentage' | 'shipping'
    type: text("type"),
  },
  (t) => [
    uniqueIndex("order_discount_code_order_code_idx").on(t.orderId, t.code),
    index("order_discount_code_code_idx").on(t.code),
  ],
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
    // When true, this brand may choose "pay later by bank wire" at portal
    // checkout instead of being forced through Shopify card checkout. The order
    // is still recorded (and a Shopify draft order created) so it can be paid by
    // card too; the customer is shown our wire/remittance instructions.
    allowWirePayment: boolean("allow_wire_payment").notNull().default(false),
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
  // Last time the ETA-reminder cron emailed this supplier. Drives the "every
  // N days" cadence; reset to null once they have no missing ETAs.
  etaReminderLastSentAt: timestamp("eta_reminder_last_sent_at", { mode: "date" }),
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
    // Provenance: 'native' = created in this system; 'shopify_pdf' = one-time
    // backfill of historical Shopify purchase orders parsed from PDF exports
    // (scripts/import-shopify-pos.ts). Lets the importer target only its own
    // rows on re-run and keeps imported history distinguishable in reporting.
    origin: text("origin").notNull().default("native"),
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
    // Per-line stage list — the ordered subset of the global pipeline this
    // line actually goes through (e.g. spring bars skip EDM/polishing/logo).
    // NULL means "inherit the global pipeline" (back-compat for lines created
    // before this column existed). Non-null = explicit subset; the planAdvance
    // + buildLineSegments logic walks THIS list instead of the global order.
    stages: text("stages").array(),
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

// Documents attached directly to a B2B company (uploaded from its profile's
// Activity tab). Separate from production_attachment, which is PO/line-item
// scoped — the company Activity tab shows BOTH these and the company's POs'
// attachments (read-only).
export const companyAttachment = pgTable(
  "company_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("company_attachment_company_id_idx").on(t.companyId)],
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
    // Null until the author edits the note; set on each edit so the UI can
    // mark it "(edited)". Notes are author-editable only.
    updatedAt: timestamp("updated_at", { mode: "date" }),
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
  // Sample orders only: the B2B lead the sample shipped to. Null for
  // ordinary synced orders. See order.leadId / b2b-samples-system.md.
  lead: one(lead, {
    fields: [order.leadId],
    references: [lead.id],
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

// Per-(sub-)PO target end date for an individual stage. Overrides the
// cycle-time projection on the production timeline when present; absent →
// fall back to the global stage-cycle estimate. Editable by admins and by the
// supplier(s) involved on the PO (primary or stage owner). Unique on
// (po_id, stage) — surrogate id keeps the table swap-friendly if FKs ever
// land on the row.
export const productionPoStageEta = pgTable(
  "production_po_stage_eta",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    targetEndDate: date("target_end_date").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("po_stage_eta_po_stage_idx").on(t.poId, t.stage),
  ],
);

// Per-PO override of the cycle-time estimate for a single stage. When a row
// exists for (po_id, stage), the production timeline uses `days` instead of
// the global rolling-average estimate for that stage on this PO's bars. Set
// from the timeline legend's click-to-edit affordance; an empty value
// (delete row) reverts to the global estimate. Independent of `stage_eta`
// (which is a hard end DATE override) — these are two different concepts.
export const productionPoStageEstimate = pgTable(
  "production_po_stage_estimate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    days: integer("days").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("po_stage_estimate_po_stage_idx").on(t.poId, t.stage),
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

// Web Push subscriptions — one row per (user, device/browser). Created when an
// admin taps "Enable notifications on this device" in Settings; the endpoint is
// the browser's push service URL and the keys encrypt the payload. Dead
// endpoints (404/410 on send) are pruned automatically. Cascade-deletes with
// the user. See src/lib/push/send.ts.
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The push service endpoint — unique per device/browser, the dedup key.
    endpoint: text("endpoint").notNull().unique(),
    // Encryption keys from the browser PushSubscription (getKey p256dh/auth).
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // User-agent at subscribe time, so the device list reads "iPhone Safari".
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  },
  (t) => [index("push_subscription_user_id_idx").on(t.userId)],
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
  stageEtas: many(productionPoStageEta),
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

export const productionPoStageEtaRelations = relations(
  productionPoStageEta,
  ({ one }) => ({
    po: one(productionPo, {
      fields: [productionPoStageEta.poId],
      references: [productionPo.id],
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

// Snapshot of a ship-to address chosen for a portal order (a copy of one of the
// company's synced Shopify addresses). Stored on the invoice so it stays stable
// even though customer-address sync is delete-and-replace.
export type InvoiceShipTo = {
  addressId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
};

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
    // How the customer intends to settle this order: "card" (Shopify checkout)
    // or "wire" (pay later by bank transfer, when the brand is allow-wire). The
    // payment link still exists either way; this records the customer's choice
    // so the admin can tell a wire order awaiting transfer from an unpaid card one.
    paymentMethod: text("payment_method").notNull().default("card"), // card | wire
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
    // Ship-to address chosen for a portal order — a SNAPSHOT of one of the
    // company's synced Shopify addresses (kept stable since the address sync is
    // delete-and-replace). Drives the Shopify draft order's shipping address.
    // null = no address chosen (legacy / not set). Phase B will add per-line
    // split-fulfillment on top of this default.
    shipTo: jsonb("ship_to").$type<InvoiceShipTo>(),
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
    // Split fulfillment (Phase B): per-line ship-to SNAPSHOT. null = this line
    // ships to the invoice's primary ship_to (the default / un-split case).
    // Surfaced on the Shopify order as a line-item custom attribute, since
    // Shopify can't hold multiple destination addresses on one order.
    shipTo: jsonb("ship_to").$type<InvoiceShipTo>(),
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
    // Mapping to the unified creator record (expand/contract migration —
    // see "Creator program" section). Set by the backfill; rows without
    // it predate the unification.
    creatorId: text("creator_id").references((): AnyPgColumn => creator.id),
    // Shopify collection ids this influencer may order from. Empty = all.
    assignedCollectionIds: text("assigned_collection_ids").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("influencer_customer_id_idx").on(t.customerId),
    index("influencer_creator_id_idx").on(t.creatorId),
  ],
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
    // Unified-system link: gifting orders created from a creator record
    // ("send sample", Phase 4) set this directly.
    creatorId: text("creator_id").references((): AnyPgColumn => creator.id),
    // ── Sample logistics (creator lifecycle, 2026-06-12) ──
    // The real Shopify order created when the draft completes. Linked by
    // the orders/create webhook via GraphQL order→draftOrder lookup.
    shopifyOrderId: text("shopify_order_id"),
    // Stamped from Shopify fulfillment webhooks; manual fallback via PATCH.
    shippedAt: timestamp("shipped_at", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    // Where we expect the content to land (ig | yt | tt | other).
    expectedPlatform: text("expected_platform"),
    status: text("status").notNull().default("draft"), // draft | sent | cancelled
    issuedDate: date("issued_date").notNull(),
    // When the influencer's content is due to be published (the deadline).
    contentDueDate: date("content_due_date"),
    // Set when the content actually goes live (deadline "hit").
    publishedAt: date("published_at"),
    // The affiliate/tracking link for this order's content.
    affiliateLink: text("affiliate_link"),
    notes: text("notes"),
    // Default ship-to for the gifting order — a SNAPSHOT of one of the linked
    // Shopify customer's addresses (kept stable since the address sync is
    // delete-and-replace). Drives the Shopify draft order's shipping address.
    // null = no address chosen. Per-line split-fulfillment layers on top of this.
    // Mirrors invoice.shipTo so the two order systems share the split machinery.
    shipTo: jsonb("ship_to").$type<InvoiceShipTo>(),
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
    index("influencer_order_creator_id_idx").on(t.creatorId),
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
    // Split fulfillment: per-line ship-to SNAPSHOT. null = this line ships to
    // the order's default ship_to (the un-split case). Mirrors
    // invoiceLineItem.shipTo so both order systems share split-alloc + grid.
    shipTo: jsonb("ship_to").$type<InvoiceShipTo>(),
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
    attachments: many(influencerOrderAttachment),
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

// Documents attached to a gifting order (e.g. a signed gifting agreement or a
// content brief PDF). Stored in Vercel Blob; the row keeps the metadata.
// Mirrors invoice_attachment so the shared attachments UI drives both.
export const influencerOrderAttachment = pgTable(
  "influencer_order_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => influencerOrder.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("influencer_order_attachment_order_id_idx").on(t.orderId)],
);

export const influencerOrderAttachmentRelations = relations(
  influencerOrderAttachment,
  ({ one }) => ({
    order: one(influencerOrder, {
      fields: [influencerOrderAttachment.orderId],
      references: [influencerOrder.id],
    }),
  }),
);

// ─── Creator program ────────────────────────────────────────────────
// Single unified creator system (decision 2026-06-12, creator-program.md):
// `creator` is the master record for the 735-prospect database AND the
// entity the gifting flow hangs off. The legacy `influencer` table is in
// expand/contract retirement — its rows map across via influencer.creator_id
// and the contract step (dropping it) waits for Oliver + Greg sign-off.
// Scoring formulas: specs/strategy/creator-scoring.md.

export const creator = pgTable(
  "creator",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    primaryPlatform: text("primary_platform"), // ig | yt | tt
    // prospect | contacted | committed | active | burned | archived
    status: text("status").notNull().default("prospect"),
    // Human vetting layer over the imported dataset (Tom, 2026-06-12):
    // unreviewed | approved | rejected. Rejected = "dumped" — hidden from
    // the default list but kept for dedup (re-discovery won't resurface).
    vettingStatus: text("vetting_status").notNull().default("unreviewed"),
    // Manual ranking adjustment in fit-score points (±). Effective rank =
    // cross_platform_fit + score_boost; the algorithmic score is never
    // mutated, so refreshes don't erase human judgment.
    scoreBoost: real("score_boost").notNull().default(0),
    // ISO 3166-1 alpha-2. Auto-filled from YT channel metadata (rollup of
    // platform.country, only while null); manually editable. Creators in
    // countries outside Shopify Markets are auto-sidelined ("out of
    // market"): hidden + no API polling, and they rejoin the pipeline the
    // moment that market is enabled in Shopify. NULL = unknown = in-market.
    country: text("country"),
    // max(per-platform fit) + 0.2 × min — the outreach ranking number.
    crossPlatformFit: real("cross_platform_fit"),
    burnedUntilDate: date("burned_until_date"),
    // Optional link to a synced Shopify customer — the customer record that
    // IS this creator (set by gifting as the recipient, or by a
    // "convert to customer" reclassification).
    customerId: text("customer_id").references(() => customer.id),
    // Reclassification links: when a creator turns out to be a B2B prospect
    // (a strap brand surfaced by follower count, not a content creator) it's
    // converted into a CRM lead or company and archived. These remember
    // where it went (provenance + dedup so it can't be re-converted).
    leadId: text("lead_id").references(() => lead.id),
    companyId: text("company_id").references(() => company.id),
    // Shopify collection ids this creator may order from. Empty = all.
    // (Carried over from influencer for the self-serve portal phase.)
    assignedCollectionIds: text("assigned_collection_ids").array(),
    // How this creator entered the system: import (CSV research dataset) |
    // manual (admin "Add creator") | self_registration (public signup form).
    // NULL = legacy/import. Self-registrations land here as unreviewed for the
    // /creators vetting queue (filterable via the "Self-registered" pill).
    source: text("source"),
    // Contact phone / WhatsApp (free-form). Self-registration requires an
    // email OR a phone; emails live in creator_email, the phone lives here.
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("creator_status_idx").on(t.status),
    index("creator_source_idx").on(t.source),
    index("creator_vetting_status_idx").on(t.vettingStatus),
    index("creator_cross_platform_fit_idx").on(t.crossPlatformFit),
    index("creator_customer_id_idx").on(t.customerId),
    index("creator_lead_id_idx").on(t.leadId),
    index("creator_company_id_idx").on(t.companyId),
  ],
);

export const creatorPlatform = pgTable(
  "creator_platform",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creator.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // ig | yt | tt
    // Stored lowercased without leading @.
    handle: text("handle").notNull(),
    profileUrl: text("profile_url"),
    isBusinessAccount: boolean("is_business_account"),
    isVerified: boolean("is_verified"),
    externalUrl: text("external_url"),
    bio: text("bio"),
    // ISO 3166-1 alpha-2 as reported by the platform (YT snippet.country;
    // IG doesn't expose one). Raw signal — creator.country is the resolved value.
    country: text("country"),
    // Data depth of the source scrape (apify_base | full | manual) —
    // watch_score is not comparable across depths (scoring doc §9).
    dataSource: text("data_source"),
    watchScore: real("watch_score"),
    watchConfidence: text("watch_confidence"), // high | medium | low | none
    fitScore: real("fit_score"),
    // True when engagement/activity were missing and fit_score was
    // renormalised pro-rata (scoring doc §3 special case).
    fitScorePartial: boolean("fit_score_partial").default(false),
    lastRefreshedAt: timestamp("last_refreshed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("creator_platform_platform_handle_idx").on(
      t.platform,
      t.handle,
    ),
    index("creator_platform_creator_id_idx").on(t.creatorId),
    index("creator_platform_fit_score_idx").on(t.fitScore),
  ],
);

export const creatorStatsDaily = pgTable(
  "creator_stats_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorPlatformId: text("creator_platform_id")
      .notNull()
      .references(() => creatorPlatform.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    followers: integer("followers"),
    engagementRatePct: real("engagement_rate_pct"),
    avgLikes: real("avg_likes"),
    avgComments: real("avg_comments"),
    avgViews: real("avg_views"),
    lastPostDate: date("last_post_date"),
    postsInWindow: integer("posts_in_window"),
  },
  (t) => [
    // One snapshot per platform per day — refresh cron upserts.
    uniqueIndex("creator_stats_daily_platform_date_idx").on(
      t.creatorPlatformId,
      t.snapshotDate,
    ),
  ],
);

export const creatorEmail = pgTable(
  "creator_email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creator.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased
    kind: text("kind"), // business | personal | manager
    source: text("source"), // ig | yt | manual
    verifiedAt: timestamp("verified_at", { mode: "date" }),
    // Grants self-serve portal login (successor to influencer_contact's
    // allowlist role; portal phase checks this flag).
    portalAccess: boolean("portal_access").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("creator_email_creator_email_idx").on(t.creatorId, t.email),
    index("creator_email_email_idx").on(t.email),
  ],
);

export const creatorPost = pgTable(
  "creator_post",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorPlatformId: text("creator_platform_id")
      .notNull()
      .references(() => creatorPlatform.id, { onDelete: "cascade" }),
    // The gifting order this post fulfills, when timing matches —
    // unified system reuses influencer_order as the sample shipment.
    giftOrderId: text("gift_order_id").references(() => influencerOrder.id),
    postUrl: text("post_url").notNull(),
    postedAt: timestamp("posted_at", { mode: "date" }),
    caption: text("caption"),
    likes: integer("likes"),
    comments: integer("comments"),
    views: integer("views"),
    mentionedUs: boolean("mentioned_us").notNull().default(false),
    usedCode: boolean("used_code").notNull().default(false),
    detectedAt: timestamp("detected_at", { mode: "date" }).defaultNow(),
    source: text("source").notNull().default("manual"), // api_poll | manual | backfill
  },
  (t) => [
    uniqueIndex("creator_post_post_url_idx").on(t.postUrl),
    index("creator_post_creator_platform_id_idx").on(t.creatorPlatformId),
    index("creator_post_gift_order_id_idx").on(t.giftOrderId),
  ],
);

// Registry of discount codes we issued per creator. Redemption counts and
// attributed revenue are computed by joining order_discount_code on the
// normalized code — no webhook-incremented counters (avoids the race
// condition the original spec flagged).
export const creatorDiscountCode = pgTable(
  "creator_discount_code",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creator.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // normalized lowercase (matches order_discount_code.code)
    codeRaw: text("code_raw").notNull(), // as created in Shopify
    shopifyPriceRuleId: text("shopify_price_rule_id"),
    shopifyDiscountCodeId: text("shopify_discount_code_id"),
    percentOff: real("percent_off"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
  },
  (t) => [
    uniqueIndex("creator_discount_code_code_idx").on(t.code),
    index("creator_discount_code_creator_id_idx").on(t.creatorId),
  ],
);

// Edited/raw deliverables a creator sends back. storage_url is a pointer
// (Drive/Dropbox) — MVP decision in creator-program.md; rights_expires_at
// is computed at insert from rights_tier (src/lib/creators/assets.ts) and
// the action cron warns 14 days before paid rights lapse.
export const creatorAsset = pgTable(
  "creator_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creator.id, { onDelete: "cascade" }),
    // The sample this deliverable came from, when known.
    giftOrderId: text("gift_order_id").references(() => influencerOrder.id),
    receivedAt: timestamp("received_at", { mode: "date" }).notNull().defaultNow(),
    storageUrl: text("storage_url").notNull(),
    assetType: text("asset_type").notNull().default("edited"), // raw | edited | both
    // organic_only | paid_30d | paid_90d | perpetual
    rightsTier: text("rights_tier").notNull().default("organic_only"),
    rightsExpiresAt: timestamp("rights_expires_at", { mode: "date" }),
    usageNotes: text("usage_notes"),
    uploadedBy: text("uploaded_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("creator_asset_creator_id_idx").on(t.creatorId),
    index("creator_asset_rights_expires_idx").on(t.rightsExpiresAt),
  ],
);

export const creatorAssetRelations = relations(creatorAsset, ({ one }) => ({
  creator: one(creator, {
    fields: [creatorAsset.creatorId],
    references: [creator.id],
  }),
  giftOrder: one(influencerOrder, {
    fields: [creatorAsset.giftOrderId],
    references: [influencerOrder.id],
  }),
}));

// One outreach conversation with a creator on one channel. A creator can
// have several (email + IG DM + manager). Status transitions append
// creator_outreach_event rows and recompute next_followup_at
// (src/lib/creators/lifecycle.ts owns the rules).
export const creatorOutreach = pgTable(
  "creator_outreach",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creator.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // email | ig_dm | yt_comment | manager | other
    // no_reply | replied | negotiating | agreed | declined | ghosted
    status: text("status").notNull().default("no_reply"),
    terms: text("terms"),
    firstContactAt: timestamp("first_contact_at", { mode: "date" }),
    lastContactAt: timestamp("last_contact_at", { mode: "date" }),
    nextFollowupAt: timestamp("next_followup_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("creator_outreach_creator_id_idx").on(t.creatorId),
    index("creator_outreach_next_followup_idx").on(t.nextFollowupAt),
  ],
);

// The activity log: every email/DM (in or out), internal note, and status
// change on a thread. createdBy = the team member's email.
export const creatorOutreachEvent = pgTable(
  "creator_outreach_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    outreachId: text("outreach_id")
      .notNull()
      .references(() => creatorOutreach.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
    direction: text("direction").notNull().default("note"), // out | in | note | status
    summary: text("summary").notNull(),
    body: text("body"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("creator_outreach_event_outreach_id_idx").on(t.outreachId)],
);

export const creatorOutreachRelations = relations(
  creatorOutreach,
  ({ one, many }) => ({
    creator: one(creator, {
      fields: [creatorOutreach.creatorId],
      references: [creator.id],
    }),
    events: many(creatorOutreachEvent),
  }),
);

export const creatorOutreachEventRelations = relations(
  creatorOutreachEvent,
  ({ one }) => ({
    outreach: one(creatorOutreach, {
      fields: [creatorOutreachEvent.outreachId],
      references: [creatorOutreach.id],
    }),
  }),
);

export const creatorRelations = relations(creator, ({ one, many }) => ({
  customer: one(customer, {
    fields: [creator.customerId],
    references: [customer.id],
  }),
  platforms: many(creatorPlatform),
  emails: many(creatorEmail),
  discountCodes: many(creatorDiscountCode),
  outreach: many(creatorOutreach),
  assets: many(creatorAsset),
}));

export const creatorPlatformRelations = relations(
  creatorPlatform,
  ({ one, many }) => ({
    creator: one(creator, {
      fields: [creatorPlatform.creatorId],
      references: [creator.id],
    }),
    statsDaily: many(creatorStatsDaily),
    posts: many(creatorPost),
  }),
);

export const creatorStatsDailyRelations = relations(
  creatorStatsDaily,
  ({ one }) => ({
    platform: one(creatorPlatform, {
      fields: [creatorStatsDaily.creatorPlatformId],
      references: [creatorPlatform.id],
    }),
  }),
);

export const creatorEmailRelations = relations(creatorEmail, ({ one }) => ({
  creator: one(creator, {
    fields: [creatorEmail.creatorId],
    references: [creator.id],
  }),
}));

export const creatorPostRelations = relations(creatorPost, ({ one }) => ({
  platform: one(creatorPlatform, {
    fields: [creatorPost.creatorPlatformId],
    references: [creatorPlatform.id],
  }),
  giftOrder: one(influencerOrder, {
    fields: [creatorPost.giftOrderId],
    references: [influencerOrder.id],
  }),
}));

export const creatorDiscountCodeRelations = relations(
  creatorDiscountCode,
  ({ one }) => ({
    creator: one(creator, {
      fields: [creatorDiscountCode.creatorId],
      references: [creator.id],
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

// Production module settings (single row, id="default"). The ETA-reminder cron
// emails suppliers with un-set line-item ETAs every `etaReminderIntervalDays`
// days until they're filled — toggle + interval are editable in Settings.
export const productionSettings = pgTable("production_settings", {
  id: text("id").primaryKey().default("default"),
  etaReminderEnabled: boolean("eta_reminder_enabled").notNull().default(true),
  etaReminderIntervalDays: integer("eta_reminder_interval_days")
    .notNull()
    .default(2),
  // Positive-control stage check-ins: prompt the supplier at each % of a
  // stage's estimated duration to confirm they're on track. Percentages
  // editable (default 50 / 75 / 95 = "halfway, 25%-to-go, 5%-to-go").
  stageCheckinEnabled: boolean("stage_checkin_enabled").notNull().default(true),
  stageCheckinThresholds: jsonb("stage_checkin_thresholds")
    .$type<number[]>()
    .notNull()
    .default([50, 75, 95]),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// One row per (stage instance × threshold) prompt sent to a supplier. The
// supplier must affirmatively confirm on-track (positive control); silence or
// a flagged delay escalates to admins. The unique index makes each threshold
// fire once per stage instance (the stage_entered_at anchor distinguishes a
// re-entered stage as a new instance).
export const productionStageCheckin = pgTable(
  "production_stage_checkin",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poId: text("po_id")
      .notNull()
      .references(() => productionPo.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    // Earliest enteredAt of the supplier's lines at this stage — the instance key.
    stageEnteredAt: timestamp("stage_entered_at", { mode: "date" }).notNull(),
    thresholdPct: integer("threshold_pct").notNull(), // 50 / 75 / 95
    promptedAt: timestamp("prompted_at", { mode: "date" }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { mode: "date" }),
    // 'pending' (awaiting supplier) | 'on_track' | 'at_risk'
    status: text("status").notNull().default("pending"),
    note: text("note"),
    escalatedAt: timestamp("escalated_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("stage_checkin_instance_idx").on(
      t.poId,
      t.supplierId,
      t.stage,
      t.stageEnteredAt,
      t.thresholdPct,
    ),
    index("stage_checkin_supplier_idx").on(t.supplierId),
    index("stage_checkin_po_idx").on(t.poId),
  ],
);

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
    // Coarse buyer type: watch_oem | strap_oem | buckle_clasp_oem | retailer |
    // distributor.
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

// ─── Supplier leads (potential new suppliers) ───────────────────────
//
// Mirrors the customer `lead` capture flow (same business-card OCR / QR /
// manual entry → review → save), but feeds the supplier pipeline instead of
// the B2B buyer pipeline. Deliberately leaner than `lead`: no stage /
// source-channel / persona / follow-up / reply-detection machinery — a
// supplier lead is just a captured contact that gets promoted into a real
// `supplier` row. `supplier_type` is free `text` (validated at the API
// layer against src/lib/suppliers/lead-constants.ts) so adding a specialty
// doesn't need a migration.
export const supplierLead = pgTable(
  "supplier_lead",
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
    // Free-text supplier/company name until promoted to a real `supplier` row.
    companyName: text("company_name"),
    website: text("website"),
    // Mailing address. All free-text (no state/country enum) so foreign /
    // international formats fit. Auto-filled from the card OCR when present.
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    // Supplier personas (multi-select). Built-in presets "Rapid Prototyping" /
    // "Full Production" plus any free-text "Other" value — stored as the
    // display string. Array so a lead can carry several; the capture dropdown
    // is seeded from the presets ∪ every distinct value already stored here, so
    // a new "Other" entry shows up for everyone next time. Column kept as the
    // original `supplier_type` name to avoid a rename migration.
    supplierTypes: text("supplier_type").array(),
    notes: text("notes"),
    cardImageUrl: text("card_image_url"),
    // Claude's raw read of the card — kept so a desktop fixer can recover
    // anything the structured extraction missed.
    cardRawText: text("card_raw_text"),
    // { firstName: 0..1, email: 0..1, ... } from the vision model.
    ocrConfidence: jsonb("ocr_confidence"),
    // Set when the supplier lead is promoted to a real `supplier` row.
    supplierId: text("supplier_id").references(() => supplier.id),
    // 'active' | 'converted' | 'dropped' (soft-delete uses 'dropped').
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("supplier_lead_email_idx").on(t.email),
    index("supplier_lead_status_idx").on(t.status),
    index("supplier_lead_supplier_id_idx").on(t.supplierId),
    index("supplier_lead_captured_at_idx").on(t.capturedAt),
  ],
);

// History of every business-card image scanned for a supplier lead. Mirrors
// `lead_card_image`; the supplier lead's `cardImageUrl` mirrors the most
// recent row's blobUrl for convenience. Multi-row so re-captures don't
// overwrite.
export const supplierLeadCardImage = pgTable(
  "supplier_lead_card_image",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    supplierLeadId: text("supplier_lead_id")
      .notNull()
      .references(() => supplierLead.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("supplier_lead_card_image_lead_id_idx").on(t.supplierLeadId),
    index("supplier_lead_card_image_uploaded_at_idx").on(t.uploadedAt),
  ],
);

export const supplierLeadRelations = relations(supplierLead, ({ one }) => ({
  capturedBy: one(user, {
    fields: [supplierLead.capturedByUserId],
    references: [user.id],
  }),
  supplier: one(supplier, {
    fields: [supplierLead.supplierId],
    references: [supplier.id],
  }),
}));

export const supplierLeadCardImageRelations = relations(
  supplierLeadCardImage,
  ({ one }) => ({
    supplierLead: one(supplierLead, {
      fields: [supplierLeadCardImage.supplierLeadId],
      references: [supplierLead.id],
    }),
    uploadedBy: one(user, {
      fields: [supplierLeadCardImage.uploadedByUserId],
      references: [user.id],
    }),
  }),
);

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

// ─── Newsletter (daily watch-industry brief) ────────────────────────
// Engine lives in newsletter/ (peer to src/), runs from GitHub Actions.
// Subscriber list stays in Klaviyo — no subscriber table here.
// Spec: specs/current/newsletter-engine.md + specs/strategy/newsletter.md.

// The curated registry of feeds we pull from. Seeded from
// newsletter/sources.ts (idempotent upsert on slug); is_active=false
// retires a source without losing its article history.
export const newsletterSource = pgTable(
  "newsletter_source",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Stable registry key, e.g. "hodinkee" — join point for the code-side
    // source modules so renames don't orphan articles.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // 'editorial' | 'b2b' | 'community' | 'auction' | 'ir' | 'microbrand'
    category: text("category").notNull(),
    feedUrl: text("feed_url"), // null if scrape-only
    scrapeUrl: text("scrape_url"), // landing page for scrape fallback
    requiresPlaywright: boolean("requires_playwright").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("newsletter_source_slug_uniq").on(t.slug)],
);

// One row per shipped issue. Written only after the Klaviyo draft/send
// succeeds (persist-after-send ordering — see newsletter/main.ts), so
// klaviyo_campaign_id is always populated; the row is upserted on it.
export const newsletterCampaign = pgTable(
  "newsletter_campaign",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    klaviyoCampaignId: text("klaviyo_campaign_id"),
    // 'draft' | 'sent' — flipped by the extract-klaviyo cron once send
    // stats start arriving.
    status: text("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    subject: text("subject").notNull(),
    articleCount: integer("article_count").notNull(),
    htmlHash: text("html_hash").notNull(),
    // Stats backfilled by the extract-klaviyo cron
    recipientCount: integer("recipient_count"),
    openCount: integer("open_count"),
    clickCount: integer("click_count"),
    unsubscribeCount: integer("unsubscribe_count"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("newsletter_campaign_klaviyo_id_uniq").on(t.klaviyoCampaignId),
    index("newsletter_campaign_created_at_idx").on(t.createdAt),
  ],
);

// Every story considered, whether it made the brief or not. url is the
// dedup key across runs; dropped_reason is null for included stories so
// we can audit what the filter is rejecting.
export const newsletterArticle = pgTable(
  "newsletter_article",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => newsletterSource.id),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }),
    contentHash: text("content_hash").notNull(),
    summary: text("summary"),
    // 'luxury' | 'mid' | 'microbrand' | 'vintage-auction'
    segment: text("segment"),
    // 'release' | 'business' | 'auction' | 'community'
    type: text("type"),
    imageUrl: text("image_url"), // Vercel Blob URL once image pipeline lands
    includedInCampaignId: text("included_in_campaign_id").references(
      () => newsletterCampaign.id,
    ),
    droppedReason: text("dropped_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("newsletter_article_url_uniq").on(t.url),
    index("newsletter_article_source_id_idx").on(t.sourceId),
    index("newsletter_article_content_hash_idx").on(t.contentHash),
    index("newsletter_article_campaign_idx").on(t.includedInCampaignId),
    index("newsletter_article_created_at_idx").on(t.createdAt),
  ],
);

// ─── Trade shows ────────────────────────────────────────────────────
//
// A trade show (e.g. EPHJ Geneva 2026) and the booth-walking vendor worklist
// that hangs off it. The vendor list is the *floor capture surface*: at each
// booth you mark "visited", scan/enter a business card, leave a voice note,
// and jot follow-up steps. When a conversation is worth pursuing you promote
// the vendor into one of the existing CRM pipelines — a `supplier_lead`
// (manufacturers we'd buy from) and/or a `lead` (B2B customers we'd sell to) —
// carrying the card data over. The vendor row stays linked to whatever it
// created. Pre-show seed data (booth, company, category, side, flagged) comes
// from the show's prospecting spreadsheet.

export const tradeShow = pgTable(
  "trade_show",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // Free-text venue/city/country so any show format fits.
    location: text("location"),
    city: text("city"),
    country: text("country"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    // The B2B entry channel this show maps to, mirroring
    // specs/strategy/b2b-pipeline.md (e.g. b2b_trade_shows_industry). Carried
    // onto any customer `lead` promoted from one of its vendors.
    sourceChannel: text("source_channel")
      .notNull()
      .default("b2b_trade_shows_industry"),
    notes: text("notes"),
    // 'active' | 'archived'.
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_show_status_idx").on(t.status),
    index("trade_show_starts_on_idx").on(t.startsOn),
  ],
);

export const tradeShowVendor = pgTable(
  "trade_show_vendor",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tradeShowId: text("trade_show_id")
      .notNull()
      .references(() => tradeShow.id, { onDelete: "cascade" }),
    booth: text("booth"),
    companyName: text("company_name").notNull(),
    // Free-text category off the floor plan (e.g. "Straps", "Clasps / Buckles",
    // "EDM"). No enum — the show's own taxonomy is messy and not worth policing.
    category: text("category"),
    // Which pipeline this vendor feeds: 'supplier' (a manufacturer we'd buy
    // from), 'customer' (a brand/strap maker we'd sell buckles to), or 'both'.
    // Drives the available "Convert to …" actions and the list filters.
    side: text("side").notNull().default("both"),
    // Priority booth (the "Flag" column from the seed sheet) — worth a stop.
    priority: boolean("priority").notNull().default(false),
    // Best-known contact off the seed sheet / card scan. Stays free-text until
    // promoted into a real lead/supplier-lead row.
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    website: text("website"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    // Raw pre-show context copied from the prospecting sheet — kept separate
    // from the on-floor `notes` so the seed intel isn't overwritten.
    seedNotes: text("seed_notes"),
    // Raw response / meeting-status strings from the sheet (e.g. "y",
    // "wed 2pm", "stop by say hi"). Free-text; informational only.
    responseRaw: text("response_raw"),
    meetingRaw: text("meeting_raw"),
    // ── On-floor capture ──
    visited: boolean("visited").notNull().default(false),
    visitedAt: timestamp("visited_at", { mode: "date" }),
    visitedByUserId: text("visited_by_user_id").references(() => user.id),
    // Working notes the rep types/dictates at the booth.
    notes: text("notes"),
    // Business-card scan (reuses the same Claude-vision OCR as the lead/
    // supplier-lead capture). `cardImageUrl` mirrors the latest scan.
    cardImageUrl: text("card_image_url"),
    cardRawText: text("card_raw_text"),
    ocrConfidence: jsonb("ocr_confidence"),
    // Did we hand them a sample at the booth? Tracked for either side — a
    // potential customer evaluating our buckle, or a supplier prototyping
    // against it. `sampleGivenAt` is stamped on the first yes.
    sampleGiven: boolean("sample_given").notNull().default(false),
    sampleGivenAt: timestamp("sample_given_at", { mode: "date" }),
    // ── Follow-up ──
    // 'none' | 'todo' | 'scheduled' | 'done' | 'skip'.
    followUpStatus: text("follow_up_status").notNull().default("none"),
    nextSteps: text("next_steps"),
    // ── Pipeline links (set on promote) ──
    leadId: text("lead_id").references(() => lead.id),
    supplierLeadId: text("supplier_lead_id").references(() => supplierLead.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_show_vendor_show_id_idx").on(t.tradeShowId),
    index("trade_show_vendor_visited_idx").on(t.visited),
    index("trade_show_vendor_side_idx").on(t.side),
    index("trade_show_vendor_lead_id_idx").on(t.leadId),
    index("trade_show_vendor_supplier_lead_id_idx").on(t.supplierLeadId),
    // One row per (show, company) — the seed upsert dedups on this. Booth
    // alone isn't unique (some booths host two companies in the seed data).
    uniqueIndex("trade_show_vendor_show_company_uniq").on(
      t.tradeShowId,
      t.companyName,
    ),
  ],
);

// A voice memo recorded at a booth. The audio lives in Vercel Blob (so it can
// be replayed); `transcript` holds the on-device Web Speech dictation captured
// while recording (no external STT service). Mirrors the card-image history
// pattern — multi-row so several notes can hang off one vendor.
export const tradeShowVendorVoiceNote = pgTable(
  "trade_show_vendor_voice_note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => tradeShowVendor.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    durationSec: real("duration_sec"),
    // Browser Web Speech API transcript, when available (best-effort).
    transcript: text("transcript"),
    recordedByUserId: text("recorded_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_show_vendor_voice_note_vendor_id_idx").on(t.vendorId),
    index("trade_show_vendor_voice_note_created_at_idx").on(t.createdAt),
  ],
);

export const tradeShowRelations = relations(tradeShow, ({ many }) => ({
  vendors: many(tradeShowVendor),
}));

export const tradeShowVendorRelations = relations(
  tradeShowVendor,
  ({ one, many }) => ({
    tradeShow: one(tradeShow, {
      fields: [tradeShowVendor.tradeShowId],
      references: [tradeShow.id],
    }),
    visitedBy: one(user, {
      fields: [tradeShowVendor.visitedByUserId],
      references: [user.id],
    }),
    lead: one(lead, {
      fields: [tradeShowVendor.leadId],
      references: [lead.id],
    }),
    supplierLead: one(supplierLead, {
      fields: [tradeShowVendor.supplierLeadId],
      references: [supplierLead.id],
    }),
    voiceNotes: many(tradeShowVendorVoiceNote),
  }),
);

export const tradeShowVendorVoiceNoteRelations = relations(
  tradeShowVendorVoiceNote,
  ({ one }) => ({
    vendor: one(tradeShowVendor, {
      fields: [tradeShowVendorVoiceNote.vendorId],
      references: [tradeShowVendor.id],
    }),
    recordedBy: one(user, {
      fields: [tradeShowVendorVoiceNote.recordedByUserId],
      references: [user.id],
    }),
  }),
);
