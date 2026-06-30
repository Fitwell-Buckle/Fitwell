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
reported **per channel** (and the blended total kept only as an explicit "all
orders" line, never the headline D2C number). **Channel-derivation rule (confirmed):** no B2B order tag / `order.company_id`
exists — the signal is `order.source_name` (matches the dashboard's `segmentExpr`):
`shopify_draft_order`=B2B, `pos`=trade show, else (`web`/NULL/legacy)=D2C; plus
`is_sample=true` as its own bucket. Canonical helper: `src/lib/orders/channel.ts`
(`classifyChannel()` + `orderChannelSql`). Existing dashboards still inline their
own CASE — adopting this helper across them is a separate cleanup (not in scope).

**Real prod split (validated 2026-06-29):** D2C avg $10.98/order, B2B $19.63,
trade show $5.40 — blended $12.28 overstates D2C ~12% and hides B2B being ~80%
pricier. Confirms the segmentation requirement.

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
      - **CAVEAT (data state, not a bug):** `getAverageUnitCostBySku()` returns 0
        SKUs with a cost basis on prod, so COGS = $0 in the margin table today —
        exactly like the existing COGS page (84 sold SKUs, all uncosted). The
        margin is wired correctly and COGS flows in automatically once production
        POs are received / paid-invoiced. The `uncosted revenue` column + caption
        make the gap explicit. Until then, contribution ≈ revenue − shipping −
        refunds and reads high (D2C 81%, B2B 92%).
      - Revenue counts all line items incl. null-SKU ones (as uncosted), so the
        per-channel revenue total is slightly higher than the COGS card's Revenue
        (which drops null-SKU rows) — intentional; margin should count all product
        revenue.
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
