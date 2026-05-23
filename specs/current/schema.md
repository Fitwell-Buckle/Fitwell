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
| `shopify_po_number` | text | User-entered, copied from Shopify |
| `issued_date` | date | Required |
| `expected_delivery_date` | date | Nullable |
| `lock_stages_together` | boolean | Default true; false = items advance independently |
| `status` | text | `active` \| `on_hold` \| `complete` \| `cancelled` |
| `shopify_received_at` | timestamp | Set manually when received in Shopify (Phase 4) |
| `notes` | text | |
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

## Open Questions

- [ ] Do we need a `product` table, or is Shopify sufficient as source of truth for product catalog?
- [ ] Should `utm_attribution` store raw cookie values or parsed?
- [ ] Partitioning strategy for analytics staging tables as they grow?
- [x] Use `uuid` vs `serial` for PKs — decided uuid for distributed-friendly inserts
