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
    // PostHog distinct_id bridged from the Shopify pixel/theme (identity stitch)
    fwDistinctId: text("fw_distinct_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_shopify_id_idx").on(t.shopifyId),
    index("customer_email_idx").on(t.email),
    index("customer_fw_distinct_id_idx").on(t.fwDistinctId),
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
    // Identity-bridge: distinct_id carried from the pixel via checkout note attribute
    fwDistinctId: text("fw_distinct_id"),
    // How the order was linked to a pre-purchase touch: 'pixel' | 'email_match' | null
    linkMethod: text("link_method"),
    processedAt: timestamp("processed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("order_shopify_id_idx").on(t.shopifyId),
    index("order_customer_id_idx").on(t.customerId),
    index("order_processed_at_idx").on(t.processedAt),
    index("order_fw_distinct_id_idx").on(t.fwDistinctId),
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
    // PostHog distinct_id from the theme snippet (first-touch identity)
    fwDistinctId: text("fw_distinct_id"),
    // Set when this touch is linked to a purchase (attribution invariant §4)
    converted: boolean("converted").default(false),
    convertedAt: timestamp("converted_at", { mode: "date" }),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("utm_visitor_id_idx").on(t.visitorId),
    index("utm_captured_at_idx").on(t.capturedAt),
    index("utm_fw_distinct_id_idx").on(t.fwDistinctId),
    uniqueIndex("utm_session_id_idx").on(t.sessionId),
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
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    // Optional link to a synced Shopify customer (the contact person).
    customerId: text("customer_id").references(() => customer.id),
    priceTierId: text("price_tier_id").references(() => priceTier.id),
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
    currentStage: productionStage("current_stage")
      .notNull()
      .default("supplier_po"),
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
    stage: productionStage("stage").notNull(),
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
    stage: productionStage("stage").notNull(),
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
    lineItemId: text("line_item_id"),
    supplierId: text("supplier_id"),
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
    shopifyDraftOrderId: text("shopify_draft_order_id"),
    shopifyInvoiceUrl: text("shopify_invoice_url"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
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
}));

export const invoiceLineItemRelations = relations(invoiceLineItem, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceLineItem.invoiceId],
    references: [invoice.id],
  }),
}));

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
