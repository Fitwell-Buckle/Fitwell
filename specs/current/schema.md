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

### `lead_followup_settings` (single-row config)

The one global lead follow-up rule, edited in **Settings → Lead follow-ups** and
read by the `/api/cron/lead-followups` cron. One row, `id="default"`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK, default `"default"` (single row) |
| `enabled` | boolean | `false` = the nudge cron no-ops |
| `nudge_after_days` | int | Days after the first follow-up was sent before drafting a 2nd (default 14, 1–365) |
| `updated_at` | timestamp | |

> Intentionally a single rule for now. A general, multi-rule + AI-assisted
> engine is planned — see `specs/work-plans/todo/lead-followup-rule-engine.md`.

### `production_stage_def` (dynamic stages)

The pipeline's stages are now **data-driven** — admins add / rename / delete /
reorder them in the Production Summary "Setup" modal. Each row is a stage:

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
| `production_comment` | `po_id?`, `line_item_id?`, `author_user_id` (FK user), `body`, `created_at` |
| `production_attachment` | `po_id?`, `line_item_id?`, `blob_url`, `filename`, `content_type`, `size_bytes`, `uploaded_by_user_id` (FK user), `uploaded_at` |

Attachments are stored in **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); the DB row
holds the blob URL + metadata.

### `user.supplier_id`

Nullable text column added to `user`; set for users with `role='supplier'` so the
supplier portal can scope queries to their own POs (Phase 3).

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
| `invoice` | `invoice_number` ("INV-00100", from `invoice_number_seq`), `company_id` (FK), `source_po_id?` (FK → production_po, links a PO-generated invoice), `status` (draft\|sent\|partial\|paid\|void), `issued_date`, `due_date?`, `subtotal_cents`, `discount_percent` (snapshotted at creation), `discount_cents`, `total_cents`, `deposit_percent?` / `deposit_cents` (per-invoice override; `null` = inherit `company.deposit_percent` at send time; snapshotted onto the invoice by `snapshotInvoiceDeposit` so terms don't drift if the brand default changes), `shopify_draft_order_id?` / `shopify_invoice_url?` (primary pay link — deposit's draft order when a deposit applies, else the full draft order), `shopify_balance_draft_order_id?` / `shopify_balance_invoice_url?` (second draft order created when marked fulfilled), `sent_at?`, `fulfilled_at?`, `paid_at?`, `deposit_paid_at?`, `balance_paid_at?` (granular vs. coarse status), `notes?` |
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
| `influencer_order` | `order_number` ("GIFT-00100", from `influencer_order_number_seq`), `influencer_id` (FK), `status` (draft\|sent\|cancelled), `issued_date`, `content_due_date?` (the deadline), `published_at?` (set when content goes live), `affiliate_link?`, `subtotal_cents` (retail gift value), `discount_percent` (100), `total_cents` (0), `shopify_draft_order_id?`, `shopify_invoice_url?`, `sent_at?`, `notes?` |
| `influencer_order_line_item` | `order_id` (FK, cascade), `sku`, `title`, `quantity`, `unit_price_cents` (retail gift value), `shopify_product_id?`, `shopify_variant_id?` |

Deadline status (`approaching` / `missed` / `hit` / `on_track` / `no_deadline`)
is derived from `content_due_date` + `published_at` by the pure helper
`deadlineStatus()` in `src/lib/influencer/influencer.ts` (unit-tested) — not
stored. A `user.influencer_id` column (for the future influencer portal,
`role='influencer'`) is **deferred to that phase's own migration** — it's
intentionally not added here, so the running app never queries a column the DB
doesn't have.

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
| `lead` | `captured_at` (default now), `captured_by_user_id?` (FK → user), `first_name?`, `last_name?` (both title-cased on save), `email?`, `phone?`, `title?`, `company_name?` (free-text; defaults to the email domain at capture), `address_line1?`, `address_line2?`, `city?`, `region?` (state/province/region), `postal_code?`, `country?` (all free-text so foreign/international addresses fit; auto-filled from card OCR when present), `stage` (text, default `'prospect'` — one of the 6 b2b-pipeline stages), `persona_tag?` (coarse buyer type: `watch_oem` / `strap_oem` / `retailer` / `distributor`), `source_channel` (one of the 7 B2B entry channels), `meeting_date?` (date — when we met them, editable, defaults to today), `owner_user_id?` (FK → user), `notes?`, `card_image_url?` (latest card scan), `card_raw_text?` (raw Claude OCR fallback), `ocr_confidence?` (jsonb: per-field 0–1), `company_id?` (FK → company, set on conversion), `customer_id?` (FK → customer, populated only when a Shopify order materializes), `status` (`active`/`converted`/`dropped`, default `active` — `dropped` is the soft-delete state), `replied_at?` (set when the lead emails back — detected from the owner's Gmail or marked manually; stops the follow-up nudge) |
| `whatsapp_message` | `wa_message_id` (unique — dedup), `direction` (`inbound`/`outbound`), `from_phone`, `to_phone?`, `contact_name?`, `body?`, `received_at?`, `lead_id?` (FK → lead), `customer_id?` (FK → customer), `dismissed_at?`, `created_at`. Inbound WhatsApp messages via the Meta Cloud API webhook, matched to a lead/customer by **phone** (`lib/crm/phone-match.ts`, last-10-digits). Each new one raises a `whatsapp_message` notification (channel "WhatsApp"). Indexes: `lead_id`, `customer_id`, `received_at`, `dismissed_at` |
| `lead_card_image` | `lead_id` (FK → lead, cascade), `blob_url`, `content_type?`, `size_bytes?`, `uploaded_by_user_id?` (FK → user), `uploaded_at`. One row per scanned card — re-captures accumulate; `lead.card_image_url` mirrors the most recent |
| `lead_comment` | `lead_id` (FK → lead, cascade), `author_user_id?` (FK → user), `body`, `created_at`. Free-text timeline notes a team member adds to a lead over time (distinct from `lead.notes`, the single capture-time field). Surface in the lead **History** tab interleaved with drafted/sent follow-up emails. Indexes: `lead_id`, `created_at` |
| `customer_message` | `gmail_message_id` (unique — dedup), `thread_id?`, `mailbox_user_id?` (FK → user) + `mailbox_label?` (whose inbox), `from_email`, `from_name?`, `subject?`, `snippet?`, `received_at?`, `audience` (`b2b`/`consumer`/`supplier`/`influencer`), `customer_id?` (FK → customer), `company_id?` (FK → company), `supplier_id?` (FK → supplier), `influencer_id?` (FK → influencer), `dismissed_at?`, `created_at`. Inbound emails from existing **customers, suppliers, or influencers**, detected by the `customer-messages` cron (matches a sender's email to a stored `customer.email` / company contact / supplier contact / influencer contact email) across connected team inboxes. Surfaced at the top of the Customers B2B/Consumer tabs, the Suppliers list, and the Influencer List; `dismissed_at` hides one. Indexes: `audience`, `dismissed_at`, `received_at`, `customer_id`, `company_id`, `supplier_id`, `influencer_id` |
| `outbound_message` | `lead_id` (FK → lead, cascade), `channel` (default `email`), `sequence_step` (int, default 1 — `1`=initial follow-up, `2`=two-week nudge), `to_email?`, `subject?`, `body`, `status` (`draft`/`scheduled`/`sent`/`dismissed`, default `draft`), `generated_by_model?`, `created_by_user_id?` (FK → user — also the sender for a scheduled send), `created_at`, `updated_at`, `sent_at?`, `scheduled_at?` (when `status='scheduled'`: the `send-scheduled` cron sends once it passes). AI-drafted follow-up emails queued in the "Next Steps" view; step 1 is auto-drafted when the lead is created, step 2 by the `lead-followups` cron when there's no reply after the configured wait |

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

## Open Questions

- [ ] Do we need a `product` table, or is Shopify sufficient as source of truth for product catalog?
- [ ] Should `utm_attribution` store raw cookie values or parsed?
- [ ] Partitioning strategy for analytics staging tables as they grow?
- [x] Use `uuid` vs `serial` for PKs — decided uuid for distributed-friendly inserts
