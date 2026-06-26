# Database Schema

Last updated: 2026-06-01

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
| `company_id` | text | Nullable FK → `company`. Manually links a Shopify customer to a B2B company — drives the company detail "People" list (its leads + these customers) |
| `city` | text | From default address |
| `state` | text | |
| `country` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `synced_at` | timestamptz | Last Shopify sync time |

### `customer_address`

Shopify customer addresses (multiple per customer — Shopify returns
`default_address` + an `addresses[]` array). Populated by the customer sync;
**delete-and-replace** on every `upsertCustomer` call so Shopify stays
authoritative. Backfilled via `scripts/backfill-customer-addresses.ts`.
Surfaced on the B2B customer page (`/customers/brands/[id]`), default first.
Migration `0022_opposite_ink`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `customer_id` | text | FK → `customer` (cascade delete) |
| `shopify_address_id` | text | Shopify's address id (nullable for synthetic rows) |
| `first_name` / `last_name` / `company` | text | All nullable |
| `address1` / `address2` | text | Nullable |
| `city` / `province` / `province_code` | text | Nullable |
| `country` / `country_code` | text | Nullable |
| `zip` / `phone` | text | Nullable |
| `is_default` | boolean | True for the entry matching `customer.default_address.id` |
| `created_at` / `updated_at` | timestamp | Defaults now |

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
| `total_price` | integer (cents) | Amount charged (nets discounts, adds tax + shipping) |
| `subtotal_price` | integer (cents) | |
| `total_discounts` | integer (cents) | |
| `total_tax` | integer (cents) | |
| `total_shipping` | integer (cents) | From `total_shipping_price_set.shop_money` |
| `total_refunded` | integer (cents) | **Returned-item value** (refund line items + order adjustments), clamped to `total_price`. NOT cash transactions — matches Shopify's "Returns" |
| `currency` | text | USD default |
| `discount_codes` | jsonb | Array of applied discounts |
| `note` | text | |
| `tags` | text[] | |
| `source_name` | text | web, pos, api, etc. |
| `landing_site` | text | URL customer arrived on |
| `referring_site` | text | External referrer |
| `processed_at` | timestamptz | Shopify `processed_at` (falls back to `created_at`) |
| `cancelled_at` | timestamptz | Shopify cancellation time; null otherwise. Excluded from "Total sales" |
| `is_sample` | boolean | Default false. Set from the Shopify `sample` tag on every sync (`hasSampleTag` in `lib/shopify/order-tags.ts`) — re-derived each sync, so removing the tag re-includes the order. Tagged $0 orders (B2B samples + influencer gifts) are **excluded from all revenue/customer/attribution reporting**. Migration `0055`. |
| `lead_id` | text | Nullable FK → `lead`. Links a B2B sample order to the lead it was shipped to. Migration `0055`. |
| `created_at` | timestamptz | Our insert time |
| `updated_at` | timestamptz | |

**"Total sales" (dashboard headline)** = `SUM(total_price - total_refunded)` over **non-cancelled, non-sample** orders in range (includes pending orders, subtracts returns), bucketed in the **store timezone** (`America/Los_Angeles`, see `src/lib/timezone.ts`). This is what reconciles with Shopify's "Total sales" report — unlike the former paid-only "Revenue", which excluded pending/wholesale orders and ignored returns.

**Sample/gift exclusion:** orders tagged `sample` in Shopify (B2B samples and influencer gifts — gifts also carry `influencer-gift`) set `order.is_sample = true` on sync, and are filtered out (`not(order.is_sample)`) of the dashboard sales/customer metrics, `lib/analytics/attribution.ts`, and `api/admin/funnel`. The `sample` tag is the single source of truth — see `specs/work-plans/todo/b2b-samples-system.md`. Ops/fulfillment queries deliberately keep samples in.

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

### `order_discount_code`

Per-order discount-code redemptions from Shopify's `discount_codes` array
(captured by `upsertOrder()`, delete-and-reinsert on re-sync like line
items). Powers the first-order discount split (welcome vs creator vs
review — 360 W5 §6 C1 measurement) and per-creator revenue rollups.
Family classification is computed at query time via
`src/lib/discount-codes.ts` (`jm-` prefix → review bucket; creator
prefixes → per-creator; shared welcome code pinned post-backfill), never
stored. See `specs/work-plans/completed/discount-code-visibility.md`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `order_id` | text | FK → order, cascade delete |
| `code` | text | Normalized lowercase — grouping/join key (creator program's generated-codes table joins here) |
| `code_raw` | text | Casing as the buyer typed it |
| `amount_cents` | integer | Discount amount in cents |
| `type` | text | Shopify type: `fixed_amount` / `percentage` / `shipping` |

Unique on `(order_id, code)`; indexed on `code` for rollups.

### `order_refund_line`

Per-product return detail from Shopify's `refunds[].refund_line_items[]`
(captured by `upsertOrder()`, delete-and-reinsert on re-sync like line items).
The order's `total_refunded` column nets all refunds into one dollar figure;
this table preserves **which** product/variant came back, **how many** units,
and **when** — enabling true per-SKU/per-unit return rates and return latency
instead of estimating from refund dollar shares. Product fields are
denormalized off the nested refund `line_item`, so analysis never has to join
back through `shopify_line_item_id`. Shipping refunds (`order_adjustments`) are
excluded here (not product returns) but remain folded into `total_refunded`.
Backfill: `scripts/backfill-refund-lines.ts` (refunds are embedded in the order
payload; the script re-fetches full order detail for orders with refunds).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `order_id` | text | FK → order, cascade delete |
| `shopify_refund_id` | text | Shopify refund id (one refund groups many lines) |
| `shopify_line_item_id` | text | The order line item this refund returns |
| `shopify_product_id` | text | Denormalized from nested `line_item` |
| `shopify_variant_id` | text | Denormalized from nested `line_item` |
| `title` | text | Product title of the returned line |
| `variant_title` | text | Variant (size/finish) of the returned line |
| `sku` | text | |
| `quantity` | integer | Units returned on this line — real count, not estimated |
| `subtotal_cents` | integer | Returned merchandise value (item subtotal) |
| `tax_cents` | integer | Returned tax on this line |
| `refunded_at` | timestamp | Refund `created_at` — the true return date |

Indexed on `order_id`, `shopify_product_id`, and `refunded_at`.

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

### `attribution_survey_response`

Self-reported attribution captured by post-purchase surveys (Grapevine
today; `provider` makes it multi-provider safe). One row per
`(provider, provider_response_id)` — idempotent against retries. Powers
`order.link_method = 'self_report'` per [attribution.md](../invariants/attribution.md).

Per-question grain (one row per answered question per order) so the
single-question survey today can grow to multi-question without a
schema change.

**Important distinction between `platform_hint` and `channel_hint`:**

- `platform_hint` is the **platform the survey reveals** (e.g. `instagram`,
  `google_search`). Set whenever the answer names a platform, even when
  the paid-vs-organic split can't be determined from the survey alone.
  Surveys can't tell us if a Meta touch was a paid ad or an organic post —
  this column preserves what the survey *does* know.
- `channel_hint` is a **committed canonical channel ID** from
  [funnel.md](../strategy/funnel.md). Set only when the survey answer
  commits to a single channel without paid/organic ambiguity
  (`creator_partnerships`, `forum_*`, `in_person_sighting`,
  `press_editorial`, `trade_shows`, `ai_search_recommendation`).
- For ambiguous platform answers (Instagram / Facebook / TikTok / Google /
  Fitwell-owned YouTube), `channel_hint` is left **NULL**. The attribution
  engine (link_method `self_report`) reads `platform_hint` together with
  `utm_attribution` and `order.landing_site` / `referring_site` to commit
  to a funnel.md channel.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `provider` | text | `grapevine` (default); multi-provider safe |
| `provider_response_id` | text | Idempotency key (provider-side response ID); unique with `provider` |
| `survey_code` | text | Grapevine survey code, e.g. `698cc69eca3e5` |
| `survey_name` | text | Human label for the survey |
| `surface` | text | `checkout_app_block`, `pos_fitwell_south`, etc. |
| `order_id` | uuid | FK → `order.id`. Nullable when the response arrived before the Shopify order webhook |
| `shopify_order_id` | text | Kept even when `order_id` is null so the backfill resolver can join later |
| `customer_email` | text | Denormalized from provider — supports late-arriving order matches |
| `question_key` | text | Defaults to `where_first_heard`; required |
| `raw_answer` | text | The chosen multiple-choice label, or the "Other" free-text when `is_other_text=true` |
| `is_other_text` | boolean | True when the respondent picked "Other" and provided free text |
| `platform_hint` | text | Survey-inferable platform: `instagram`, `facebook`, `tiktok`, `twitter`, `threads`, `youtube`, `google_search`, `duckduckgo`, `bing` |
| `channel_hint` | text | Committed canonical channel ID from `funnel.md`. NULL for ambiguous platform answers — attribution engine commits with UTM context |
| `channel_detail` | text | Specific creator/forum identifier (e.g. `watchchris`, `watchuseek`, `fitwell_owned`) |
| `responded_at` | timestamptz | When the survey was completed |
| `created_at` | timestamptz | Row insertion time |

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

### `klaviyo_list_growth_daily`

Daily snapshot of the newsletter list. Populated by `/api/cron/extract-klaviyo`. Migration `0020_fine_night_thrasher.sql`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `date` | timestamp | Day this row represents (UTC midnight) |
| `list_id` | text | Klaviyo list ID; uniqueness keyed on `(date, list_id)` |
| `list_name` | text | |
| `subscribers` | integer | Total profile count — recorded on today's row only (Klaviyo has no daily history) |
| `new_subscribers` | integer | Count of `Subscribed to List` events that day |
| `unsubscribes` | integer | Count of `Unsubscribed` events that day |

### `klaviyo_email_performance`

One row per campaign; upserted on `campaign_id` so engagement keeps accruing rather than appending a time series. Populated by `/api/cron/extract-klaviyo`.

| Column | Type | Notes |
|--------|------|-------|
| `campaign_id` | text | PK (Klaviyo's ID) |
| `campaign_name` | text | |
| `sent_at` | timestamp | From `/api/campaigns` |
| `sends` | integer | Recipients or delivered |
| `opens` | integer | Unique opens |
| `clicks` | integer | Unique clicks |
| `conversions` | integer | Unique conversion profiles (Placed Order metric) |
| `revenue_cents` | integer | `conversion_value` × 100 |
| `captured_at` | timestamp | Last sync that touched this row |

### `klaviyo_flow_attribution`

Per-order attribution from Klaviyo flows. **Phase 0 grain:** aggregate rows only — one row per flow per sync, `customer_id` and `order_id` NULL, sourced from `/api/flow-values-reports`. Per-order grain (rows with `customer_id` + `order_id` populated, from the Placed Order event stream) is a Phase 0.5 follow-up; the schema is shaped for it now to avoid a rewrite.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `flow_id` | text | Klaviyo flow ID |
| `flow_name` | text | |
| `customer_id` | text | FK → `customer.id`, NULL for aggregate rows |
| `order_id` | text | FK → `order.id`, NULL for aggregate rows |
| `attributed_revenue_cents` | integer | |
| `attributed_order_count` | integer | Conversion uniques (count of attributed orders for aggregate rows; 1 for per-order rows) |
| `touched_at` | timestamp | Sync time for aggregate rows; order time for per-order rows |

### `review`

Product reviews from external sources (Judge.me today; the `source` column leaves room for Stamped / Yotpo / Loox later). Populated by `/api/cron/extract-judgeme`. Migration `0048_light_zemo.sql`. Drives the advocate-stage detection in `getRetentionLoop`: a customer is an advocate iff they classify as outfitter AND `LOWER(review.reviewer_email) = LOWER(customer.email)`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `external_id` | text | Source's own review ID; upsert key |
| `source` | text | `'judgeme'` for now; future Stamped/Yotpo/Loox land here |
| `reviewer_email` | text | Lowercased + trimmed by the extractor for stable joins to `customer.email` |
| `reviewer_name` | text | |
| `rating` | integer | 1–5 |
| `title` | text | |
| `body` | text | |
| `verified` | boolean | Judge.me's verified-buyer flag; defaults `false` |
| `product_id` | text | Shopify product external ID |
| `product_handle` | text | Shopify product handle |
| `location` | text | Reviewer location string (API doesn't expose; CSV export does) |
| `review_date` | timestamp | `created_at` from Judge.me |
| `captured_at` | timestamp | When the row was first inserted |
| `updated_at` | timestamp | Refreshed on every upsert |

Unique index on `(source, external_id)` for upserts; indexes on `reviewer_email`, `rating`, `review_date`.

## Newsletter

Daily watch-industry brief ("The Micro-Adjust", working title). Written by the `newsletter/` engine (GitHub Actions, not Vercel cron). Migration `0057_faithful_the_spike.sql`. Subscriber list stays in Klaviyo — no subscriber table. Full engine doc: `specs/current/newsletter-engine.md`.

### `newsletter_source`

Feed registry, synced from the code-side registry (`newsletter/sources.ts`) by an idempotent upsert on `slug`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `slug` | text | Stable registry key (e.g. `hodinkee`); unique — join point to code so renames don't orphan articles |
| `name` | text | Display name |
| `category` | text | `editorial` / `b2b` / `community` / `auction` / `ir` / `microbrand` |
| `feed_url` | text | RSS/Atom URL; null if scrape-only |
| `scrape_url` | text | Landing page for the Playwright phase |
| `requires_playwright` | boolean | Cloudflare-guarded sources |
| `is_active` | boolean | `false` retires a source without losing history |
| `created_at` | timestamp | |

### `newsletter_article`

Every story considered — included **or** dropped (`dropped_reason` is the audit trail for dedup + triage decisions).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `source_id` | text | FK → `newsletter_source` |
| `url` | text | Normalized (tracking params stripped); unique — the cross-run dedup key |
| `title` | text | |
| `published_at` | timestamp | From the feed; nullable |
| `content_hash` | text | sha256(title + normalized url); catches re-emitted items |
| `summary` | text | Claude 2–3 sentence brief (included stories only) |
| `segment` | text | `luxury` / `mid` / `microbrand` / `vintage-auction` |
| `type` | text | `release` / `business` / `auction` / `community` |
| `image_url` | text | Vercel Blob URL once the image phase lands |
| `included_in_campaign_id` | text | FK → `newsletter_campaign`; null for dropped stories |
| `dropped_reason` | text | Null for included stories |
| `created_at` | timestamp | |

### `newsletter_campaign`

One row per send (the engine creates Klaviyo **drafts**; sending is manual while the voice settles).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK (UUID) |
| `klaviyo_campaign_id` | text | Unique; null only if the draft step failed after articles were written |
| `status` | text | `draft` / `sent` — to be flipped by the extract-klaviyo cron (not wired yet) |
| `sent_at` | timestamp | |
| `subject` | text | |
| `article_count` | integer | |
| `html_hash` | text | sha256 of the rendered HTML |
| `recipient_count` / `open_count` / `click_count` / `unsubscribe_count` | integer | Backfilled by extract-klaviyo (not wired yet) |
| `created_at` | timestamp | |

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

### `lead_followup_settings` (single-row config)

Two follow-up rules, edited in **Settings → Lead follow-ups**. One row,
`id="default"`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK, default `"default"` (single row) |
| `initial_draft_enabled` | boolean | Rule 1 — auto-draft an initial follow-up when a new lead is captured (gates only the on-capture draft, not the manual button). Default true |
| `enabled` | boolean | Rule 2 — the `sent-followups` cron; `false` = no-op |
| `nudge_after_days` | int | Rule 2 — days an emailed contact can go without replying before a threaded follow-up is drafted (default 14, 1–365) |
| `updated_at` | timestamp | |

> Two global rules for now (initial-draft + unanswered-email follow-up). A
> general, multi-rule + AI-assisted engine is planned — see
> `specs/work-plans/todo/lead-followup-rule-engine.md`.

### `production_settings` (single-row config)

Production-module settings, edited in **Settings → Supplier ETA reminders**.
One row, `id="default"`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK, default `"default"` (single row) |
| `eta_reminder_enabled` | boolean | Gates the `supplier-eta-reminders` cron; `false` = no-op. Default true |
| `eta_reminder_interval_days` | int | Min days between reminder emails to a supplier (default 2 = "every other day", 1–90) |
| `stage_checkin_enabled` | boolean | Gates the `stage-checkins` cron; `false` = no-op. Default true |
| `stage_checkin_thresholds` | jsonb (int[]) | % of a stage's estimated duration at which to prompt the supplier (default `[50,75,95]`, 1–3 ascending values 1–99) |
| `updated_at` | timestamp | |

The ETA cron uses `supplier.eta_reminder_last_sent_at` to enforce the per-supplier
cadence (reset to null once a supplier has no missing ETAs).

### `dashboard_settings` (single-row config)

Dashboard analytics settings, edited in **Settings → Returns**. One row,
`id="default"`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK, default `"default"` (single row) |
| `return_label_cost_cents` | int | Assumed per-return shipping-label cost (cents) the business eats, folded into the dashboard's Avg Return Value tile. An estimate — Shopify's API doesn't expose the real merchant-paid label cost. Default 700 (\$7), 0–100000 |
| `updated_at` | timestamp | |

### `production_stage_checkin`

One row per (stage instance × threshold) positive-control prompt sent to a
supplier. The supplier must affirmatively confirm on-track; silence or a
flagged delay (or an overrun with no confirmation) escalates to admins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK |
| `po_id` | text | FK → `production_po` (master), cascade |
| `supplier_id` | text | FK → `supplier` (the stage owner), cascade |
| `stage` | text | Stage `key` |
| `stage_entered_at` | timestamp | Earliest entry of the supplier's lines at this stage — the instance anchor (re-entering = a new instance) |
| `threshold_pct` | int | 50 / 75 / 95 — which checkpoint this row is |
| `prompted_at` | timestamp | |
| `responded_at` | timestamp? | Set when the supplier answers |
| `status` | text | `pending` \| `on_track` \| `at_risk` |
| `note` | text? | Supplier's optional delay note |
| `escalated_at` | timestamp? | When admins were notified for this instance |

Unique on `(po_id, supplier_id, stage, stage_entered_at, threshold_pct)` — each
threshold fires once per stage instance.

### `production_stage_def` (dynamic stages)

The pipeline's stages are now **data-driven** — admins add / rename / delete /
reorder them in the POs & Production "Setup" modal. Each row is a stage:

| Column | Type | Notes |
|--------|------|-------|
| `key` | text | PK — the stable identifier stored on line items / events / assignments |
| `label` | text | Display name (editable) |
| `position` | int | Pipeline order. Position 0 = **opening** (POs open here + sub-PO routing); last = **terminal** (reaching it triggers the Shopify receive) |
| `active` | boolean | `false` = soft-deleted (kept so historical timelines still render its name) |
| `created_at` / `updated_at` | timestamp | |

Seeded with the original 9 stages (`supplier_po → stamping → edm → polishing →
logo → plating → qc → packaging → complete`). The `current_stage` / `stage`
columns below are now `text` (a stage `key`), not the legacy `production_stage`
enum. The effective order/labels resolve via `getStageLabels()` /
`getStageOrder()` / `getStages()` in `src/lib/production/stage-labels.ts`
(cached, tag-invalidated on edit). Pure pipeline logic takes the ordered key
list as a parameter, so first/terminal are by **position**, not hardcoded keys.
Deleting a stage moves any line items still in it forward/back to the nearest
surviving stage. (Superseded the short-lived `production_stage_label` table.)

### `supplier`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK, generated |
| `name` | text | Required |
| `contact_name` | text | Nullable |
| `contact_email` | text | Nullable |
| `notes` | text | Nullable |
| `eta_reminder_last_sent_at` | timestamp | Nullable. Last time the `supplier-eta-reminders` cron emailed this supplier; drives the every-N-days cadence, reset to null when they have no missing ETAs |
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
| `origin` | text | `native` (default; created in this system) \| `shopify_pdf` (one-time backfill of historical Shopify POs parsed from PDF exports — see `scripts/import-shopify-pos.ts`). Lets the importer re-run idempotently against only its own rows |
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
| `company` | `name`, `contact_name?`, `contact_email?` (legacy free-text **fallback** contact), `primary_contact_kind?` + `primary_contact_id?` (the designated Primary Contact — one of the company's attached People, a lead or customer; pointer, no FK), `customer_id` (FK → customer, legacy single Shopify link), `price_tier_id` (FK → price_tier), `assigned_collection_ids` (text[]), `assigned_product_ids` (text[]), `deposit_percent` (real, default 0), `allow_wire_payment` (boolean, default false — when true the brand may choose "pay later by bank wire" at portal checkout instead of forced card checkout), `notes`. The displayed **Contact** resolves via `lib/crm/company-contact.ts`: primary person → single attached person → free-text → none |
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
| `current_stage` | text | Stage `key` (FK-ish into `production_stage_def`); default `supplier_po` |
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
| `stage` | text | Stage `key` entered (into `production_stage_def`) |
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
| `production_comment` | `po_id?`, `line_item_id?`, `author_user_id` (FK user), `body`, `created_at`, `updated_at?` (null until the author edits the note — drives the "(edited)" marker; notes are author-editable only) |
| `production_attachment` | `po_id?`, `line_item_id?`, `blob_url`, `filename`, `content_type`, `size_bytes`, `uploaded_by_user_id` (FK user), `uploaded_at` |
| `company_attachment` | `company_id` (FK company, cascade), `blob_url`, `filename`, `content_type`, `size_bytes`, `uploaded_by_user_id` (FK user), `uploaded_at`. Documents uploaded directly to a B2B company from its profile's **Activity** tab (which also lists the company's POs' attachments read-only) |

Attachments are stored in **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); the DB row
holds the blob URL + metadata.

### `user.supplier_id`

Nullable text column added to `user`; set for users with `role='supplier'` so the
supplier portal can scope queries to their own POs (Phase 3).

### Prototypes

A prototype is a **proposed SKU that doesn't exist in Shopify yet**. We gather
quotes from **multiple candidate vendors** (`prototype_supplier`, many-to-many)
and eventually **award** one (`prototype.supplier_id`), who makes physical
samples across one or more rounds until it's approved, at which point we record
the final SKU and create the real product in Shopify **manually** (no Shopify
write). There is no `product` table — SKU is the product identity everywhere —
so a prototype just carries the SKU strings. Admin-only (suppliers/companies
403). UI at `/modules/production/prototypes` (list) + `[id]` (detail w/ vendor
management + rounds), plus a Prototypes section on each supplier detail page.
Status/round constants, the approval helper, and `mergeCandidateVendorIds` live
in `src/lib/prototypes.ts`; DB writes in `src/lib/prototypes/service.ts`.
Migrations `0081_faulty_professor_monster`, `0087_fuzzy_shard` (candidate
vendors).

#### `prototype`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `name` | text | Required. Working name, e.g. "Titanium micro-adjust v2" |
| `proposed_sku` | text | Nullable. Planned SKU (may be undecided) |
| `final_sku` | text | Nullable. Recorded on approval — the value to create in Shopify |
| `supplier_id` | text | Nullable FK → `supplier` (`onDelete: set null`). The **awarded** vendor (chosen from the candidate set). Always also present as a `prototype_supplier` row |
| `status` | text | `concept` \| `in_development` \| `approved` \| `rejected` \| `on_hold`. Default `concept`. `approved` is only reachable via the promote action (requires `final_sku`) |
| `description` | text | Design intent / spec |
| `est_unit_cost_cents` | integer | Target unit cost (cents) |
| `approved_at` | timestamp | Stamped when status → `approved` |
| `notes` | text | |
| `created_at` / `updated_at` | timestamp | |

#### `prototype_supplier`

Candidate vendors for a prototype — the **RFQ recipient set** (many-to-many),
and where each vendor's **RFQ + quote** state lives. A prototype solicits quotes
from several vendors; the one finally chosen lands in `prototype.supplier_id`
(and stays a candidate). Removing the awarded vendor clears `supplier_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `prototype_id` | text | FK → `prototype` (cascade) |
| `supplier_id` | text | FK → `supplier` (cascade) |
| `rfq_sent_at` | timestamp | When we emailed this vendor an RFQ (via the PO email path). Null = not requested through the system |
| `quote_unit_cost_cents` | integer | Quoted per-unit price |
| `quote_lead_time_days` | integer | Quoted lead time |
| `quote_moq` | integer | Quoted minimum order quantity |
| `quote_setup_cost_cents` | integer | One-time tooling/sample cost |
| `quote_notes` | text | Free-text quote notes |
| `quote_received_at` | timestamp | Set when a quote is recorded → vendor reads as "quoted" |
| `created_at` | timestamp | |

Unique on `(prototype_id, supplier_id)` (idempotent membership); indexed on each
FK. Backfilled from existing `prototype.supplier_id` values on migration.
Per-vendor status is derived: `quote_received_at` → quoted, else `rfq_sent_at` →
RFQ sent, else candidate. Migrations `0087_fuzzy_shard` (table),
`0088_amused_ezekiel_stane` (RFQ/quote columns).

#### `prototype_round`

Iterative sample rounds (v1, v2…) — a physical batch from the vendor with its
own dates, cost, and feedback. Unique on `(prototype_id, round_number)`; the
round number is derived server-side as `max + 1`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `prototype_id` | text | FK → `prototype` (cascade) |
| `round_number` | integer | 1-based; unique per prototype |
| `status` | text | `requested` \| `in_production` \| `shipped` \| `received` \| `reviewed`. Default `requested` |
| `requested_at` / `expected_at` / `received_at` | date | Nullable |
| `sample_qty` | integer | Nullable |
| `unit_cost_cents` | integer | Quoted per-unit sample cost (cents) |
| `feedback` | text | What we thought / changes for the next round |
| `created_at` / `updated_at` | timestamp | |

#### `prototype_attachment`

Polymorphic photos/files — **exactly one** of `prototype_id` (prototype-level
"Other files": spec sheets, photos, PDFs) or `round_id` (sample photos) is set
(CHECK constraint). Mirrors `production_attachment`; stored in Vercel Blob.
(CAD files are linked, not uploaded — see `prototype_reference`.)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `prototype_id` | text | Nullable FK → `prototype` (cascade) |
| `round_id` | text | Nullable FK → `prototype_round` (cascade) |
| `blob_url`, `filename`, `content_type`, `size_bytes` | | Blob metadata |
| `uploaded_by_user_id` | text | FK → user |
| `uploaded_at` | timestamp | |

#### `prototype_reference`

CAD reference links — Autodesk Fusion ("AutoCAD Fusion") public share links.
We store the pasted link plus the resolved `?mode=embed` viewer URL so the
detail page can render an inline interactive 3D preview in an `<iframe>`.
Resolution + host-allowlist (`a360.co` / `*.autodesk360.com`) live in
`src/lib/prototypes/fusion.ts`. The iframe embed requires the
`frame-src https://*.autodesk360.com https://a360.co` allowance in the CSP
(`next.config.ts`). Migration `0082_nappy_sally_floyd`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `prototype_id` | text | FK → `prototype` (cascade) |
| `url` | text | The link as pasted (e.g. `https://a360.co/4vPkEVP`) |
| `embed_url` | text | Resolved viewer URL + `?mode=embed`; null if resolution failed (UI falls back to the raw link) |
| `title` | text | Optional human label |
| `created_at` | timestamp | |

### CAD Models (public 3D viewer)

A reusable CAD library that powers the spinnable 3D product viewer. A source
model — **OBJ or STL** (exported from Autodesk Fusion) — is auto-converted
**server-side in pure Node** to a **GLB** (`src/lib/cad/stl-to-glb.ts` — weld,
smooth normals, auto lay-flat; no Python/browser). `modelFileToGlb` picks the
parser by file type (extension, with a byte sniff for extension-less export
blobs). The converter **splits the mesh into connected components** and emits up
to four materials: `body` (recolorable polish), `body_brushed` (satin),
`body_cast` (bumpy cast), and `spring_bar` (always silver — the rod through the
pin, detected as the elongated non-largest piece). **The satin/cast surfaces come
from Fusion's per-face appearance names** (`usemtl …Satin`, `…Cast`) carried in
an OBJ — an STL is geometry-only, so an STL-sourced model renders fully polished
(only the spring bar is split out, geometrically). **Finishes**
(`src/lib/cad/finishes.ts`: Black/Yellow-Gold/Rose-Gold/Titanium glossy + Bead
Blasted Titanium/Steel) recolor `body`/`body_brushed`/`body_cast` at runtime in
`<model-viewer>`; the spring bar never changes. Geometry is shared: many SKUs
(color variants) point at one `cad_model`. GLBs are served from Vercel Blob (CSP
`connect-src` allows `*.public.blob.vercel-storage.com`; `<model-viewer>` needs
it). Admin UI is the **CAD Models** tab on Products (`/products/cad-models`); SKUs
link a model on `/products/[sku]` and push to Shopify 3D media. Migration
`0083_complete_ironclad`.

#### `cad_model`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `name` | text | Required |
| `fusion_url` | text | Optional Fusion share link (reference only; not the conversion source) |
| `source_stl_url` | text | Uploaded source model — OBJ or STL (Vercel Blob). Column name predates OBJ support |
| `source_filename` | text | Drives the OBJ-vs-STL re-convert decision |
| `glb_url` | text | Generated GLB (Vercel Blob) |
| `status` | text | `draft` \| `awaiting_export` (Fusion export fired, waiting on the email) \| `processing` \| `ready` \| `failed`. Default `draft` |
| `error_message` | text | Set when conversion fails |
| `vertex_count` / `triangle_count` | integer | Mesh stats after conversion |
| `export_requested_at` | timestamp | When "Generate from Fusion" fired the export (matches the email by timestamp) |
| `export_requested_by_user_id` | text | FK → user; whose inbox the cron reads the Autodesk email from |
| `expected_filename` | text | Reserved (unused — the Fusion doc name isn't reliably available server-side) |
| `created_at` / `updated_at` | timestamp | |

**Generate from Fusion (fully automated):** "Generate from Fusion" on a model
with a `fusion_url` fires Autodesk's STL export server-side (a plain GET to
`/shares/download/<id>/?toFormat=stl&email=<admin>` — no cookies needed) → status
`awaiting_export`. The `process-cad-exports` cron (every 10 min; the admin UI
also nudges it every 15s while waiting) finds the Autodesk "Download file" email
in the requester's Gmail (reusing the CRM's read access), extracts the signed
STL link, downloads it, and runs the same convert path. No Python, browser, or
manual STL handling. Logic in `src/lib/cad/fusion-export.ts` + `service.ts`.

#### `product_cad_model`

Links a product SKU to a CAD model and tracks where its 3D model is published.
Unique on `sku`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (text) | PK |
| `sku` | text | Product SKU (unique) |
| `cad_model_id` | text | FK → `cad_model` (`onDelete: set null`) |
| `published_to_website_at` | timestamp | In-app public per-SKU viewer is live |
| `shopify_product_id` / `shopify_media_id` | text | Shopify 3D media after an API push |
| `shopify_published_at` | timestamp | |
| `created_at` / `updated_at` | timestamp | |

## B2B Invoicing

The invoice document for a B2B order. Created either manually (Customers →
B2B Orders → New invoice) or generated from a production PO. Two-payment
deposit billing is built in (see `company.deposit_percent` above and
`computeDeposit()` in `lib/invoicing/invoicing.ts`). Sending an invoice
emails it via Resend and — when the brand is linked to a Shopify customer
and the app has `write_draft_orders` — pushes a Shopify draft order whose
hosted invoice URL is the customer's payment link.

| Table | Key columns |
|-------|-------------|
| `invoice` | `invoice_number` ("INV-00100", from `invoice_number_seq`), `company_id` (FK), `source_po_id?` (FK → production_po, links a PO-generated invoice), `status` (draft\|sent\|partial\|paid\|void), `payment_method` (card\|wire, default card — `wire` = customer chose pay-later-by-bank-wire at portal checkout; the admin invoice list shows "Awaiting bank wire" until paid), `issued_date`, `due_date?`, `subtotal_cents`, `discount_percent` (snapshotted at creation), `discount_cents`, `total_cents`, `deposit_percent?` / `deposit_cents` (per-invoice override; `null` = inherit `company.deposit_percent` at send time; snapshotted onto the invoice by `snapshotInvoiceDeposit` so terms don't drift if the brand default changes), `shopify_draft_order_id?` / `shopify_invoice_url?` (primary pay link — deposit's draft order when a deposit applies, else the full draft order), `shopify_balance_draft_order_id?` / `shopify_balance_invoice_url?` (second draft order created when marked fulfilled), `sent_at?`, `fulfilled_at?`, `paid_at?`, `deposit_paid_at?`, `balance_paid_at?` (granular vs. coarse status), `notes?` |
| `invoice_line_item` | `invoice_id` (FK, cascade), `sku`, `title`, `quantity`, `unit_price_cents` (retail), `shopify_product_id?`, `shopify_variant_id?` |
| `invoice_attachment` | `invoice_id` (FK, cascade), `blob_url`, `filename`, `content_type?`, `size_bytes?`, `uploaded_by_user_id?` — customer-supplied documents (e.g. their PDF purchase order) stored in Vercel Blob. Migration `0020_curvy_starfox` |

Per-invoice deposit override (the optional `depositPercent` on
create/update): `null` = inherit the brand's default at send; any number
including `0` = explicit override for this invoice only (waive, or set
higher for risk). The send route prefers `invoice.deposit_percent` over
`company.deposit_percent`; the edit form pre-fills from the invoice's
current value and the printable invoice document (`/print`, `/send`) shows
the resulting deposit terms paragraph using whichever applies.

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
| `influencer_order` | `order_number` ("GIFT-00100", from `influencer_order_number_seq`), `influencer_id` (FK), `status` (draft\|sent\|cancelled), `issued_date`, `content_due_date?` (the deadline), `published_at?` (set when content goes live), `affiliate_link?`, `subtotal_cents` (retail gift value), `discount_percent` (100), `total_cents` (0), `ship_to?` (jsonb snapshot — order-level default ship-to, mirrors `invoice.ship_to`), `shopify_draft_order_id?`, `shopify_invoice_url?`, `sent_at?`, `notes?`. Migration `0071_brief_nitro` adds `ship_to` |
| `influencer_order_line_item` | `order_id` (FK, cascade), `sku`, `title`, `quantity`, `unit_price_cents` (retail gift value), `shopify_product_id?`, `shopify_variant_id?`, `ship_to?` (jsonb — per-line split-fulfillment snapshot; null = ships to order default; mirrors `invoice_line_item.ship_to`). Migration `0071_brief_nitro` adds `ship_to` |
| `influencer_order_attachment` | `order_id` (FK → influencer_order, cascade), `blob_url`, `filename`, `content_type?`, `size_bytes?`, `uploaded_by_user_id?` — documents on a gifting order (gifting agreement, content brief) in Vercel Blob. Mirrors `invoice_attachment`; shares the attachments UI. Migration `0071_brief_nitro` |

Deadline status (`approaching` / `missed` / `hit` / `on_track` / `no_deadline`)
is derived from `content_due_date` + `published_at` by the pure helper
`deadlineStatus()` in `src/lib/influencer/influencer.ts` (unit-tested) — not
stored. A `user.influencer_id` column (for the future influencer portal,
`role='influencer'`) is **deferred to that phase's own migration** — it's
intentionally not added here, so the running app never queries a column the DB
doesn't have.

> **Unification in progress (2026-06-12, migration 0064):** the creator
> program below makes `creator` the single entity for content creators.
> `influencer.creator_id` and `influencer_order.creator_id` (both nullable)
> map this system onto it; the `influencer` table retires in a later
> contract migration once Oliver + Greg sign off. Decision log:
> `specs/strategy/creator-program.md`.

## Creator Program

The unified creator system (decision 2026-06-12 — single system, "brain and
hands"): the 735-creator scored prospect database from the May 2026 research
pass, plus links into the existing gifting machinery above. Scoring formulas
live in `specs/strategy/creator-scoring.md`, implemented as pure functions in
`src/lib/creators/scoring.ts` (shared by the CSV import and the future
nightly stats refresh). Import: `scripts/import-creators-csv.ts` (idempotent
on `(platform, handle)`).

| Table | Key columns |
|-------|-------------|
| `creator` | `name`, `primary_platform?` (ig\|yt\|tt), `status` (prospect\|contacted\|committed\|active\|burned\|archived), `vetting_status` (unreviewed\|approved\|rejected — human layer over the import; rejected = dumped, hidden but kept for dedup), `score_boost` (manual ± fit-points; effective rank = cross_platform_fit + score_boost, algorithmic score never mutated), `cross_platform_fit?` (ranking number, indexed), `burned_until_date?`, `customer_id?` (FK → customer — gifting recipient OR a "convert to customer" reclassification), `lead_id?` (FK → lead, indexed) + `company_id?` (FK → company, indexed) — set when a creator is reclassified as a B2B prospect (e.g. a strap brand surfaced by follower count) and archived; provenance + dedup so it can't be re-converted, `assigned_collection_ids?` (text[], portal), `source?` (indexed — import\|manual\|self_registration; null = legacy/import; self_registration = from the public `/creator-signup` form, lands unreviewed for the vetting queue), `phone?` (contact phone / WhatsApp — self-registration requires an email OR a phone; emails live in `creator_email`), `notes?` |
| `creator_platform` | `creator_id` (FK, cascade), `platform` + `handle` (**unique pair**, handle lowercased no-@), `profile_url?`, `bio?`, `data_source?` (apify_base\|full\|manual — score depths aren't comparable), `watch_score?`, `watch_confidence?`, `fit_score?`, `fit_score_partial` (renormalised, profile-only rows), `is_business_account?`, `is_verified?`, `external_url?`, `last_refreshed_at?` |
| `creator_stats_daily` | `creator_platform_id` (FK, cascade) + `snapshot_date` (**unique pair** — refresh cron upserts), `followers?`, `engagement_rate_pct?`, `avg_likes?`, `avg_comments?`, `avg_views?`, `last_post_date?`, `posts_in_window?` |
| `creator_email` | `creator_id` (FK, cascade) + `email` (**unique pair**, lowercased), `kind?` (business\|personal\|manager), `source?` (ig\|yt\|manual), `verified_at?`, `portal_access` (bool — successor to `influencer_contact`'s allowlist role) |
| `creator_post` | `creator_platform_id` (FK, cascade), `gift_order_id?` (FK → influencer_order — the sample this post fulfills), `post_url` (**unique**), `posted_at?`, `caption?`, `likes?`/`comments?`/`views?`, `mentioned_us`, `used_code`, `detected_at`, `source` (api_poll\|manual\|backfill) |
| `creator_discount_code` | `creator_id` (FK, cascade), `code` (**unique**, normalized lowercase — joins `order_discount_code.code` for redemptions/attributed revenue; no stored counters), `code_raw`, `shopify_price_rule_id?`, `shopify_discount_code_id?`, `percent_off?`, `expires_at?` |
| `creator_outreach` | `creator_id` (FK, cascade), `channel` (email\|ig_dm\|yt_comment\|manager\|other), `status` (no_reply\|replied\|negotiating\|agreed\|declined\|ghosted), `terms?`, `first_contact_at?`, `last_contact_at?`, `next_followup_at?` (indexed — drives the action cron). Status transitions recompute follow-up via `lifecycle.ts` rules |
| `creator_outreach_event` | `outreach_id` (FK, cascade), `occurred_at`, `direction` (out\|in\|note\|status), `summary`, `body?`, `created_by?` — the per-creator activity log |
| `creator_asset` | `creator_id` (FK, cascade), `gift_order_id?` (FK → influencer_order), `received_at`, `storage_url` (Drive/Dropbox pointer — MVP decision), `asset_type` (raw\|edited\|both), `rights_tier` (organic_only\|paid_30d\|paid_90d\|perpetual), `rights_expires_at?` (computed at insert, indexed — action cron warns ≤14d), `usage_notes?`, `uploaded_by?` |

**Sample logistics on `influencer_order`** (lifecycle chunk 1, migration
0067): `shopify_order_id?` (real order, linked by webhook via GraphQL
order→draftOrder lookup), `shipped_at?` / `delivered_at?` (stamped from
fulfillment webhooks, stamp-once so manual edits win), `tracking_number?`,
`tracking_url?`, `expected_platform?`. Pipeline stages (prospect →
outreach → agreed → sample_sent → evaluating → posted) are **derived** in
`src/lib/creators/lifecycle.ts` from status + these facts — never stored
(zero-drift).

## CRM (leads)

B2B leads from tradeshows + other sources. Lives under **Customers → Leads**
in the admin. Stage/status/persona/source values are `text` (validated at
the API layer in `src/lib/crm/constants.ts`) rather than `pgEnum`, so
changes in `specs/strategy/b2b-pipeline.md` don't require a migration each
time. `customer` and `company` are FK targets — never duplicated. A
"converted" lead writes `company_id` but **does not** materialize a
`customer` row (`shopify_id=null` would pollute the Shopify-synced table);
the `customer_id` FK only lands when a real Shopify order arrives via the
existing sync. (An earlier `tradeshow` table + `lead.tradeshow_id` were
dropped in migration 0026 — replaced by the editable `meeting_date`.)

| Table | Key columns |
|-------|-------------|
| `lead` | `captured_at` (default now), `captured_by_user_id?` (FK → user), `first_name?`, `last_name?` (both title-cased on save), `email?`, `phone?`, `title?`, `company_name?` (free-text; defaults to the email domain at capture), `address_line1?`, `address_line2?`, `city?`, `region?` (state/province/region), `postal_code?`, `country?` (all free-text so foreign/international addresses fit; auto-filled from card OCR when present), `stage` (text, default `'prospect'` — one of the 6 b2b-pipeline stages), `persona_tag?` (coarse buyer type: `watch_oem` / `strap_oem` / `buckle_clasp_oem` / `retailer` / `distributor`), `source_channel` (one of the 7 B2B entry channels), `meeting_date?` (date — when we met them, editable, defaults to today), `owner_user_id?` (FK → user), `notes?`, `card_image_url?` (latest card scan), `card_raw_text?` (raw Claude OCR fallback), `ocr_confidence?` (jsonb: per-field 0–1), `company_id?` (FK → company, set on conversion), `customer_id?` (FK → customer, populated only when a Shopify order materializes), `status` (`active`/`converted`/`dropped`, default `active` — `dropped` is the soft-delete state), `replied_at?` (set when the lead emails back — detected from the owner's Gmail or marked manually; stops the follow-up nudge) |
| `whatsapp_message` | `wa_message_id` (unique — dedup), `direction` (`inbound`/`outbound`), `from_phone`, `to_phone?`, `contact_name?`, `body?`, `received_at?`, `lead_id?` (FK → lead), `customer_id?` (FK → customer), `dismissed_at?`, `created_at`. Inbound WhatsApp messages via the Meta Cloud API webhook, matched to a lead/customer by **phone** (`lib/crm/phone-match.ts`, last-10-digits). Each new one raises a `whatsapp_message` notification (channel "WhatsApp"). Indexes: `lead_id`, `customer_id`, `received_at`, `dismissed_at` |
| `lead_card_image` | `lead_id` (FK → lead, cascade), `blob_url`, `content_type?`, `size_bytes?`, `uploaded_by_user_id?` (FK → user), `uploaded_at`. One row per scanned card — re-captures accumulate; `lead.card_image_url` mirrors the most recent |
| `supplier_lead` | Captured supplier business cards = potential new suppliers. Mirrors `lead`'s capture fields but for the supplier pipeline (no stage/source/persona/follow-up). `captured_at`, `captured_by_user_id?` (FK → user), `first_name?`, `last_name?` (title-cased on save), `email?`, `phone?`, `title?`, `company_name?`, `website?`, the six free-text address fields (`address_line1?`…`country?`), `supplier_type?` (**text[]** — multi-select supplier *personas*, stored as display strings; presets `Rapid Prototyping` / `Full Production` plus any free-text "Other" value. The capture dropdown is seeded from the presets ∪ every distinct value already stored across all rows, so a new "Other" persona sticks for everyone next time — see `GET /api/supplier-leads/types`. Column name kept singular; holds an array), `notes?`, `card_image_url?`, `card_raw_text?` (raw Claude OCR), `ocr_confidence?` (jsonb), `supplier_id?` (FK → supplier, set on promote), `status` (`active`/`converted`/`dropped`, default `active`). Promote (`POST /api/supplier-leads/[id]/promote`) inserts a real `supplier` row and flips `status='converted'`. Indexes: `email`, `status`, `supplier_id`, `captured_at` |
| `supplier_lead_card_image` | `supplier_lead_id` (FK → supplier_lead, cascade), `blob_url`, `content_type?`, `size_bytes?`, `uploaded_by_user_id?` (FK → user), `uploaded_at`. Mirror of `lead_card_image` for supplier leads; `supplier_lead.card_image_url` mirrors the most recent. Indexes: `supplier_lead_id`, `uploaded_at` |
| `lead_comment` | `lead_id` (FK → lead, cascade), `author_user_id?` (FK → user), `body`, `created_at`. Free-text timeline notes a team member adds to a lead over time (distinct from `lead.notes`, the single capture-time field). Surface in the lead **History** tab interleaved with drafted/sent follow-up emails. Indexes: `lead_id`, `created_at` |
| `customer_message` | `gmail_message_id` (unique — dedup), `thread_id?`, `mailbox_user_id?` (FK → user) + `mailbox_label?` (whose inbox), `from_email`, `from_name?`, `subject?`, `snippet?`, `received_at?`, `audience` (`b2b`/`consumer`/`supplier`/`influencer`), `customer_id?` (FK → customer), `company_id?` (FK → company), `supplier_id?` (FK → supplier), `influencer_id?` (FK → influencer), `dismissed_at?`, `created_at`. Inbound emails from existing **customers, suppliers, or influencers**, detected by the `customer-messages` cron (matches a sender's email to a stored `customer.email` / company contact / supplier contact / influencer contact email) across connected team inboxes. Surfaced at the top of the Customers B2B/Consumer tabs, the Suppliers list, and the Influencer List; `dismissed_at` hides one. Indexes: `audience`, `dismissed_at`, `received_at`, `customer_id`, `company_id`, `supplier_id`, `influencer_id` |
| `outbound_message` | recipient is exactly one of `lead_id?` / `customer_id?` / `supplier_id?` (all FK, cascade — `lead_id` now nullable since follow-ups can target any contact), `channel` (default `email`), `sequence_step` (int), `to_email?`, `cc?` + `bcc?` (comma-separated recipient lists, normalized; surfaced as Cc:/Bcc: headers on the Gmail send — editable per message in Compose + Next Steps), `subject?`, `body`, `status` (`draft`/`scheduled`/`sent`/`dismissed`), `thread_id?` + `in_reply_to?` (reply in the original Gmail thread on send), `generated_by_model?`, `created_by_user_id?` (FK → user — also the sender), `track_token` (unique — open-tracking pixel id, auto-set on insert), `open_count` (int default 0), `first_opened_at?` + `last_opened_at?` (stamped by the public `/api/track/open/[token]` pixel route — opens are APPROXIMATE: proxies pre-load → false opens, image-blockers → missed), `created_at`, `updated_at`, `sent_at?`, `scheduled_at?`. AI-drafted follow-ups queued in **Next Steps**; step 1 auto-drafted at lead capture, step 2 by the `sent-followups` cron when a sent email goes unanswered. Ad-hoc Compose replies are also logged here (status `sent`) so their opens are tracked |
| `sent_email` | tracks emails WE sent (scanned from Gmail Sent) to a known contact, for the `sent-followups` cron. `gmail_message_id` (unique — dedup), `thread_id?`, `message_id_header?` (RFC822, for In-Reply-To), `mailbox_user_id?` (FK → user), `from_email?`, `to_email`, `subject?`, `sent_at?`, recipient `lead_id?`/`customer_id?`/`supplier_id?` (FK, cascade), `replied_at?` (set when a reply is seen → stops follow-up), `followup_queued_at?` (dedup — one follow-up per original), `created_at` |

Indexes on `lead`: `email`, `stage`, `source_channel`, `status`,
`owner_user_id`, `company_id`, `customer_id`, `captured_at`. On
`lead_card_image`: `lead_id`, `uploaded_at`.

Email-domain matching: the capture-confirm step calls `GET /api/leads/match`
to link a lead to an existing company by email domain (free-provider domains
excluded) and to flag a duplicate active lead with the same email.

`admin_notification` also carries `mailbox_label` + `mailbox_email` (set by the
customer-message and lead-reply crons) so the notifications inbox can color-code
+ filter by team inbox the same way the messaging views do; null for
non-email notifications (PO handoffs etc.).

Every drafted message also raises an in-app `admin_notification`
("Draft follow-up ready for X") and shows in the lead detail **History**
tab. Drafts can be sent from Messages to Send via the admin's Gmail
(`gmail.send` scope) or "Mark as sent" if sent manually.

Customer messages: the `customer-messages` cron (`*/15`) scans each connected
team inbox for recent inbound mail and matches the sender's email to a stored
`customer` (consumer), company contact (b2b), supplier contact (supplier), or
influencer contact (influencer) — company wins, then supplier, then influencer,
then customer — recording new ones in
`customer_message` (dedup on `gmail_message_id`; internal/Fitwell senders are
never recorded — see `lib/crm/internal-email.ts`) and raising an
`admin_notification` (type `customer_message`, with an `href` deep-link to the
relevant Customers tab). New (undismissed) messages show at the top of the
Customers **B2B**/**Consumer** tabs with **Dismiss** + **Compose Message** (an
AI-drafted reply sent via the admin's Gmail). The sidebar **Customer** group
shows a blue dot while any are undismissed. Reply-compose + per-reply
**Dismiss** (persisted in `lead.dismissed_reply_ids`) are also on the lead
**Replies** tab.

Cross-mailbox email history: the lead's **Replies** tab
(`GET /api/leads/[id]/replies`) searches the contact's address across **every
connected team Google inbox** (all `account` rows with `provider='google'`
belonging to admins), not just the lead owner's — so a contact who emailed a
colleague still shows up, each email tagged with whose inbox it was found in.
The "new replies" dot uses the same cross-mailbox check. (Both no-op until the
Gmail API is enabled on the GCP project.)

Follow-up drafting: when a lead is created, the form fires
`POST /api/leads/[id]/draft-followup`, which uses Claude Sonnet 4.5 to draft
a follow-up email from the lead's notes and queues it in `outbound_message`.
The queue is reviewed/sent from **Customers → Messages to Send**. Two weeks
after the first follow-up is marked sent, the `lead-followups` cron drafts a
second (gentler) nudge — unless the lead replied (detected via the owner's
Gmail, which sets `lead.replied_at`).

Business-card capture: `POST /api/leads/scan-card` accepts an image
(JPEG/PNG/GIF/WebP, ≤10 MB), uploads it to Vercel Blob, then calls Claude
Sonnet 4.5 vision via a forced `record_business_card` tool_use (strict
JSON schema, Zod-validated, retries once on parse failure). The route
returns the extracted fields (incl. a split mailing address when printed on
the card) + per-field confidence + the raw read text;
the client follows up with `POST /api/leads` once the user has reviewed.
Helper lives at `src/lib/ai/anthropic.ts` — first server-side LLM
integration in the repo.

## Trade Shows

Booth-walking worklists for the shows we attend (EPHJ, Watches & Wonders B2B,
etc.). Lives at top-level **Trade Shows** in the admin. A show carries a vendor
list seeded from the prospecting spreadsheet; on the floor a rep marks each
vendor visited, scans/enters a business card (same Claude-vision OCR as the
lead/supplier-lead capture), records voice notes, and jots follow-up steps.
The vendor list is a *capture surface that feeds the existing CRM pipelines* —
a "Convert" action promotes a vendor into a `supplier_lead` (manufacturers) or
a `lead` (B2B customers), carrying the card data + booth context over and
linking the two. **Both** Convert actions are always offered regardless of the
vendor's `side` tag — many booths are a fit in both directions (`side` is an
editable hint that drives the list filter/badge, not a restriction). A vendor
that's a dead end either way can be hard-deleted (`DELETE` — cascades its voice
notes; any already-promoted lead/supplier-lead is left intact). Seeded by `scripts/seed-ephj-vendors.ts` (idempotent on
`(trade_show_id, company_name)`; refreshes seed fields, never touches on-floor
capture). Unlike the dropped `tradeshow` table (migration 0026), this models
the floor worklist, not a lead source tag — leads carry the show's channel via
`source_channel` instead.

| Table | Key columns |
|-------|-------------|
| `trade_show` | `name`, `location?`, `city?`, `country?`, `starts_on?` / `ends_on?` (date), `source_channel` (default `b2b_trade_shows_industry` — carried onto promoted customer leads), `notes?`, `status` (`active`/`archived`), `created_at`/`updated_at`. Indexes: `status`, `starts_on` |
| `trade_show_vendor` | `trade_show_id` (FK → trade_show, cascade), `booth?`, `company_name` (required), `category?` (free-text floor-plan category), `side` (`supplier`/`customer`/`both` — an editable hint that drives the list filter/badge; **not** a restriction — both Convert actions are always available), `priority` (bool — the seed sheet's "Flag"), `website?` + six free-text address fields (company-level), `seed_notes?` + `response_raw?` + `meeting_raw?` (raw pre-show intel, kept separate from on-floor `notes`), **on-floor capture:** `visited` (bool) + `visited_at?` + `visited_by_user_id?` (FK → user; stamped on first visit), `notes?` (booth/company notes), `sample_given` (bool, default false) + `sample_given_at?` (stamped on first yes — did we hand them a sample at the booth, either direction), **follow-up:** `follow_up_status` (`none`/`todo`/`scheduled`/`done`/`skip`), `follow_up_temp?` (`hot`/`warm`/`cold` — how the conversation is going; null = unrated), `lead_value?` (int 1–5 stars — how valuable the lead is or could be; null = unrated; both dimensions are side-agnostic since many vendors are `both`), `next_steps?`, **pipeline links:** `lead_id?` (FK → lead) + `supplier_lead_id?` (FK → supplier_lead, set on promote). The legacy single-contact columns (`contact_name?`/`email?`/`phone?`/`title?`) + `card_image_url?`/`card_raw_text?`/`ocr_confidence?` predate `trade_show_vendor_contact`; they were backfilled into a primary contact and are no longer written from the UI (kept, not dropped). Unique `(trade_show_id, company_name)` (the seed dedup key — booth alone isn't unique). Indexes: `trade_show_id`, `visited`, `side`, `lead_id`, `supplier_lead_id` |
| `trade_show_vendor_contact` | People met at a booth — one company often yields several (`vendor_id` FK → trade_show_vendor, cascade). `first_name?`, `last_name?` (title-cased on save), `title?`, `email?`, `phone?`, `notes?` (per-person), `is_primary` (bool — exactly one per vendor, enforced in the service; the primary is the contact used when promoting the vendor into a lead/supplier-lead), optional per-contact card scan (`card_image_url?` + `card_raw_text?` + `ocr_confidence?`), `captured_by_user_id?` (FK → user). Backfilled from the vendor's legacy contact columns by `scripts/backfill-trade-show-contacts.ts`. Indexes: `vendor_id`, `email` |
| `trade_show_vendor_voice_note` | `vendor_id` (FK → trade_show_vendor, cascade), `blob_url` (audio in Vercel Blob), `content_type?`, `size_bytes?`, `duration_sec?` (real), `transcript?` (on-device Web Speech API dictation captured while recording — no external STT service), `recorded_by_user_id?` (FK → user), `created_at`. Multi-row so several memos hang off one vendor. Indexes: `vendor_id`, `created_at` |
| `trade_show_vendor_comment` | The single **shared activity thread** for a booth-met entity. `vendor_id` (FK → trade_show_vendor, cascade), `author_user_id?` (FK → user), `body`, `created_at`. The vendor is the hub linking a customer `lead` + `supplier_lead`, so a note here is visible on **all** linked detail pages (booth, customer lead, supplier lead) — "write once, see everywhere". Mirrors `lead_comment` but spans the linked records. The unified **Activity** panel (`src/components/crm/linked-activity.tsx`, fed by `getEntityActivity` in `src/lib/tradeshows/activity.ts`) merges these comments + booth voice notes + the customer lead's `lead_comment`s + events (visited / sample / converted) + email/WhatsApp from **both** the customer lead (`/api/leads/[id]/replies`) and the supplier side (`/api/inbound` by the supplier lead's email + promoted-supplier id), deduped by message id, into one newest-first timeline. Indexes: `vendor_id`, `created_at` |

## PWA / Push Notifications

The admin portal is an installable PWA (manifest at `/manifest.webmanifest`,
service worker at `/sw.js`). Web Push lets the in-app notification surface reach
admins' phones.

### `push_subscription`

One row per (admin user, device/browser). Created when an admin taps **Enable
notifications on this device** in Settings; deleted on disable or when the push
service reports the endpoint as gone.

- `user_id` → `user.id` (cascade delete).
- `endpoint` — the browser's push-service URL; **unique**, the dedup key
  (re-subscribing the same browser upserts on it).
- `p256dh` / `auth` — the subscription's encryption keys (from the browser
  `PushSubscription`).
- `user_agent` — captured at subscribe time so the device list is recognizable.
- `last_used_at` — bumped on subscribe; dead endpoints (404/410 on send) are
  pruned automatically by `src/lib/push/send.ts`.

Push is wired to the existing in-app notification path: every admin-bound
`admin_notification` insert goes through `createAdminNotification()`
(`src/lib/notifications/admin-notify.ts`), which fans the alert out to all
registered devices via `broadcastWebPush()`. Supplier-bound notification types
(see `SUPPLIER_NOTIFICATION_TYPES`) are skipped — push mirrors the *admin* inbox
1:1. Requires the `VAPID_*` env vars; unset → push silently no-ops. Suppliers and
B2B-company users can't register subscriptions (the subscribe route 403s them).

## Open Questions

- [ ] Do we need a `product` table, or is Shopify sufficient as source of truth for product catalog?
- [ ] Should `utm_attribution` store raw cookie values or parsed?
- [ ] Partitioning strategy for analytics staging tables as they grow?
- [x] Use `uuid` vs `serial` for PKs — decided uuid for distributed-friendly inserts
