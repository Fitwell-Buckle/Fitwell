# Shopify "Total sales" parity

## Context
The admin dashboard's headline metric ("Revenue") is computed as the sum of
`order.total_price` for orders with `financial_status IN ('paid',
'partially_refunded')`. This structurally disagrees with Shopify's "Total
sales" report, which Oliver compares against. Measured gap (May 5–Jun 4 prod):

- Platform "Revenue" (paid + partially_refunded): **$14,015.39**
- Shopify "Total sales": **$20,468.38**

Reconciled exactly:
- 4 **pending** orders worth **$12,322.50** (wholesale/wire) are excluded by the
  status filter → platform reads low.
- Shopify subtracts **~$6,231.91 of returns** we don't store at all.
- `all orders total_price ($26,358.89) − returns ($6,231.91) ≈ $20,127` ≈ Shopify
  `$20,468` (residual ≈ taxes + a 1-day range offset).

Decision (Oliver, 2026-06-04): make the dashboard match Shopify "Total sales"
exactly, which requires storing the per-order money breakdown (refunds, tax,
shipping) we currently drop on the floor.

## Dependencies
- `src/lib/schema.ts` (order table) — additive columns.
- `src/lib/shopify/sync.ts` (`upsertOrder`) + `src/types/shopify.ts` — map the
  new fields; refunds are embedded in the order payload.
- `src/app/(admin)/dashboard/page.tsx` — new metric definition.
- Migration gate: additive migration → migrate prod **before** push.
- Backfill: re-run `extract-shopify` after deploy so existing rows populate.

## Scope
**In:** per-order `total_tax`, `total_discounts`, `total_shipping`,
`total_refunded`, `cancelled_at`; sync mapping; "Total sales" =
Σ(total_price − total_refunded) over non-cancelled orders on the dashboard
(card + trend + channel breakdown); AOV denominator fix; backfill; docs.

**Out (offer as follow-up):** the full Shopify columnar breakdown table
(Gross / Discounts / Returns / Net / Tax / Shipping); applying the same metric
to attribution/funnel pages; duties (≈$0 for this store).

## Implementation Phases

### Phase 1: Schema + sync mapping
- [ ] Add to `order`: `totalTax`, `totalDiscounts`, `totalShipping`,
      `totalRefunded` (int cents, default 0), `cancelledAt` (timestamp, null).
- [ ] Expand `ShopifyOrder`: `total_shipping_price_set`, `cancelled_at`,
      `refunds[].transactions[] {amount, kind, status}`.
- [ ] `sumRefundedCents(order)` helper (kind==='refund' && status==='success').
- [ ] Map all five fields in `upsertOrder` (insert + onConflict update).
- [ ] `npm run db:generate`, review SQL, `npm run db:migrate` (dev).
- [ ] Unit tests: `sumRefundedCents` + mapping shape.

### Phase 2: Dashboard "Total sales"
- [ ] Card "Revenue" → "Total sales" = Σ(total_price − total_refunded),
      all non-cancelled orders in range (drop the paid-only filter, include
      pending).
- [ ] Revenue trend + channel breakdown use the same net expression.
- [ ] AOV = total sales / non-cancelled order count.
- [ ] Tests for the SQL-building / helper logic where feasible.
- [ ] `npm run check` + `npm run build`.

### Phase 3: Prod migrate + deploy + backfill (GATED)
- [ ] `npm run db:pending:prod` → migrate prod (additive, safe pre-deploy).
- [ ] Push → Vercel deploys new sync + dashboard.
- [ ] Backfill: `extract-shopify?days=N` repopulates the new columns from
      Shopify (refunds embedded). Verify dashboard ≈ Shopify Total sales.

### Phase 4: Docs
- [ ] Update `specs/current/schema.md` (new order columns) +
      `specs/current/integrations.md` (Shopify money mapping) if present.
- [ ] Move this plan to `completed/`, add `releases.yaml` entry.

## Notes
- Refunds are embedded in the order REST payload (`order.refunds[].transactions`),
  so no extra API calls; the existing `fetchAll` sync already pulls full orders.
- Net definition (`total_price − total_refunded`) nets item/tax/shipping refunds
  in one shot, matching Shopify's Total sales without reconstructing each column.
- Between deploy and backfill, existing rows have `total_refunded = 0`, so the
  number is briefly the gross (~$26k) before settling (~$20k). Backfill promptly.
