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

## Root-cause fix (2026-06-13): addresses never persisted

The ship-to / split picker was silently empty for **every** company because
customer addresses were never being written to `customer_address`.
`syncCustomerAddresses` (in `src/lib/shopify/sync.ts`) did its delete-and-replace
inside `db.transaction(...)`, but `db` is the **neon-http** driver
(`src/lib/db.ts` → `drizzle-orm/neon-http`), which does **not** support
interactive transactions — the call threw on every invocation. Since
`upsertCustomer` wraps the address sync in a best-effort try/catch, the failure
was swallowed and addresses never landed. The admin customer **Addresses** tab
masked the bug with a *live* Shopify fallback (read-only, no persist), so it
showed addresses while the order forms (which read persisted rows via
`getCompanyAddresses`) stayed empty. Fixed by switching to `db.batch([...])`
(neon-http's atomic multi-statement path) + a regression test asserting the sync
uses `db.batch`, never `db.transaction`. Existing customers backfill on the next
order webhook, the portal self-heal, or the "Sync from Shopify" button.

## Redesign (2026-06-13): per-SKU quantity allocation grid

The original split model shipped each whole order line to one address (a per-line
ship-to `<select>`). Replaced with a **quantity-allocation grid**: when split is
on, you pick N destination addresses and enter how many units of each SKU go to
each location; the **last column auto-fills the remainder** (`total − Σ others`,
read-only). Lives in **both** the portal order form and the admin invoice form via
shared pieces — no schema/service/API change (a split SKU just persists as one
`invoice_line_item` per (SKU, destination), which the whole pipeline already
supports).

- **`src/lib/invoicing/split-alloc.ts`** (+ test) — pure helpers: `expandAlloc`
  (grid → one line per (SKU, location) with qty>0; <2 locations → non-split),
  `reconstructAlloc` (stored lines → grid state, default column first, backward
  compatible with old one-line-per-SKU orders), `anyOverAllocated`/`remainderQty`.
- **`src/components/invoicing/split-fulfillment-grid.tsx`** — shared grid (SKU rows
  × location columns + Total; last column read-only "(auto)"; Add/remove location;
  over-allocation highlight). Also exports the shared `addressOptionLabel`.
- Both forms: removed the per-line `<select>`; added the grid; expand on
  save / reconstruct on edit; block save while over-allocated.
- **`invoice-document.tsx`** shows a per-line "→ Ship to: <label>" so split orders
  (multiple rows per SKU) read coherently on the printable invoice.

## Follow-ups (not blocking)
- ~~`reapplyTierToOpenInvoices` doesn't re-emit the split custom attributes /
  note.~~ **Done** — the split logic is now the shared `buildSplitShipping`
  helper, used by the portal submit, the admin invoice **send**, and the
  tier-reprice regeneration, so all three sync the split (+ order-level ship-to)
  to Shopify identically.
- Portal order **read-only** view (paid orders) shows only the primary ship-to;
  could show the per-line split too.
- ~~Admin invoice form has no per-line ship-to control.~~ **Done** — the admin
  invoice create/edit form now has the ship-to picker + "Split fulfillment"
  toggle + per-line address pickers (fetches the company's addresses, resolves
  + stores order-level `invoice.ship_to` and per-line `invoice_line_item.ship_to`
  through the invoice POST/PUT routes).
