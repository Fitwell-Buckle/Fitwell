# Production Management Module

## Context

Fitwell uses multiple suppliers for buckle production, with each batch moving through 8 stages: Supplier PO → Raw Material Stamping → EDM → Polishing → Logo → Plating → QC → Packaging. Greg is currently evaluating monday.com for this workflow but would prefer an in-house system that integrates with existing customer, order, and inventory data, avoids per-seat cost, and is shaped specifically around buckle production rather than a generic board abstraction.

This work introduces a new top-level "Modules" concept in the admin (`/admin/modules`), with **Production** as the first module. Marketing and other modules will follow in future work plans.

## Dependencies

- Existing tables: `user`, `customer`, `order`, `orderLineItem` (`src/lib/schema.ts`)
- NextAuth v5 with Drizzle adapter (`src/lib/auth.ts`) — extended for supplier magic-link auth
- Resend for transactional email (existing integration)
- New dependency: **Vercel Blob** for file attachments (`@vercel/blob`)
- New cron job for deadline alerts (added to `vercel.json`)

## Scope

### In scope
- New `/admin/modules` hub page listing available modules
- Production module under `/admin/modules/production` with PO list, PO detail, kanban, and gantt views
- Schema: suppliers, master POs, line items, stage events, attachments, comments
- Stage-grouping behavior: line items advance together by default; PO can be "broken" to allow per-item stages
- Customer link at line item level (optional FK to `customer` and/or `orderLineItem`)
- Supplier portal at `/supplier/...` with magic-link auth, scoped to their own POs
- File uploads via Vercel Blob (PO + line item attachments)
- Comments on POs and line items (internal users + suppliers)
- Email deadline alerts (cron-driven, sent via Resend)
- Inventory tie-in: incoming qty per variant, surfaced on existing Products page and a new Inventory view
- Tests at each phase (unit + integration; one Playwright spec for the happy path at the end)

### Out of scope (for this work plan)
- Marketing or other modules (separate work plans)
- A proper `product`/`product_variant` table (production line items will reference `shopify_product_id` + `shopify_variant_id` as text with denormalized snapshots; promoting to FK is a separate work plan)
- In-app notifications (email only for v1)
- Supplier-side file approval workflows
- Cost accounting / margin tracking against POs
- Automations beyond deadline alerts (e.g. auto-advance on QC pass) — design hooks for later but don't build
- Multi-currency POs (assume USD)
- Multi-warehouse / location tracking

## Decisions Already Made

- **Module URL structure**: `/admin/modules/production` with `/admin/modules` index
- **Supplier auth**: magic-link email via Resend
- **File storage**: Vercel Blob (~$0.15/GB/mo)
- **Stages**: fixed enum, every line item passes through all 8 (no skipping in v1)
- **Stage grouping**: `lock_stages_together` boolean on PO; default true (whole PO advances together); when false, each line item moves independently and the PO shows "Mixed"
- **Customer link**: optional FK at line item level (`customer_id` and/or `order_line_item_id`); most production is for stock, some line items earmarked for a specific customer or Shopify order
- **Notifications**: email only for v1
- **PO numbering**: we don't generate PO numbers. The user enters the **Shopify PO number** (from Shopify's built-in PO feature) when creating a production-tracking PO. Stored as `shopify_po_number`.
- **Receiving back to Shopify**: **manual** (Option C1) — ⚠️ **UNDER REVIEW as of 2026-05-23, may switch to C2; see Open questions in Notes.** Shopify's PO feature has no GraphQL Admin API, and Stocky's API is read-only and deprecated. When our system marks a PO complete, we surface a "Mark received in Shopify" reminder with a deep link to the Shopify admin. The user clicks "receive" in Shopify themselves — Shopify then handles the inventory update natively. We do **not** push inventory adjustments to Shopify via API.
- **Stage cycle times for ETA**: hardcode initial estimates (Greg's numbers) per stage. Once we have ≥10 completed line items, switch to a rolling 30-day average per stage. ETA = sum of remaining stage durations from current stage to packaging.
- **PO statuses**: `active | on_hold | complete | cancelled`
- **Inventory view in this plan**: minimal — incoming qty per variant + ETA, derived from in-progress production line items. Surfaced on the existing `/admin/products` page and a new `/admin/inventory` page. Full inventory management (on-hand sync, reorder points, low-stock alerts) is a separate follow-up work plan.

## Schema Additions (`src/lib/schema.ts`)

```ts
// Stage enum — fixed order, used for indexing and validation
export const productionStage = pgEnum("production_stage", [
  "supplier_po",
  "stamping",
  "edm",
  "polishing",
  "logo",
  "plating",
  "qc",
  "packaging",
  "complete",
]);

export const supplier = pgTable("supplier", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  notes: text("notes"),
  createdAt, updatedAt,
});

export const productionPo = pgTable("production_po", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => supplier.id),
  shopifyPoNumber: text("shopify_po_number").notNull(),  // user-entered, copied from Shopify's built-in PO feature
  issuedDate: date("issued_date").notNull(),
  expectedDeliveryDate: date("expected_delivery_date"),
  lockStagesTogether: boolean("lock_stages_together").notNull().default(true),
  status: text("status").notNull().default("active"),  // active | on_hold | complete | cancelled
  shopifyReceivedAt: timestamp("shopify_received_at"),  // set manually when user confirms they marked it received in Shopify
  notes: text("notes"),
  createdAt, updatedAt,
});

export const productionPoLineItem = pgTable("production_po_line_item", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => productionPo.id, { onDelete: "cascade" }),

  // Product identity (no FK yet — see "Out of scope" above)
  shopifyProductId: text("shopify_product_id"),
  shopifyVariantId: text("shopify_variant_id"),
  sku: text("sku").notNull(),
  title: text("title").notNull(),

  quantity: integer("quantity").notNull(),
  unitCostCents: integer("unit_cost_cents"),

  // Stage tracking — current stage lives here even when locked, so "break" is just flipping the PO flag
  currentStage: productionStage("current_stage").notNull().default("supplier_po"),
  expectedCompletionDate: date("expected_completion_date"),
  actualCompletionDate: date("actual_completion_date"),

  // Customer earmark (both optional; if orderLineItemId set, customer derives from it)
  customerId: integer("customer_id").references(() => customer.id),
  orderLineItemId: integer("order_line_item_id").references(() => orderLineItem.id),

  createdAt, updatedAt,
});

export const productionStageEvent = pgTable("production_stage_event", {
  id: serial("id").primaryKey(),
  lineItemId: integer("line_item_id").notNull().references(() => productionPoLineItem.id, { onDelete: "cascade" }),
  stage: productionStage("stage").notNull(),
  enteredAt: timestamp("entered_at").notNull().defaultNow(),
  exitedAt: timestamp("exited_at"),
  triggeredByUserId: text("triggered_by_user_id").references(() => user.id),
  notes: text("notes"),
});

// Polymorphic attachment — exactly one of poId or lineItemId set
export const productionAttachment = pgTable("production_attachment", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => productionPo.id, { onDelete: "cascade" }),
  lineItemId: integer("line_item_id").references(() => productionPoLineItem.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Polymorphic comment — exactly one of poId or lineItemId set
export const productionComment = pgTable("production_comment", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => productionPo.id, { onDelete: "cascade" }),
  lineItemId: integer("line_item_id").references(() => productionPoLineItem.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Plus relations blocks and a `role` column on `user` (`'admin' | 'supplier'`) so suppliers can be auth'd via NextAuth but scoped in middleware.

For suppliers: add `supplierId` to the `user` table (nullable; set for users with `role='supplier'`).

## Routes

### Admin
- `/admin/modules` — module hub (Production card; later Marketing card)
- `/admin/modules/production` — PO list with filters (supplier, stage, status, deadline)
- `/admin/modules/production/po/new` — create master PO + line items
- `/admin/modules/production/po/[id]` — PO detail: line items, stage controls, attachments, comments, timeline
- `/admin/modules/production/kanban` — kanban view (columns = 9 stages including complete)
- `/admin/modules/production/gantt` — gantt timeline across POs
- `/admin/modules/production/suppliers` — supplier CRUD
- `/admin/inventory` — incoming qty per variant, stage breakdown, ETA impact

### Supplier (new route group)
- `/supplier/login` — magic-link request
- `/supplier/` — list of own POs
- `/supplier/po/[id]` — PO detail (scoped to their supplier_id), stage advance + comments + uploads

### API
- `POST /api/production/po` — create PO
- `PATCH /api/production/po/[id]` — update PO (incl. `lockStagesTogether` toggle)
- `POST /api/production/po/[id]/advance` — advance stage (one item or whole PO depending on lock)
- `POST /api/production/po/[id]/comments` — add comment
- `POST /api/production/po/[id]/attachments` — upload (returns signed Vercel Blob URL)
- `POST /api/production/po/[id]/mark-shopify-received` — sets `shopify_received_at` (user confirmation, not an API call to Shopify)
- `POST /api/auth/supplier/magic-link` — request magic link (NextAuth magic-link provider; this is the request endpoint)
- `GET /api/cron/production-deadline-alerts` — daily deadline + receive-in-Shopify reminder scan

## Implementation Phases

### Phase 1: Schema + internal CRUD ✅ COMPLETE (branch `production-management`)
> URL note: this repo's `(admin)` route group adds no `/admin` prefix, so module
> pages live at `/modules/...` (not `/admin/modules/...`). PKs use `text` UUIDs
> (not `serial`) to match existing tables; `role` already existed on `user`.
- [x] Add tables and enum to `src/lib/schema.ts`; add `supplierId` to `user` (`role` already existed)
- [x] Generate + apply migration on dev branch (`0008_shallow_fixer.sql`)
- [x] `/modules` hub page with Production card
- [x] `/modules/production` PO list (no kanban yet)
- [x] Create PO + line items; edit PO fields (status, lock, dates, notes) — line-item editing post-create deferred
- [x] Stage advance action (respecting `lockStagesTogether`)
- [x] Supplier CRUD page
- [x] Add nav entry: "Modules" in `admin-sidebar.tsx` + `/modules` middleware guard
- [x] **Tests**: unit tests for stage-advance logic (locked vs broken, 14 tests); integration test for PO create + advance (3 tests, pass on dev branch); `npm run check` passes
- [x] **Update specs**: `specs/current/schema.md`, `specs/current/routes.md`, `specs/current/components.md`

### Phase 2: Kanban, attachments, comments
- [ ] Install `@vercel/blob`; add `BLOB_READ_WRITE_TOKEN` to `.env.example`
- [ ] Kanban view (columns = stages, cards = line items, drag to advance)
- [ ] Attachment upload + list on PO and line item
- [ ] Comments thread on PO and line item
- [ ] PO detail timeline (from `production_stage_event`)
- [ ] **Tests**: unit tests for attachment polymorphic constraint; integration test for upload + download cycle; Playwright spec for "create PO → upload file → advance stage → comment"

### Phase 3: Supplier auth + portal
- [ ] NextAuth magic-link provider for `role='supplier'` users
- [ ] Middleware: `/supplier/*` requires `role='supplier'`; `/admin/*` requires `role='admin'`
- [ ] `/supplier/login` + `/supplier/` + `/supplier/po/[id]`
- [ ] Scope all supplier queries by `supplierId` (centralised helper)
- [ ] Suppliers can: view their POs, advance stages, comment, upload files (cannot edit qty/dates)
- [ ] **Tests**: unit tests for supplier scoping helper; integration test that supplier A cannot see supplier B's PO (RLS-equivalent via app layer)

### Phase 4: Deadline alerts + receive-in-Shopify reminder
- [ ] `GET /api/cron/production-deadline-alerts` — scans for line items with `expected_completion_date` within N days and emails owner (and supplier if assigned)
- [ ] Add cron to `vercel.json` (daily morning)
- [ ] Email templates via Resend
- [ ] When a PO reaches stage `complete`, show a persistent "Mark received in Shopify" banner on the PO detail page with a deep link to the Shopify admin PO (URL pattern: `https://admin.shopify.com/store/<store>/inventory/purchase_orders/<shopify_po_number>` — confirm exact pattern during build); user clicks "I've marked it received" to set `shopify_received_at` and dismiss the banner
- [ ] Daily reminder email if a PO has been `complete` for >24h without `shopify_received_at` set
- [ ] Hook: log every stage transition (already captured in `production_stage_event` from Phase 1) so future automations can subscribe — no automations built yet
- [ ] **Tests**: unit test for "which line items need alerts today"; unit test for "which complete POs need the receive-in-Shopify nag"; integration test for the cron endpoint

### Phase 5: Gantt + inventory tie-in (minimal)
- [ ] `/admin/modules/production/gantt` view (timeline per line item, coloured by stage)
- [ ] Cycle-time service: returns per-stage duration estimate — hardcoded constants until ≥10 completed line items exist per stage, then rolling 30-day average from `production_stage_event`
- [ ] `/admin/inventory` page: per-variant incoming qty (sum of in-progress production line items), stage breakdown, ETA from cycle-time service
- [ ] Surface incoming qty + earliest ETA on existing `/admin/products` page
- [ ] **Tests**: unit test for cycle-time service (hardcoded vs averaged branches); unit test for ETA aggregation; Playwright smoke for inventory page

## Notes

### Open questions
- **⚠️ C1 vs C2 — receiving strategy (DECISION PENDING, raised 2026-05-23, revisit ~2026-05-27 after testing C1).** Oliver is reconsidering the C1 decision (manual receive in Shopify) in favour of **C2**: generate POs *here*, make this system the single source of truth, and sync receipt by pushing a Shopify **inventory adjustment** via API. Plan: ship C1 (Phases 1–4 as written), test for a few days, then decide. The pivot is cheap — most of the groundwork already fits:
  - **Schema**: additive only. `shopify_received_at` serves both strategies. C2 needs PO numbering to change — make `shopify_po_number` nullable or add a generated `po_number` (one migration).
  - **Receive flow is Phase 4, not yet built** — so there's nothing to tear out; we'd just build the C2 "Receive → adjust inventory" action instead of the C1 "mark received in Shopify" banner + nag emails.
  - **The product picker (added 2026-05-23) already captures `shopify_variant_id` per line item** — exactly what an inventory adjustment needs.
  - **New work C2 requires**: (1) `write_inventory` scope on the Shopify app token (currently read-only — Dev Dashboard change); (2) a client method to adjust inventory (resolve variant → `inventory_item_id`, pick a location, post the adjustment); (3) idempotency guard so a double-click can't double-count (use `shopify_received_at`).
  - Under C2 the original "Shopify PO ledger diverges" risk disappears, because this system *replaces* Shopify's PO feature rather than shadowing it (i.e. Option D territory). If C2 is chosen, update the "Receiving back to Shopify" and "PO numbering" decisions below and move "Option C2"/"Option D" out of *Alternatives considered*.
- **Initial cycle-time numbers per stage** — need Greg's best guess for stamping, EDM, polishing, logo, plating, QC, packaging (in days). Used until ≥10 completed line items exist per stage.
- **Shopify admin deep-link URL pattern** for POs — confirm exact format during Phase 4 build (likely `https://admin.shopify.com/store/<store>/inventory/purchase_orders/<id>`, but `shopify_po_number` may not match Shopify's internal ID; may need to store the Shopify PO internal ID alongside the number).
- **Supplier visibility of customer info** — do suppliers see which customer/order a line item is earmarked for, or is that internal-only? Default: internal-only (cleaner separation).

### Risks
- **No Shopify PO API** — Shopify exposes Purchase Orders in their admin UI but has no GraphQL/REST API for them. Stocky's API is read-only and deprecated. This is why we landed on Option C1 (manual receive in Shopify). If Shopify ships a PO API later, we can revisit auto-receive.
- **Polymorphic attachments/comments** — using nullable `poId`/`lineItemId` with a check constraint (exactly one set) is simpler than a separate `attachable_type`/`attachable_id` pattern but loses some type safety. Acceptable for v1.
- **Supplier auth scoping** — easy to miss a query and leak data across suppliers. Mitigation: centralised `requireSupplierScope(query, session)` helper that all supplier routes must use; integration test asserts cross-supplier access fails.
- **Shopify PO / our PO drift** — if the user forgets to mark received in Shopify, our system says "complete" but Shopify inventory doesn't update. Mitigation: persistent banner + daily nag email until `shopify_received_at` is set.
- **Vercel Blob cost** — at $0.15/GB/mo, even 100GB is $15/mo, so not a real concern at our scale, but worth noting.

### Alternatives considered
- **Build on top of monday.com via their API** instead of from scratch — rejected because Greg specifically wants the integration with existing customer/order/inventory data and per-seat cost is a real factor as suppliers come online.
- **Option C2 (push inventory adjustments to Shopify via API on PO completion)** — rejected; bypasses Shopify's PO receive flow and risks Shopify PO state and inventory state diverging. Manual receive (C1) keeps Shopify's PO ledger correct.
- **Option D (replace Shopify POs entirely)** — rejected; user wants to keep using Shopify's PO feature as the inventory source of truth.
- **Polymorphic attachable_type pattern** — rejected as overkill for two parent types (PO + line item).
- **PO-level stage** — rejected; storing stage at line-item level (with a PO-level lock flag) is simpler and more flexible. The PO's displayed stage is derived: common stage if all match, "Mixed" otherwise.
