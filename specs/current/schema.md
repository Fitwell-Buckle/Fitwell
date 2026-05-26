# Database Schema

Last updated: 2026-05-23

## Design Principles

1. **Shopify is source of truth** for orders and customers — we sync, never originate
2. **Idempotent upserts** — all sync operations use `ON CONFLICT ... DO UPDATE`
3. **Analytics tables are append-only staging** — daily snapshots, never mutated after write
4. **All timestamps are UTC** — `timestamptz` everywhere
5. **Soft deletes where needed** — `deleted_at` column, never hard delete customer/order data

## Auth Tables (NextAuth)

Managed by `@auth/drizzle-adapter`. Standard schema:

| Table | Purpose |
|-------|---------|
| `user` | Admin users (Google OAuth) |
| `session` | Active sessions |
| `account` | OAuth provider connections |
| `verification_token` | Email verification (unused, required by adapter) |

Only a handful of admin users. No public registration.

## Core Business Tables

### `customer`

Synced from Shopify. One row per Shopify customer.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, generated |
| `shopify_id` | bigint | Unique, from Shopify |
| `email` | text | Nullable (guest checkout) |
| `first_name` | text | |
| `last_name` | text | |
| `phone` | text | Nullable |
| `first_order_at` | timestamptz | Computed from orders |
| `last_order_at` | timestamptz | Computed from orders |
| `order_count` | integer | Denormalized, updated on sync |
| `total_spent` | numeric(10,2) | Denormalized, updated on sync |
| `tags` | text[] | Shopify tags array |
| `utm_source` | text | First-touch attribution |
| `utm_medium` | text | |
| `utm_campaign` | text | |
| `city` | text | From default address |
| `state` | text | |
| `country` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `synced_at` | timestamptz | Last Shopify sync time |

### `order`

Synced from Shopify. One row per Shopify order.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `shopify_id` | bigint | Unique |
| `shopify_order_number` | text | Human-readable #1001 etc. |
| `customer_id` | uuid | FK → customer |
| `email` | text | Order-level email |
| `financial_status` | text | paid, refunded, etc. |
| `fulfillment_status` | text | fulfilled, partial, null |
| `total_price` | numeric(10,2) | |
| `subtotal_price` | numeric(10,2) | |
| `total_discount` | numeric(10,2) | |
| `total_tax` | numeric(10,2) | |
| `currency` | text | USD default |
| `discount_codes` | jsonb | Array of applied discounts |
| `note` | text | |
| `tags` | text[] | |
| `source_name` | text | web, pos, api, etc. |
| `landing_site` | text | URL customer arrived on |
| `referring_site` | text | External referrer |
| `ordered_at` | timestamptz | Shopify `created_at` |
| `created_at` | timestamptz | Our insert time |
| `updated_at` | timestamptz | |
| `synced_at` | timestamptz | |

### `order_line_item`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `order_id` | uuid | FK → order |
| `shopify_product_id` | bigint | |
| `shopify_variant_id` | bigint | |
| `title` | text | Product title at time of order |
| `variant_title` | text | e.g. "20mm / Brushed Steel" |
| `sku` | text | |
| `quantity` | integer | |
| `price` | numeric(10,2) | Per-unit price |
| `total_discount` | numeric(10,2) | Line-level discount |

## Attribution

### `utm_attribution`

Captured client-side on landing pages, linked to customer post-purchase.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `session_id` | text | PostHog or custom session ID |
| `utm_source` | text | |
| `utm_medium` | text | |
| `utm_campaign` | text | |
| `utm_term` | text | |
| `utm_content` | text | |
| `referrer` | text | document.referrer |
| `landing_page` | text | Path user arrived on |
| `gclid` | text | Google Ads click ID |
| `customer_id` | uuid | FK → customer, nullable (linked post-purchase) |
| `converted` | boolean | Default false |
| `converted_at` | timestamptz | |
| `created_at` | timestamptz | |

### `campaign`

Marketing campaign metadata for attribution grouping.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `name` | text | Human name |
| `platform` | text | google_ads, meta, email, organic |
| `utm_campaign` | text | Matches UTM param |
| `status` | text | active, paused, completed |
| `budget` | numeric(10,2) | Nullable |
| `start_date` | date | |
| `end_date` | date | Nullable |
| `notes` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

## Analytics Staging Tables

Daily snapshots extracted from external APIs. Append-only — one row per date per dimension.

### `ga4_daily`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `date` | date | |
| `sessions` | integer | |
| `users` | integer | |
| `new_users` | integer | |
| `page_views` | integer | |
| `avg_session_duration` | numeric(8,2) | Seconds |
| `bounce_rate` | numeric(5,4) | 0.0000–1.0000 |
| `source` | text | Traffic source |
| `medium` | text | Traffic medium |
| `campaign` | text | UTM campaign |
| `created_at` | timestamptz | Extraction time |

### `gsc_daily`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `date` | date | |
| `query` | text | Search query |
| `page` | text | Landing page URL |
| `clicks` | integer | |
| `impressions` | integer | |
| `ctr` | numeric(5,4) | |
| `position` | numeric(5,2) | Average position |
| `country` | text | |
| `device` | text | DESKTOP, MOBILE, TABLET |
| `created_at` | timestamptz | |

### `google_ads_daily`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `date` | date | |
| `campaign_name` | text | Google Ads campaign |
| `campaign_id` | text | |
| `impressions` | integer | |
| `clicks` | integer | |
| `cost` | numeric(10,2) | In account currency |
| `conversions` | numeric(8,2) | |
| `conversion_value` | numeric(10,2) | |
| `created_at` | timestamptz | |

### `posthog_daily`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `date` | date | |
| `event_name` | text | e.g. `$pageview`, `cta_click` |
| `page` | text | URL path |
| `count` | integer | Event count |
| `unique_users` | integer | Distinct user count |
| `properties` | jsonb | Aggregated property breakdown |
| `created_at` | timestamptz | |

## Lifecycle

### `customer_event`

Tracks key customer lifecycle moments.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `customer_id` | uuid | FK → customer |
| `event_type` | text | first_purchase, repeat_purchase, refund, etc. |
| `event_data` | jsonb | Flexible payload |
| `occurred_at` | timestamptz | |
| `created_at` | timestamptz | |

## Production Module

Tracks in-house buckle production across suppliers and an 8-stage workflow.
Added by the Production work plan (Phase 1). Money is stored in **cents**
(integers); date-only fields use Postgres `date`.

### `production_stage` (enum)

Fixed, ordered progression — every line item passes through all stages:
`supplier_po → stamping → edm → polishing → logo → plating → qc → packaging → complete`.

### `supplier`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK, generated |
| `name` | text | Required |
| `contact_name` | text | Nullable |
| `contact_email` | text | Nullable |
| `notes` | text | Nullable |
| `created_at` / `updated_at` | timestamp | |

### `production_po`

A master PO tracked against Shopify's built-in PO feature (no Shopify PO API).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `supplier_id` | text | FK → supplier |
| `shopify_po_number` | text | Auto-generated from `production_po_number_seq` (starts at 100), zero-padded to ≥5 digits ("00100"); immutable. Stamped onto the Shopify inventory-adjustment reference on receipt |
| `issued_date` | date | Required |
| `expected_delivery_date` | date | Nullable |
| `lock_stages_together` | boolean | Default true; false = items advance independently |
| `status` | text | `active` \| `on_hold` \| `complete` \| `cancelled` |
| `shopify_received_at` | timestamp | Set manually when received in Shopify (Phase 4) |
| `company_id` | text | Default B2B company (FK → company); line items can override |
| `shopify_location_id` / `location_name` | text | Default receiving warehouse (Shopify location; needs `read_locations`); line items can override |
| `notes` | text | |

Line items (`production_po_line_item`) also carry optional `company_id`,
`shopify_location_id`, `location_name` that **override** the PO defaults.

**Multi-supplier split** (`parent_po_id`, `po_suffix`): a PO routed across
several suppliers becomes a **master** (`00100-Master`); each supplier gets a
**sub-PO** (`parent_po_id` = master, `po_suffix` "A"/"B"…, `supplier_id` = that
supplier, **no line items of its own** — it renders the master's). Sub-POs are
generated from the master's stage→supplier assignments by `createMultiSupplierPo`
(or `…FromInvoice`); `planSubPos`/`formatPoNumber` in `lib/production/sub-po.ts`
(unit-tested) do the planning + numbering. Editing/receiving/invoicing stay on
the master; each sub-PO is sent to its supplier (renders the master's items +
that supplier's stages). The PO list hides sub-POs; the supplier portal works
the master scoped to a supplier's stages and shows their sub-PO number.
Migration `0014_sloppy_la_nuit`.

**Stage advancement on sub-POs**: for a multi-supplier master, stage editing
moves off the master (now a read-only cost rollup) onto each **sub-PO**. A
sub-PO drives the shared line items only through the stages that supplier owns:
**Advance** steps within its own stages, **Complete PO** hands every owned-stage
line off to the next supplier's first stage (or `complete` for the last). The
master's `Receive into Shopify` unlocks once all lines reach `complete` (i.e.
every supplier finished). `subPoStageState`/`subPoTransitions` in
`lib/production/sub-po.ts` (unit-tested) compute the button state + moves;
`advanceSubPo` in the service applies them. `supplier_po` (the opening "PO
placed" state) is no longer an assignable stage — it falls to the primary
supplier.

### `production_supplier_line_cost`

Per-supplier, per-line-item production cost on a multi-supplier PO. Keyed by the
**master** PO + supplier (not the sub-PO id) so costs survive sub-PO regeneration
on edit.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `po_id` | text | FK → production_po (master), cascade delete |
| `supplier_id` | text | FK → supplier, cascade delete |
| `line_item_id` | text | FK → production_po_line_item, cascade delete |
| `unit_cost_cents` | integer | Per-unit cost this supplier charges for this line |
| `created_at` / `updated_at` | timestamp | |

Unique on (`po_id`, `supplier_id`, `line_item_id`). A sub-PO supplier prices each
line (a raw-blank/stamping supplier prices the group; the same per-piece cost is
written to every SKU the blank covers). The master rolls these up: Σ each
supplier's unit cost per line × qty = line total. Supersedes the single
`production_po.supplier_price_cents` (now unused). Migration `0016_slim_blink`.

### `company` / `price_tier`

Our own B2B companies (not Shopify), managed under Customers → Companies.

| Table | Key columns |
|-------|-------------|
| `company` | `name`, `contact_name?`, `contact_email?`, `customer_id` (FK → customer, optional link to a synced Shopify customer), `price_tier_id` (FK → price_tier), `assigned_collection_ids` (text[]), `assigned_product_ids` (text[]), `deposit_percent` (real, default 0), `notes` |
| `price_tier` | `name`, `discount_percent` (real, % off retail) |

A brand's `assigned_collection_ids` + `assigned_product_ids` **restrict** which
products it can order (both empty = the whole catalog). Enforced on the B2B
order form and the company portal (browse + checkout) via `allowedVariantIds()`
in `lib/catalog/load.ts`. Migration `0012_round_queen_noir`.

`deposit_percent` (0 = pay in full) drives **two-payment deposit billing**: on
send / portal checkout the Shopify draft order bills only the deposit (a single
custom line) and the deposit is snapshotted onto the invoice
(`deposit_percent`, `deposit_cents`); marking the order **fulfilled** generates
a second "balance" draft order (`shopify_balance_draft_order_id` /
`shopify_balance_invoice_url`). `computeDeposit()` in `lib/invoicing/invoicing.ts`
(unit-tested) does the split. Migration `0013_lying_sleeper`.
| `created_at` / `updated_at` | timestamp | |

### `production_po_line_item`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `po_id` | text | FK → production_po (cascade delete) |
| `shopify_product_id` / `shopify_variant_id` | text | No FK yet (denormalized snapshot) |
| `sku` / `title` | text | Required |
| `quantity` | integer | Required |
| `unit_cost_cents` | integer | Nullable |
| `current_stage` | production_stage | Default `supplier_po` |
| `expected_completion_date` / `actual_completion_date` | date | Nullable |
| `customer_id` | text | FK → customer, optional earmark |
| `order_line_item_id` | text | FK → order_line_item, optional earmark |
| `created_at` / `updated_at` | timestamp | |

### `production_stage_event`

Append-on-transition log; powers the timeline and (later) cycle-time estimates.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `line_item_id` | text | FK → production_po_line_item (cascade delete) |
| `stage` | production_stage | The stage entered |
| `entered_at` | timestamp | Defaults now |
| `exited_at` | timestamp | Set when the item leaves the stage |
| `triggered_by_user_id` | text | FK → user, nullable |
| `notes` | text | |

### `production_comment` / `production_attachment`

Polymorphic children (Phase 2) — **exactly one** of `po_id` / `line_item_id` is
set, enforced by a CHECK constraint (`(po_id IS NULL) <> (line_item_id IS NULL)`)
and by the `resolveParent` validator before insert. Both cascade-delete with their
parent.

| Table | Key columns |
|-------|-------------|
| `production_comment` | `po_id?`, `line_item_id?`, `author_user_id` (FK user), `body`, `created_at` |
| `production_attachment` | `po_id?`, `line_item_id?`, `blob_url`, `filename`, `content_type`, `size_bytes`, `uploaded_by_user_id` (FK user), `uploaded_at` |

Attachments are stored in **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); the DB row
holds the blob URL + metadata.

### `user.supplier_id`

Nullable text column added to `user`; set for users with `role='supplier'` so the
supplier portal can scope queries to their own POs (Phase 3).

## Influencer Tracking

Creators we gift product to in exchange for content. Managed under
**Marketing → Influencer List** (the entity + assigned collections) and
**Marketing → Influencer Orders** (gifting orders + content-deadline status).
Orders are gifting (**100% off** — a Shopify draft order at full discount) and
carry an **affiliate link per order**.

| Table | Key columns |
|-------|-------------|
| `influencer` | `name`, `handle?`, `platform?`, `contact_name?`, `contact_email?`, `customer_id` (FK → customer, optional Shopify link), `assigned_collection_ids` (text[] — Shopify collection ids; empty = all), `notes` |
| `influencer_contact` | `influencer_id` (FK, cascade), `email` (unique, lowercased), `name?` — allowlist for the future self-serve portal |
| `influencer_order` | `order_number` ("GIFT-00100", from `influencer_order_number_seq`), `influencer_id` (FK), `status` (draft\|sent\|cancelled), `issued_date`, `content_due_date?` (the deadline), `published_at?` (set when content goes live), `affiliate_link?`, `subtotal_cents` (retail gift value), `discount_percent` (100), `total_cents` (0), `shopify_draft_order_id?`, `shopify_invoice_url?`, `sent_at?`, `notes?` |
| `influencer_order_line_item` | `order_id` (FK, cascade), `sku`, `title`, `quantity`, `unit_price_cents` (retail gift value), `shopify_product_id?`, `shopify_variant_id?` |

Deadline status (`approaching` / `missed` / `hit` / `on_track` / `no_deadline`)
is derived from `content_due_date` + `published_at` by the pure helper
`deadlineStatus()` in `src/lib/influencer/influencer.ts` (unit-tested) — not
stored. A `user.influencer_id` column (for the future influencer portal,
`role='influencer'`) is **deferred to that phase's own migration** — it's
intentionally not added here, so the running app never queries a column the DB
doesn't have.

## Open Questions

- [ ] Do we need a `product` table, or is Shopify sufficient as source of truth for product catalog?
- [ ] Should `utm_attribution` store raw cookie values or parsed?
- [ ] Partitioning strategy for analytics staging tables as they grow?
- [x] Use `uuid` vs `serial` for PKs — decided uuid for distributed-friendly inserts
