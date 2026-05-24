# Production Management Module

> **Status (reconciled 2026-05-23):** Phases 1 & 2 are **complete** on branch
> `production-management` (PR #2), plus a substantial set of changes that landed
> beyond the original plan (own companies + price tiers, per-line company/warehouse,
> product picker, PO editing, nav restructure). **Phases 3–5 are now complete too**
> (3: supplier magic-link portal; 4: C2 receiving + deadline alerts; 5: Gantt +
> incoming-inventory). The remaining work is **deployment**: merge PR #2, apply
> migrations `0008–0017` to prod, and set env/scopes (`write_inventory`,
> `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `read_locations`). The source of
> truth for schema/routes is `src/lib/schema.ts` and `specs/current/{schema,routes}.md`;
> this plan is the narrative + remaining work.

## Context

Fitwell uses multiple suppliers for buckle production, with each batch moving through 8 stages: Supplier PO → Raw Material Stamping → EDM → Polishing → Logo → Plating → QC → Packaging. Greg was evaluating monday.com but wanted an in-house system that integrates with existing customer/order/inventory data, avoids per-seat cost, and is shaped around buckle production.

Production lives under **Products → Production** in the admin nav (pages at `/modules/production/*`). There is no longer a separate "Modules" nav section (an orphaned `/modules` hub page still exists but isn't linked).

## Dependencies

- Existing tables: `user`, `customer`, `order`, `order_line_item` (`src/lib/schema.ts`) — all use `text` UUID PKs, so production tables do too.
- NextAuth v5 with Drizzle adapter (`src/lib/auth.ts`) — to be extended for supplier magic-link auth (Phase 3). Note: existing admins have `role` defaulting to `"user"`; admin access is gated by `ADMIN_EMAILS` in the signIn callback, so "admin" currently = any logged-in session.
- Resend for transactional email (existing) — for Phase 4 alerts.
- **Vercel Blob** (`@vercel/blob`, installed) for attachments — needs `BLOB_READ_WRITE_TOKEN`.
- Shopify Admin API (existing client-credentials app) — product catalog + collections (`read_products`), warehouses/locations (`read_locations`, **not yet granted**). A `graphql()` helper was added to the client.

## Scope

### Done
- `/modules/production` PO list (filters: supplier, status, stage); PO detail; create + full edit; kanban board.
- Suppliers CRUD (`/modules/production/suppliers`).
- **Companies + price tiers** under **Customers → Companies** (`/customers/companies`) — our own `company` table (not Shopify B2B), each company optionally linked to a synced Shopify customer and assigned a **price tier** (a managed list, % off retail).
- Stage tracking with `lock_stages_together`; stage-event timeline; comments; attachments (Vercel Blob).
- Product entry via a **Shopify catalog picker** (grouped by collection, sorted by buckle size, dedupes across lines), with flat-list and manual fallbacks.
- PO header **Company** + **Warehouse** (Shopify location), overridable per line item.

### Out of scope (still)
- Marketing/other modules (separate work plans).
- A proper `product`/`product_variant` table (line items keep `shopify_product_id`/`shopify_variant_id` text + denormalized snapshot).
- In-app notifications (email only); supplier-side file approval; cost accounting/margin; auto-advance automations; multi-currency.

## Decisions (as built)

- **URLs**: pages at `/modules/production/*` and `/customers/companies` (the `(admin)` route group adds no `/admin` prefix). Production-feature APIs under `/api/production/*` (each self-checks `auth()`).
- **PKs**: `text` UUID (`crypto.randomUUID()`), money in cents, dates as `date` strings — matching existing tables.
- **Stages**: fixed `production_stage` enum, 9 values incl. `complete`; every line item passes through all.
- **Stage grouping**: `lock_stages_together` on the PO (default true). Locked = whole PO advances together; broken = per-item; PO display stage is the common stage or "Mixed".
- **Kanban**: drag a line-item card to **any** stage column (forward or back) → sets that stage and records a stage event. A locked PO moves all its items together.
- **PO editing**: full reconcile on save — existing lines update in place (keeping stage history), new lines seed an opening stage event, removed lines are deleted.
- **Company**: our own `company` table. A PO has a default `company_id`; line items can override. (Replaced the earlier idea of pulling Shopify B2B companies.)
- **Price tier**: managed list (`price_tier`, name + `discount_percent`), assigned to a company = % off Shopify retail. **Replaced "Market"**, which was removed entirely.
- **Warehouse**: Shopify location (id + name snapshot) on the PO header, overridable per line; needs `read_locations`.
- **Customer link on company**: optional `company.customer_id` → synced `customer`; the contact name/email fields are a typeahead over synced customers.
- **PO numbering**: user enters the **Shopify PO number** (no Shopify PO API). Stored as `shopify_po_number`.
- **Receiving back to Shopify**: **Option C2 — push a Shopify inventory adjustment on receipt** (decided 2026-05-24). This system is the single source of truth; when a complete PO is received, each line item posts an inventory adjustment (+qty) to its effective warehouse. Needs the `write_inventory` scope (not yet granted). Idempotency: a per-line `shopify_received_at` (migration `0017`) means each line is received exactly once; the PO-level `shopify_received_at` marks "fully received." C1 (manual mark-received) was rejected.
- **Attachments**: Vercel Blob, server-side `put()`, **public** (unguessable) URLs, 10MB cap. PO-level UI today (schema supports line-item).
- **PO statuses**: `active | on_hold | complete | cancelled`.
- **Cycle times for ETA** (Phase 5): hardcode initial per-stage estimates, switch to rolling 30-day average once ≥10 completed line items exist per stage.

## Schema (built — see `src/lib/schema.ts` / `specs/current/schema.md` for the source of truth)

All `text` UUID PKs; inline `created_at`/`updated_at`.

- `production_stage` enum, `supplier`, `production_po`, `production_po_line_item`, `production_stage_event` (migration `0008`).
- `production_attachment`, `production_comment` — polymorphic (CHECK: exactly one of `po_id`/`line_item_id`; also enforced by the `resolveParent` validator) (migration `0009`).
- `company`, `price_tier`; `production_po.company_id` + warehouse columns; line-item `company_id`/warehouse overrides; the earlier Shopify-company/market columns were added then dropped (migrations `0010`–`0014`).
- `company.customer_id` → `customer` (migration `0015`).
- `user.supplier_id` added (nullable; for Phase 3). `role` already existed.

Migrations `0008`–`0015` are applied to the dev branch.

## Routes (built)

**Pages** (under the `(admin)` group): `/modules/production` (list), `/modules/production/po/new`, `/modules/production/po/[id]`, `/modules/production/po/[id]/edit`, `/modules/production/kanban`, `/modules/production/suppliers`, `/customers/companies`.

**API** (`/api/production/*`, auth-checked): `po` (POST), `po/[id]` (PATCH partial, PUT full-edit), `po/[id]/advance`, `po/[id]/comments`, `po/[id]/attachments`, `attachments/[id]` (DELETE), `line-items/[id]/stage` (kanban set-stage), `suppliers` (+`[id]`), `companies` (+`[id]`), `price-tiers` (+`[id]`), `customer-search`, `collections`, `products`, `shopify-refs` (warehouses).

**Nav**: Products → Production; Marketing → Attribution/Campaigns; Customers → Companies. (`admin-sidebar.tsx` groups; middleware guards `/modules/*`.)

## Implementation Phases

### Phase 1 — Schema + internal CRUD ✅ COMPLETE
Tables/enum + `user.supplier_id`; `/modules` hub; PO list; create + stage-advance; supplier CRUD; nav + middleware; unit tests (stage logic) + integration test (create/advance); specs updated.

### Phase 2 — Kanban, attachments, comments ✅ COMPLETE
- Kanban board with drag-to-set-stage (`line-items/[id]/stage`).
- Attachments: `@vercel/blob`, upload/list/delete on the PO, `BLOB_READ_WRITE_TOKEN`.
- Comments thread on the PO; stage-event timeline on PO detail.
- Tests: parent-rule unit tests; create/advance + full-edit integration tests; attachment upload→download integration test (skips without a Blob token + dev DB).
- Deferred: line-item-level comments/attachments UI (schema supports it); the Playwright happy-path spec (needs an e2e auth fixture + Blob token).

### Beyond the original plan — also shipped
- Companies + price tiers (`/customers/companies`), company↔customer linking via typeahead.
- PO header Company + Warehouse with per-line overrides; Market removed.
- Product picker (Shopify catalog grouped by collection, size sort, dedupe, "All Products" default, live total cost).
- Full PO editing (`/po/[id]/edit`, PUT reconcile).
- Nav restructure (Products/Marketing/Customers groups; "Modules" entry removed).

### Phase 3 — Supplier auth + portal ✅ COMPLETE
- [x] **3a — Allowlist (done):** `supplier_contact` table (one supplier per email, unique-indexed; lowercased) + relation (migration `0016`). API: `POST /api/production/suppliers/[id]/contacts`, `DELETE /api/production/supplier-contacts/[id]`. UI: Suppliers → Edit → "Authorized logins" (add/remove emails). This is the per-supplier allowlist that gates magic-link sign-in in 3b.
- [x] **3b — Auth (done):** custom magic-link email provider (`id: "email"`, modeled on @auth/core's Resend provider, delivered via `sendMagicLinkEmail` with a console fallback when `RESEND_API_KEY` is unset). signIn callback: Google → admin (unchanged); email → allowed only if the address resolves to a supplier (`supplier_contact`) OR is an allowed admin, then stamps `role='supplier'` + `supplier_id` on the link-click step. Session exposes `supplierId`. Pure policy `canMagicLinkSignIn` + unit tests.
- [x] **3b — Middleware (done):** `/supplier/*` requires `role='supplier'` (else → `/supplier/login`); signed-in non-suppliers on `/supplier/*` → `/dashboard`; suppliers hitting admin pages → `/supplier`; `/api/admin/*` rejects suppliers. `/supplier/login` is public.
- [x] **3c — Portal (done):** `/supplier/login` (magic-link form), `/supplier` (their POs), `/supplier/po/[id]` (404 unless theirs). Supplier layout + top bar; production fields only (no company/customer/price-tier).
- [x] **3c — Scoping (done):** `scope.ts` (`poSupplierId`, `lineItemPoSupplierId`, `ensureSupplierMayActOnPo/LineItem`) — no `auth` import so it's testable under vitest; `getSupplierScope` (session→supplier) lives in `supplier-session.ts`. Write endpoints owner-check suppliers; edit/delete/contact-mgmt are admin-only.
- [x] **3c — Suppliers can** view their POs, advance stages, comment, upload — not edit qty/dates, not delete.
- [x] **3c — Tests (done):** `canSupplierAccessPo` unit tests (in `supplier-access.test.ts`); `scope.integration.test.ts` proves supplier B is forbidden from supplier A's PO (5/5 pass on the dev branch).

### Phase 4 — Deadline alerts + receiving (C2) — IN PROGRESS
- [ ] **4a — Receive (C2):** per-line `shopify_received_at` (migration `0017`); Shopify client `adjustInventory` (variant → `inventory_item_id`, then `POST /inventory_levels/adjust.json`; needs `write_inventory`); pure `planReceiveLine` (ready / not_ready / no_variant / no_warehouse / already_received); `receivePo` service (idempotent per line, sets PO flag when all lines received); `POST /api/production/po/[id]/receive` (admin-only). Unit tests for `planReceiveLine`.
- [ ] **4b — Receive UI:** "Receive into Shopify" banner/button on the admin PO detail for complete, not-yet-received POs; shows received timestamp; surfaces per-line skips + a clear `write_inventory`-not-granted message.
- [ ] **4c — Deadline alerts:** `GET /api/cron/production-deadline-alerts` (`verifyCronOrAdmin`); pure `lineItemsNeedingAlert` + `posNeedingReceiveNag`; emails owner (+ supplier) via Resend (graceful if no key); add to `vercel.json`. Unit tests for the pure selectors.
- C1 (manual "mark received" banner + nag) — rejected in favour of C2.

### Phase 5 — Gantt + inventory tie-in ✅ COMPLETE
- [x] Cycle-time service: pure `cycle-time.ts` (`DEFAULT_STAGE_DAYS` placeholders, `resolveStageEstimate` = rolling 30-day average once ≥10 samples else default, `projectRemainingDays`/`projectEta`) + db-backed `cycle-time-data.ts` (`getStageEstimates` from `production_stage_event` durations).
- [x] `/modules/production/gantt`: per-line-item timeline, solid actual segments from stage history + faded projected segment to ETA, stage colour legend, today marker. Linked from the production page ("Timeline").
- [x] `/inventory`: per-SKU incoming (not-yet-received) qty, by-stage breakdown, nearest projected ETA (pure `aggregateIncoming`). Incoming-qty column added to `/products`. "Inventory" added to the Products nav; middleware guards `/inventory`.
- [x] **Tests**: `cycle-time` branches (defaults vs rolling avg, ETA projection) + `aggregateIncoming` (sum, by-stage, nearest ETA, sort) — unit.
- ⚠️ `DEFAULT_STAGE_DAYS` are **placeholders** — get Greg's per-stage day estimates and update the constant. The rolling average takes over automatically once a stage has ≥10 completed transitions in the last 30 days.

## Notes

### Open questions
- **✅ C1 vs C2 — receiving strategy: RESOLVED (2026-05-24) → C2.** This system is the single source of truth and pushes a Shopify **inventory adjustment** on receipt. Still needs the `write_inventory` scope granted in the Shopify Dev Dashboard (store re-auth) before live pushes work — until then the receive flow returns a clear "scope not granted" error (same pattern as `read_locations`).
- **Initial cycle-time numbers per stage** — placeholders are live in `DEFAULT_STAGE_DAYS` (`src/lib/production/cycle-time.ts`); get Greg's real per-stage day estimates and update the constant. Each stage auto-switches to its rolling 30-day average once ≥10 completed transitions exist.
- **Shopify admin deep-link pattern** for POs (Phase 4) — confirm exact format; `shopify_po_number` may not equal Shopify's internal ID.
- **Supplier visibility of customer/company info** (Phase 3) — ✅ resolved: the portal shows production fields only (stage/status/dates/line items/attachments/comments); company, customer, and price-tier are hidden from suppliers.
- **`read_locations` scope** not yet granted, so the Warehouse picker is empty until it's added in the Shopify Dev Dashboard.

### Risks
- **No Shopify PO API** — POs are user-entered; receiving is manual (C1) or via inventory adjustment (C2). Not a true PO sync either way.
- **Polymorphic attachments/comments** — nullable `po_id`/`line_item_id` + CHECK (exactly one) + `resolveParent`; less type safety, acceptable.
- **Public blob URLs** — attachments are public (unguessable). Fine for internal docs at our scale; revisit if sensitive.
- **Supplier auth scoping** (Phase 3) — easy to leak across suppliers; mitigate with a centralised scope helper + a cross-supplier integration test.
- **Migration churn** — the Shopify-company/market columns were added (`0010`) then dropped (`0014`) as the design moved to our own companies; harmless but visible in history.

### Alternatives considered
- **monday.com via their API** — rejected; want integration with existing data + avoid per-seat cost.
- **Shopify B2B Companies (read from Admin GraphQL)** — explored and works on read, but **rejected** in favour of our own `company` table so we control price tiers and customer linkage (not a Plus dependency).
- **Shopify Markets as a PO tag** — built then **removed**; replaced by price tiers on companies.
- **Option C2 (push inventory adjustment on receipt)** — **chosen** (now the Receiving decision, see above; moved out of alternatives).
- **Option D (replace Shopify POs entirely)** — rejected; we keep Shopify orders/inventory as the storefront source and only write inventory adjustments on receipt.
- **Polymorphic `attachable_type` pattern** — rejected as overkill for two parent types.
- **PO-level stage column** — rejected; stage lives on line items with a PO lock flag; PO stage is derived ("Mixed" when they differ).
