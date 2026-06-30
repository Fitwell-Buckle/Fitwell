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

### Phase 4: Surface + true margin (in progress)

**MUST segment B2B vs D2C (Tom, 2026-06-29).** Shipping economics differ wildly by
channel — a single B2B order had a $246.24 freight charge; D2C ground labels are
~$5. A blended "avg shipping cost $12.28/order" is misleading and must never be
shown as a D2C figure. Every shipping-cost / margin metric in this phase is
reported **per channel** (blended kept only as an explicit "all orders" line).

**Channel-derivation rule (corrected 2026-06-30, per Tom):** wholesale & OEM
orders begin as Shopify draft orders before converting, so the rule is **online
store (`web`) = D2C, `pos` = trade show, EVERYTHING ELSE = B2B** (draft orders,
app/channel sources, etc.) — not just `shopify_draft_order`. `is_sample` is its
own bucket. Canonical helper: `src/lib/orders/channel.ts`. (Earlier draft-only
rule under-counted B2B.) Existing dashboards still inline their own CASE —
adopting this helper across them is a separate cleanup.

- [x] Channel classifier `src/lib/orders/channel.ts` (pure `classifyChannel` +
      `orderChannelSql`), unit-tested (5 cases).
- [x] Shipping-cost loader `src/lib/shipping/shipping-cost.ts`:
      `getShippingCostByChannel(range)` (sums per order_id, then groups by channel
      — no line-item fan-out) + `getShippingCostByOrderIds(ids)`. Integration-tested
      vs real Postgres (channel grouping, per-order sums, multi-charge orders).
- [x] Admin orders list (`(admin)/orders/page.tsx`): Channel badge + per-order
      "Shipping cost" column.
- [x] Margin page (`(admin)/cogs/page.tsx`): "Shipping cost by channel" table
      (orders / total / avg-per-order per channel + a muted blended row with a
      "don't quote as D2C" caption).
- [x] AI assistant glossary updated (`glossary.ts`): shipping cost now recorded;
      instructs the assistant to report it per channel, never blended as D2C.
- [x] **True (contribution) margin per channel** — `src/lib/margin/` (`compute.ts`
      pure rollup + `true-margin.ts` loader, mirroring the cogs split). Order-grain:
      revenue − COGS − shipping − refunds, grouped by channel. Surfaced as the
      "True margin by channel" table on `/cogs` (replaced the shipping-only table).
      Tests: 4 unit + 1 integration vs real Postgres.
      - **COGS-coverage gating (added after Tom caught inverted margins):** with
        COGS=$0, contribution = revenue − shipping − refunds and the margin % just
        measures shipping/refund efficiency — which ranked B2B (92%) *above* D2C
        (81%), the opposite of reality (B2B sells the same buckle at a lower price,
        so its true margin MUST be lower). Fix: `marginPct` is now **null unless a
        channel's revenue is FULLY costed**, and the page withholds Contribution +
        Margin % entirely when COGS coverage is 0 (amber banner explains; Revenue/
        Shipping/Refunds still shown — those are real). Unit test asserts that once
        costed, a lower B2B price yields a lower margin% than D2C.
      - **COGS recognition is the real blocker (prod):** 13 production POs exist,
        11 PO lines carry unit costs — but **0 POs are marked received and 0 source
        POs are paid-invoiced**, so `getAverageUnitCostBySku()` (received-or-paid
        only) recognizes nothing. COGS lights up automatically once POs are marked
        received / invoices paid. Open decision for Tom/Greg: keep strict
        recognition (wait for receipt) vs add a per-SKU **standard cost** for margin
        analysis on already-shipped orders. No code change until decided.
- [x] **Standard cost wired in (2026-06-30, Tom's costs):** stainless buckle
      $3.60, titanium $4.50, tang $1.00, spring bar $0.01, bundle 3×. Classifier
      `src/lib/cogs/standard-cost.ts` keys off product TITLE (codes are
      inconsistent — `-SB-` is a bead-blast buckle or a spring bar depending on the
      SKU). `src/lib/cogs/cost-basis.ts` blends recognized PO cost (wins) with
      standard cost; used by both `getCogs` and the margin loader. Prod coverage
      D2C 100% / B2B ~93% / TS 100%.
- [x] **Net-revenue fix (2026-06-30 — the big one):** B2B wholesale discounts are
      applied at the ORDER level, so summing retail line prices overstated B2B
      revenue 2.3× ($309k vs the real $138k subtotal). Margin now uses
      `order.subtotal_price` (net of discounts), computed at order grain with
      per-order COGS. **Result: B2B 59% contribution / 75.9% gross vs D2C 70.5% /
      90.5%** — B2B correctly below D2C, matching the wholesale economics. Margin %
      gate lowered to 90% coverage (B2B has ~7% custom-money/tooling lines).
      NOTE: the per-SKU COGS table still uses gross line revenue (per-SKU grain
      can't net order-level discounts) — a known remaining inconsistency to flag.
- [ ] Carrier-mix + ship-time analytics from `shipment` (lower priority).
- [ ] Verify the assistant's read-only DB role has SELECT on `shipment` /
      `shipping_charge` (else AI shipping queries error). Update
      `specs/current/integrations.md` + `data-flows.md`.

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
5. Establish a cadence: re-export the bill CSV weekly and re-import.

### In-app upload + weekly reminder (2026-06-30, Tom's request)
- `POST /api/shipping-costs/import` — admin-auth route; accepts the billing CSV
  (multipart), runs the same `parseBillingCsv` + `importShippingCharges` lib as the
  CLI (idempotent, delete-replace by Bill #). Returns the import summary.
- Upload modal (`src/components/shipping/shipping-cost-upload-modal.tsx`) — file
  picker → POST → result. Shared by:
  - **Weekly reminder banner** in the admin layout — shows when the last import is
    ≥ `SHIPPING_IMPORT_STALE_DAYS` (7) old (or never), measured from
    `max(shipping_charge.imported_at)` so it clears on upload. Dismissible per
    session. `src/lib/shipping/import-status.ts` + `shipping-cost-reminder.tsx`.
  - **Anytime "Upload shipping costs" button** on `/cogs` (so mid-week uploads
    don't depend on the banner). `shipping-cost-upload-button.tsx`.
- So Tom no longer needs the CLI; the `scripts/import-shipping-costs.ts` path
  remains for bulk/historical backfills.

## Notes

- `managed_markets_shipping_fee` (97 rows) and duties/insurance lines have no
  order on the CSV → not imported. If per-order international/duty cost matters
  later, that needs a different source.
- Unmatched charges (order not in our DB at import time) are stored with
  `order_id = null`; re-running the import after the order syncs links them.
- `service` is often "Manual" on `shipment` (labels created via the manual flow,
  not a fulfillment service) — expected; carrier + tracking + date still land.
