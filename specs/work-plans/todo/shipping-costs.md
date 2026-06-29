# Shipping Costs & Shipment Tracking

## Context

We buy and print shipping labels through Shopify's native shipping flow. We want
those shipments — and what we paid the carrier for each — in our own DB, matched
to orders, so we can compute true per-order margin, carrier mix, and ship-time.

Two research passes (2026-06-29) established the hard constraint that shapes this
work:

- **Shipment tracking** (carrier, service, tracking #, ship date) **is** available
  per-order via Shopify — it already rides in the REST order payload's
  `fulfillments[]` array, so syncing it costs no extra API calls.
- **The carrier cost of a label is NOT exposed by the Shopify Admin API** (neither
  GraphQL `Fulfillment`/`FulfillmentOrder` nor REST). Verified against shopify.dev
  and an open Shopify community feature request. The cost lives only in Shopify's
  account-billing system (Settings → Billing), which has no API.
  - The one API-adjacent path — `ShopifyPaymentsAccount.balanceTransactions` —
    is **gated behind the `read_shopify_payments` scope we don't hold** (probe on
    2026-06-29 returned "Access denied … Required access: read_shopify_payments"),
    requires an app redeploy to test, and even then doesn't map cleanly per order.
    Rejected.

**Decision (Tom, 2026-06-29):** auto-sync the tracking layer now; ingest cost via
the **Shopify billing CSV export** (Settings → Billing → Export bills), which
breaks shipping charges down by order. Authoritative (it's exactly what we were
charged), no scope change / redeploy, at the cost of a periodic manual upload.

Note: `order.total_shipping` already in the schema is shipping **charged to the
customer**, a revenue figure — NOT our cost. Different number; leave it alone.

## Dependencies

- `specs/invariants/data-sync.md` — idempotent upsert, additive, Shopify-is-truth.
  The cost columns are an explicit **exception** to "Shopify is source of truth":
  they're sourced from the billing CSV and must never be clobbered by the every-2h
  Shopify resync. Protected exactly like `order.leadId` (kept out of the upsert
  conflict-update set).
- `src/lib/shopify/sync.ts` `upsertOrder()` — the auto tracking sync hooks in here.
- `src/types/shopify.ts` `ShopifyOrder.fulfillments[]` — extend with carrier/service.
- Phase 3 is **blocked on a real sample CSV** from Tom — don't guess the format.

## Scope

**In:** a `shipment` table FK'd to `order`; auto-sync of fulfillment tracking from
the existing order payload; a billing-CSV importer for label cost; surfacing
shipment + cost in the admin order view and a true-margin number.

**Out:** real-time cost (Shopify doesn't provide it); switching label-buying to a
3PL with a cost API (Shippo/EasyPost/ShipStation) — revisit only if the CSV
workflow proves too painful; the `read_shopify_payments` automatic path.

## Schema (final — two tables)

> **Revised after seeing the real CSV.** The original sign-off design put cost
> columns on `shipment`. The export turned out to be order-grain with no tracking
> number and multi-charge orders, so cost moved to its own `shipping_charge`
> table and `shipment` became tracking-only. See the Phase 3 grain finding below.
> The canonical, current definitions live in `src/lib/schema.ts` and are
> documented in `specs/current/schema.md`:
>
> - **`shipment`** — per-fulfillment tracking (carrier, service, tracking, ship
>   date), upserted on `shopify_fulfillment_id` by the Shopify sync.
> - **`shipping_charge`** — per-billing-line cost from the CSV, FK to `order`
>   (nullable), idempotent delete-replace by `bill_number`. Cost per order =
>   `SUM(amount_cents)`.

## Implementation Phases

### Phase 1: Schema + migration ✅ (2026-06-29)
- [x] Add `shipment` + `shipping_charge` tables to `src/lib/schema.ts` + relations
- [x] `npm run db:generate` → `drizzle/migrations/0095_happy_drax.sql` (additive,
      two `CREATE TABLE`s). Migration regenerated cleanly after the Phase 3 grain
      pivot (the unshipped `0095_huge_black_bolt` was discarded; only tom-dev had it).
- [x] `npm run db:migrate` (applied to tom-dev branch). **NOT yet applied to prod.**
- [x] Update `specs/current/schema.md`
- [x] Tests: type-clean (`tsc` — the only 2 tsc errors are pre-existing, in
      unrelated CAD files `model-viewer.tsx` / `stl-to-glb.ts`)

### Phase 2: Auto-sync fulfillment tracking → shipment ✅ (2026-06-29)
- [x] Extended `ShopifyOrder.fulfillments[]` type with `tracking_company`, `service`
- [x] `upsertOrder()` calls `syncShipments()` after refund lines: **upserts** each
      fulfillment on `shopifyFulfillmentId` (tracking columns only).
- [x] Pure `shipmentTrackingRows()` extracted (mirrors `refundLineRows`): carrier
      from `tracking_company`; tracking from `tracking_number` / `tracking_numbers[0]`;
      `shippedAt` from `created_at`.
- [x] Unit tests (5, in `sync.test.ts`) + integration test (in
      `sync.integration.test.ts`, passed vs real Postgres on tom-dev): new
      fulfillment inserts a shipment; re-sync refreshes tracking without
      duplicating; multi-fulfillment → multi rows.

### Phase 3: Billing CSV importer ✅ (2026-06-29)

**Grain finding (from the real CSV):** the export is keyed by **order, not
fulfillment**, has **no tracking number**, and 101/1207 orders (~8%) carry
multiple `shipping_fee` charges (reships/corrections/split labels). So cost
**cannot** live on the per-fulfillment `shipment` row. → **Schema revised:** cost
columns removed from `shipment` (now tracking-only); new **`shipping_charge`**
table at order grain. Shipping cost per order = `SUM(amount_cents)`. Migration
`0095` regenerated cleanly (was unshipped) to `0095_happy_drax` creating both
tables. `managed_markets_shipping_fee` (97 rows) has a blank Order column on the
export → out of scope (documented gap; can't attribute per-order).

- [x] Parser + importer: `src/lib/shopify/billing-csv.ts` — `parseBillingCsv()`
      (pure), `importShippingCharges()` (db). Keeps `shipping_fee` rows; matches
      `FBC#### → order.shopify_order_number`; parses service/destination from
      description; cents via `toCents`.
- [x] Idempotent: **delete-replace scoped by Bill #** (bills immutable → safe on
      overlapping exports). Re-import on dev gave identical totals (not doubled).
- [x] Unmatched charges recorded with `order_id = null` (orderName kept) + counted
      and surfaced in the run report, never silently dropped.
- [x] Runner `scripts/import-shipping-costs.ts` (`--dry` to preview match rate).
- [x] Tests: 12 unit (`billing-csv.test.ts`) + 3 integration
      (`billing-csv.integration.test.ts`, passed vs real Postgres): matching,
      unmatched→null, per-bill idempotency, cross-bill isolation.
- [x] Validated on the real 14-month export: 1327 charges / 45 bills,
      **$14,826.41** total. (Dev is a stale/partial branch so only 660 orders
      matched there = $7,713.64; real match rate to be measured on prod.)

### Phase 4: Surface + true margin (not started)
- [ ] Admin order view: shipment(s) — carrier, tracking link, ship date — plus the
      order's shipping cost = `SUM(shipping_charge.amount_cents)`.
- [ ] Carrier-mix + ship-time analytics from `shipment`; shipping-cost column from
      `shipping_charge`.
- [ ] Wire shipping cost into the margin calc alongside COGS (`src/lib/cogs/`):
      revenue − COGS − `SUM(shipping_charge)` − refunds.
- [ ] Update the AI assistant glossary (`src/lib/ai/assistant/glossary.ts:78` says
      "shipping cost isn't recorded" — no longer true once the prod import lands).
- [ ] Update `specs/current/integrations.md` + `data-flows.md`.

### Phase 2.5: Historical backfill (small, do alongside Phase 3)
- [ ] The auto-sync only writes shipments when an order is (re)synced, so only
      orders touched by the 2h cron's lookback window get rows going forward.
      Existing/older orders need a one-time backfill: re-fetch each order's
      `fulfillments[]` and run the same upsert. Mirror an existing backfill script
      (e.g. `scripts/backfill-refund-lines.ts`, which re-fetches order detail).

## To ship to prod (next session)

1. Apply migration `0095_happy_drax` to **production** first
   (`npm run db:pending:prod` to confirm, then `npm run db:migrate:prod`) — it's
   additive (two new tables), safe.
2. Commit + push (Vercel deploys; new code + tables now in parity).
3. Backfill shipment tracking on existing orders (Phase 2.5).
4. Run the importer against prod with the real CSV:
   `dotenv -e .env.production.local -- tsx scripts/import-shipping-costs.ts <csv>`
   (use `--dry` first to read the real match rate — dev's 660/1207 understates it
   because dev is a partial branch).
5. Establish a cadence: re-export the bill CSV monthly and re-run the importer
   (idempotent, so re-importing an overlapping range is safe).

## Notes

- `managed_markets_shipping_fee` (97 rows) and duties/insurance lines have no
  order on the CSV → not imported. If per-order international/duty cost matters
  later, that needs a different source.
- Unmatched charges (order not in our DB at import time) are stored with
  `order_id = null`; re-running the import after the order syncs links them.
- `service` is often "Manual" on `shipment` (labels created via the manual flow,
  not a fulfillment service) — expected; carrier + tracking + date still land.
