# Production Management Module

> **Status (reconciled 2026-05-23):** Phases 1 & 2 are **complete** on branch
> `production-management` (PR #2), plus a substantial set of changes that landed
> beyond the original plan (own companies + price tiers, per-line company/warehouse,
> product picker, PO editing, nav restructure). Phases 3–5 remain. The source of
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
- **Receiving back to Shopify**: **manual (Option C1)** — ⚠️ **UNDER REVIEW (see Open questions; may switch to C2).** Phase 4 not yet built.
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

### Phase 4 — Deadline alerts + receiving (TODO) — gated on the C1/C2 decision
- [ ] `GET /api/cron/production-deadline-alerts` — emails owner (and supplier) for line items due within N days; add cron to `vercel.json`; Resend templates.
- [ ] **C1**: "Mark received in Shopify" banner + deep link on complete POs; `POST .../mark-shopify-received` sets `shopify_received_at`; daily nag until set.
- [ ] **C2 (if chosen)**: a "Receive" action that pushes a Shopify **inventory adjustment** to the line/PO warehouse (`write_inventory` scope + a client method); idempotency via `shopify_received_at`. Per-line warehouse already exists.
- [ ] **Tests**: which lines need alerts; which complete POs need the nag; cron endpoint.

### Phase 5 — Gantt + inventory tie-in (TODO)
- [ ] `/modules/production/gantt` (timeline per line item, coloured by stage).
- [ ] Cycle-time service (hardcoded → rolling 30-day average from `production_stage_event`).
- [ ] `/inventory` page: per-variant incoming qty + stage breakdown + ETA; surface incoming qty/ETA on `/products`.
- [ ] **Tests**: cycle-time service branches; ETA aggregation; inventory smoke.

## Notes

### Open questions
- **⚠️ C1 vs C2 — receiving strategy (DECISION PENDING, raised 2026-05-23, revisit after testing C1).** Reconsidering manual receive (C1) in favour of **C2**: this system becomes the single source of truth and pushes a Shopify **inventory adjustment** on receipt. Pivot is cheap: `shopify_received_at` serves both; the receive flow (Phase 4) isn't built yet; line items already capture `shopify_variant_id` **and** a warehouse. C2 needs: `write_inventory` scope, a client inventory-adjust method (variant → `inventory_item_id` + location), idempotency, and a PO-numbering tweak (`shopify_po_number` nullable or a generated number). If chosen, flip the "Receiving" decision and move C2/D out of *Alternatives considered*.
- **Initial cycle-time numbers per stage** — need Greg's estimates (days) per stage; used until ≥10 completed line items exist per stage.
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
- **Option C2 (push inventory adjustment on completion)** / **Option D (replace Shopify POs entirely)** — under active reconsideration (see Open questions).
- **Polymorphic `attachable_type` pattern** — rejected as overkill for two parent types.
- **PO-level stage column** — rejected; stage lives on line items with a PO lock flag; PO stage is derived ("Mixed" when they differ).
