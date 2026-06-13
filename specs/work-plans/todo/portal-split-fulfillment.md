# B2B Portal — Split Fulfillment (Phase B)

## Context
B2B buyers want to ship one order to multiple of their saved addresses (e.g.
different warehouses). Shopify can't model multiple destinations on one order —
an order/draft order has a single ship-to, and fulfillments inherit it. The
decision (working session, 2026-06): keep **one invoice + one payment**, store
the per-line split in our DB as the source of truth, and surface it on the
Shopify order as **line-item custom attributes + an order note** so whoever
packs in Shopify sees what goes where. Builds on Phase A (`invoice.ship_to`, the
single primary/default address).

## Dependencies
- Phase A: `invoice.ship_to` (default ship-to, drives the draft order's order-level address) — shipped.
- `lib/portal/addresses.ts` (`getCompanyAddresses`, `resolveShipTo`, `shipToLabel`, `shipToToShopify`).
- Shopify `createDraftOrderInvoice` / `buildDraftOrderInput`.

## Scope
**In:** per-line ship-to on portal orders; a "split fulfillment" toggle; storing
the split; syncing it to Shopify (per-line custom attributes + order note);
an admin "ship plan" view (which lines go to which address).
**Out:** multiple Shopify orders/payments per split (explicitly rejected);
changing how shipping cost is charged; carrier/label generation.

## Implementation Phases

### Phase B1: Data + Shopify plumbing ✅
- [x] `invoice_line_item.ship_to` jsonb (null = use the invoice's primary ship-to). Migration `0070`.
- [x] `buildDraftOrderInput`: support per-line `customAttributes`; emit them.
- [x] Tests for the line custom-attribute mapping.

### Phase B2: Service ✅
- [x] `createInvoice` / `savePortalOrderLines`: accept + store per-line ship-to.
- [x] `submitPortalOrder`: when split, attach a `Ship to: <label>` custom attribute per line + append a split summary to the order note. Order-level address stays the primary.
- [x] Tests: split → per-line attributes + note; no split → unchanged.

### Phase B3: Portal UI ✅
- [x] "Split fulfillment" toggle on the order form.
- [x] Per-line address picker (below each line) when split is on; defaults to the primary.
- [x] Send per-line addressId; seed from stored per-line ship-to on edit.

### Phase B4: Admin ship plan ✅
- [x] On the admin invoice detail, show lines grouped by destination address (the "ship plan").
- [x] Tests for the grouping helper (`buildShipPlan` / `isSplitOrder`).

## Notes
- One invoice/payment is a hard constraint of "one Shopify order = one payment".
- Per-line address is a SNAPSHOT (address sync is delete-and-replace).
- A line with `ship_to = null` ships to `invoice.ship_to` (the default).

## Follow-ups (not blocking)
- `reapplyTierToOpenInvoices` (tier-change regeneration) does NOT re-emit the
  split custom attributes / note on the regenerated Shopify draft order — our DB
  keeps the split, but a tier change on a split *sent* order would drop the split
  hints from Shopify until the next portal edit. Factor the split logic out of
  `submitPortalOrder` and reuse it there.
- Portal order **read-only** view (paid orders) shows only the primary ship-to;
  could show the per-line split too.
- Admin invoice **edit** form has no per-line ship-to control (admin-created
  invoices can't split yet — portal only).
