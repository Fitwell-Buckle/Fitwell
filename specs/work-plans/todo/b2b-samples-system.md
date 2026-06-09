# Work Plan: B2B samples system

**Status:** Drafted 2026-06-09. Not started.

## Context

We need a way to ship product samples to B2B prospects (watch shops, retailers,
distributors, press, OEM contacts) without polluting revenue analytics or
attribution. `specs/strategy/b2b-pipeline.md` calls sample-status the *central
metric* of the B2B funnel (line 292), and `lead.stage = "sample"` is already in
the schema as the canonical stage, but there's no UI today that **creates a
sample shipment and advances a lead into that stage**. Reps would have to
manually issue a free draft order in Shopify Admin and then update the lead's
stage in our app — two systems, two error surfaces, easy to forget either step.

This plan adds the missing operational layer: a one-step flow that
(a) creates a real Shopify order tagged `sample` so Shopify fulfillment ships
it like any other order, (b) records it in our `order` table with
`is_sample = true` and a `lead_id` FK, (c) auto-advances the lead's stage,
and (d) excludes the row from every revenue/attribution query we run.

**Out of scope:** influencer gifting. That flow exists (`/api/influencer-orders`,
`influencer_order` table) and is conceptually separate — creators earn posts in
exchange for product; B2B samples are evaluating product for wholesale
adoption. Two workflows, two destinations (marketing system vs. sales pipeline),
no shared UI surface.

## Decisions (confirmed with Oliver, 2026-06-09)

- **Two flows, not one.** Influencer gifting stays at `/influencer-orders` and
  feeds the marketing system. B2B samples get a new `/samples` surface and feed
  the B2B pipeline. Mechanically near-identical (both: $0 Shopify draft, real
  SKU, ship to a non-paying recipient), but the recipient relationship and
  post-ship workflow differ enough that merging would muddy both UIs.
- **Single table, not parallel.** Samples live in the main `order` table with
  `is_sample = true` + `lead_id` FK — *not* a separate `sample_order` table
  like `influencer_order`. Influencer orders carry domain-specific metadata
  (content deadline, affiliate link) and stay as drafts; sample orders are
  *completed* Shopify orders with fulfillment status and carry only the lead
  link as extra metadata. Two columns < two tables.
- **Recipient = lead, not free-form.** Every sample must attach to a `lead`
  row. If the recipient isn't a lead yet, the form forces creating one inline.
  This guarantees `sample → pilot_order` stage progression has somewhere to
  land and prevents "untracked sample" drift. (The same constraint is what
  makes sample-status a meaningful pipeline metric per b2b-pipeline.md.)
- **Sample tag is authoritative on the Shopify side.** Our `is_sample` boolean
  is set from `shopifyOrder.tags` in the sync path, not from local state at
  creation time. This means: a sample manually re-tagged in Shopify Admin
  flows back correctly; a sample whose tag is removed loses the flag (and
  re-enters revenue). One source of truth.
- **Auto-complete the draft as paid.** The draft order is immediately
  completed via `draftOrderComplete` with `paymentPending = false`, so it
  becomes a real Shopify order and Shopify fulfillment ships it like any
  other paid order. No human step in Shopify Admin. (Contrast with
  influencer gifting, which leaves the draft open with a pay-link the
  influencer typically never uses.)
- **Lead auto-advances to `sample` stage on send.** If the lead's current
  stage is `lead` or `prospect`, we move it to `sample` and timestamp.
  Stages further along (`pilot_order`, `recurring_order`, `partnership`)
  are not regressed — sending a follow-up sample to an existing customer
  doesn't move them backward.
- **Recipients stay OUT of the `customer` table / marketing audiences.**
  The `lead` row is the system of record for a sample recipient. We do not
  let $0 sample recipients sync into `customer` or into D2C marketing
  lists — they're filtered out of customer data the same way sample orders
  are filtered out of revenue. This is consistent with the `crm-leads`
  rule (no `customer` row until a real paid order). Implication: when the
  completed sample order syncs back, if Shopify auto-created a customer
  from the recipient email, that customer must be tagged
  `sample-recipient` and excluded from customer-facing queries — OR we
  avoid creating a Shopify customer at all (guest draft). See Phase 2/3.
- **A sample advances the stage but does NOT mark the lead converted.**
  `lead.status` stays `active` (not `converted`) when a sample ships.
  "Converted" is reserved for a real paid wholesale order (`pilot_order`
  or beyond). Keeps conversion-rate metrics honest — sample-status is the
  central pipeline metric, distinct from won business.
- **No sample-cost (COGS) tracking in v1.** Samples ship at $0 with no
  cost recorded. If a sample-spend or sample→pilot ROI dashboard is asked
  for later, add a per-line-item COGS field (generalizes to all orders)
  rather than a separate cost table. Parked, not forgotten — see Notes.

## Dependencies

- `src/lib/schema.ts` — add `isSample` + `leadId` to `order` table.
- `src/lib/shopify/sync.ts:188` (`upsertOrder`) — read `sample` tag from
  Shopify order, set `is_sample`. The tag-parsing logic must be tolerant of
  whitespace and case.
- `src/lib/shopify/client.ts:760` (`createDraftOrderInvoice`) — extend with
  `tags?: string[]`, `shippingAddress?: ShopifyAddress`, and
  `completeAsPaid?: boolean`. The completion path calls a new
  `draftOrderComplete` GraphQL mutation with `paymentPending: false`.
- `src/components/catalog/product-combobox.tsx` — reused as-is for SKU
  selection. Already supports multi-select via `onSelectMany`.
- `src/lib/crm/constants.ts:8` — `LEAD_STAGES` already includes `"sample"`;
  no enum change needed.
- `src/lib/analytics/attribution.ts:82, 139` — add `not(order.isSample)` to
  `getChannelPerformance` and `getPixelAttributedChannelPerformance`.
- `src/app/api/admin/funnel/route.ts:20` — add the same filter to dashboard
  funnel revenue.
- `src/components/layout/admin-sidebar.tsx:57-76` — add `/samples` nav entry
  under the **Customer** group, next to **Leads**.
- `src/app/(admin)/leads/[id]/page.tsx` (or equivalent) — add "Samples
  shipped" panel + "Ship a sample" CTA on lead detail.

## Scope

**In:**
- Schema migration: `order.is_sample boolean default false`,
  `order.lead_id int FK lead.id nullable`.
- Sync hook: tag-driven `is_sample` setter in `upsertOrder`.
- Extended `createDraftOrderInvoice` (tags, shipping address, auto-complete).
- New API route `POST /api/admin/samples` that creates draft → completes →
  records local order → advances lead stage, all in a transaction-shaped
  flow with the same graceful-failure pattern as influencer-orders
  (record locally even if Shopify push fails; surface warning).
- New admin page `/samples` (list view) and `/samples/new` (create form).
- Lead-detail page integration: samples panel + CTA.
- Three revenue/attribution query filters updated.
- Audit of remaining `from(order)` queries; per-query call on whether to
  include or exclude samples. Some dashboards (e.g. fulfillment ops,
  shipping volume) probably *should* include them.
- Tests: unit for tag parsing, integration for the create-sample API route
  (mocked Shopify), Playwright for the create form.
- Spec updates: `specs/current/schema.md`, `specs/current/routes.md`,
  `specs/current/components.md` if a reusable component is extracted,
  `specs/strategy/b2b-pipeline.md` cross-link to the new flow.

**Out:**
- Influencer gifting changes. Existing flow stays as-is.
- Follow-up automation (sample-age nudges, stalled-sample alerts). That
  belongs in the **lead-followup-rule-engine** work plan already in
  `todo/`, which can read `is_sample` + `lead.stage` once this lands.
- Bulk sample creation (e.g. ship 20 samples to a trade-show list). Single
  recipient at a time for v1.
- Inventory hold / pre-allocation. Shopify decrements stock on order
  creation; that's enough for v1.
- Address book / saved-recipient shortcuts. Recipient is always pulled
  from the linked lead; address edits live on the lead.
- Auto-creating a `company` row from a sample form. Lead → company linkage
  is its own flow; samples respect it but don't extend it.
- Per-sample cost accounting (COGS attribution to marketing budget). Could
  layer in later if we want sample spend in the dashboard.

## Implementation Phases

### Phase 1: Schema + Shopify client extension ✅ (code complete 2026-06-09; prod migration pending)

- [x] Add `isSample: boolean("is_sample").notNull().default(false)` to `order`
  in `src/lib/schema.ts`.
- [x] Add `leadId` to `order` (nullable). **Correction:** typed `text("lead_id")`,
  not `integer` — `lead.id` is a `text`/UUID PK, not an int. FK via thunk
  (`() => lead.id`) works as a forward reference even though `order` is
  declared before `lead` in the file.
- [x] Index on `(is_sample, processed_at)` for dashboard filtering, **plus**
  `order_lead_id_idx` on `lead_id` (Phase 5's "samples shipped" panel queries
  `order.lead_id = lead.id`).
- [x] Added `lead` relation to `orderRelations` so the lead-detail panel can
  use `db.query.order.findMany({ with: { lead: true } })`.
- [x] `npm run db:generate` → `drizzle/migrations/0055_mysterious_justin_hammer.sql`
  (fully additive: add 2 columns + 1 FK + 2 indexes, no backfill). Reviewed,
  applied to local `oliver-dev` via `npm run db:migrate`.
- [x] Extend `createDraftOrderInvoice` in `src/lib/shopify/client.ts`:
  - `tags?: string[]` → `DraftOrderInput.tags`.
  - `shippingAddress?: DraftShippingAddress` (camelCase GraphQL shape, not the
    REST `ShopifyAddress`) → `DraftOrderInput.shippingAddress`, null/empty
    fields stripped.
  - `completeAsPaid?: boolean` → after `draftOrderCreate`, calls
    `draftOrderComplete(id, paymentPending: false)` and returns the completed
    `orderId` / `orderName`.
  - Extracted the input mapping into an exported pure `buildDraftOrderInput()`
    + a `DraftOrderInvoiceParams` type. Influencer caller is unaffected (new
    fields are all optional).
- [x] Unit-tested `buildDraftOrderInput` (16 cases: variant vs custom lines,
  tag include/omit, address cleaning, discount on/off + default title,
  purchasingEntity, email/note conditionals). `npm run check` green — 681
  tests pass. The completion *call sequence* is left to the Phase 3
  integration test, which mocks the Shopify client at the module boundary
  (the GraphQL methods can't be unit-tested without HTTP mocking, matching
  the existing client.test.ts philosophy of testing pure helpers only).
- [ ] **NOT YET DONE — prod gates (do before pushing):**
  - [ ] Schema review with Greg (Critical Rule 5 — new column on shared `order`).
  - [ ] `npm run db:migrate:prod` to apply 0055 to production *before* the push
    (Critical Rule 2 — Vercel deploys on push; new code mustn't hit a DB
    without the columns). Migration is additive so safe to apply ahead of code.
  - [ ] Scope check — **likely already covered, confirm on dev.** Current
    `shopify.app.toml` scopes include `write_draft_orders` (governs both
    `draftOrderCreate` and `draftOrderComplete`) and `read_orders` (to read
    the completed order back). `draftOrderComplete` does NOT require the
    separate `write_orders` scope. Phase 3's dev test should confirm the
    completion succeeds under current scopes; only if Shopify returns an
    access-denied is a scope change needed (→ `specs/current/shopify-app-config.md`).

### Phase 2: Sync hook + tag-driven flag

- [ ] In `src/lib/shopify/sync.ts` `upsertOrder()` (around line 188), parse
  `shopifyOrder.tags` (Shopify returns either a comma-separated string or
  an array depending on API surface — handle both) into a normalized,
  lowercased, trimmed set. Set `isSample = tags.has("sample")`.
- [ ] Verify on `onConflictDoUpdate` path — re-syncing an order whose tag
  has been removed must clear the flag (re-include in revenue).
- [ ] Unit test the tag parser: empty, single, comma-separated, array,
  mixed-case, whitespace, "samples" (plural — should NOT match).
- [ ] One-shot backfill script: scan existing orders with `sample` tag and
  set the flag. Probably zero rows today, but the script is cheap and
  documents the rule.

### Phase 3: API route — create sample

- [ ] `POST /api/admin/samples` in `src/app/api/admin/samples/route.ts`,
  modeled on `src/app/api/influencer-orders/route.ts` (graceful-failure
  pattern: record locally even if Shopify push fails; surface warning).
- [ ] Zod schema: `{ leadId, lineItems: [{ shopifyVariantId, quantity }],
  shippingAddress?, note? }`. Shipping address defaults to the lead's
  company address; form sends it explicitly so the API doesn't need to
  re-derive.
- [ ] Flow:
  1. Auth check (admin only — not supplier/company roles).
  2. Load lead + linked company; reject if neither has an address.
  3. Resolve variants via `getCatalogCached()`; reject unknown SKUs.
  4. Call extended `createDraftOrderInvoice` with
     `discountPercent: 100`, `discountTitle: "Sample"`,
     `tags: ["sample"]`, `shippingAddress: <resolved>`,
     `completeAsPaid: true`. Record draft + completed order IDs.
  5. The completed Shopify order will sync back via the next
     `extract-shopify` cron and populate our `order` row with
     `is_sample = true` (from the tag) — we don't pre-insert. But we DO
     need to attach `lead_id`, which the sync path doesn't know about.
     Two options:
     - (a) Insert a placeholder `order` row immediately with the Shopify
       order ID + `lead_id` set, let the sync upsert fill in the rest.
     - (b) Stash `{shopify_order_id → lead_id}` in a side table; sync
       reads it.
     - **Recommendation: (a).** The sync's `onConflictDoUpdate` on
       `shopifyId` already handles this gracefully — it updates without
       overwriting `lead_id` (we make `lead_id` not part of the update
       set). One round-trip, no side table.
  6. Advance lead stage: if `lead.stage IN ('prospect', 'lead')`, set to
     `'sample'` and stamp `updatedAt`. Otherwise leave alone.
  7. Return `{ data: { orderId, shopifyOrderId, leadId, leadStage } }`.
- [ ] Integration test: mock Shopify client, hit the route, verify the
  order row, the lead stage change, and the warning surface on Shopify
  failure.

### Phase 4: Admin UI — list + create

- [ ] New nav entry "Samples" under the **Customer** group in
  `src/components/layout/admin-sidebar.tsx`, slotted between **Leads**
  and **Customers**.
- [ ] `/samples` list page: table of all `is_sample = true` orders. Cols:
  recipient (lead name + company), items (SKU + qty), ship date,
  fulfillment status, days since send. Filter by lead-stage and date.
- [ ] `/samples/new` create form:
  - **Step 1:** Lead picker. Combobox over existing leads with stage
    filter (default to `lead` + `prospect`). "Create new lead" link
    deep-links to the existing leads-capture flow with `returnTo=/samples/new`.
  - **Step 2:** Items. Reuse `ProductCombobox` in multi-select mode
    (`onSelectMany`). Quantity input per row, default 1.
  - **Step 3:** Confirm address. Pre-filled from lead's company; editable.
  - **Step 4:** Optional internal note ("Hodinkee pitch", "WindUp booth
    follow-up", etc.).
  - Submit → POST to `/api/admin/samples`. Toast on success/warning.
    Redirect to the new sample row in the list view.
- [ ] Playwright: create-sample happy path with mocked Shopify.

### Phase 5: Lead-detail integration

- [ ] On the lead-detail page, add a "Samples shipped" panel showing all
  orders where `order.lead_id = lead.id AND order.is_sample = true`.
- [ ] Quick action: "Ship another sample" button that opens
  `/samples/new?leadId=<id>` with Step 1 pre-filled.
- [ ] If the lead is already in `sample` stage, show days-in-stage
  prominently (it's the metric we're trying to track per b2b-pipeline.md).

### Phase 6: Attribution + analytics filters

- [ ] `src/lib/analytics/attribution.ts:82` (`getChannelPerformance`) —
  add `and(not(order.isSample))` to the where clause.
- [ ] `src/lib/analytics/attribution.ts:139`
  (`getPixelAttributedChannelPerformance`) — same.
- [ ] `src/app/api/admin/funnel/route.ts:20` — same.
- [ ] Repo-wide audit: `grep -rn 'from(order)' src/` and triage each call
  site. For each, decide: revenue-shaped (filter samples out), fulfillment
  /ops-shaped (keep samples in), or sample-specific (filter to samples
  only). Document the call in the file.
- [ ] Sanity test: insert a sample order via the new flow; verify it
  doesn't show in `/dashboard` revenue, doesn't appear in `/attribution`
  channel breakdown, but does show in `/samples` and on the lead detail.

### Phase 7: Spec doc updates

- [ ] `specs/current/schema.md` — document new `order` columns.
- [ ] `specs/current/routes.md` — add `/samples`, `/samples/new`,
  `/api/admin/samples`.
- [ ] `specs/strategy/b2b-pipeline.md` — add a cross-reference in the
  `sample` stage section ("operational flow: see /samples").
- [ ] `AGENTS.md` context-loading table — add a row:
  "Adding or modifying B2B sample shipments → `specs/current/routes.md`
  + `specs/strategy/b2b-pipeline.md` (sample stage)".

## Notes

### Resolved (confirmed with Oliver, 2026-06-09)

All three previously-open product questions were decided — see the matching
bullets in **Decisions**:
- Sample recipients stay OUT of the `customer` table / marketing audiences.
- A sample advances the lead's stage but does NOT mark it converted.
- No COGS / sample-cost tracking in v1.

### Open question carried into implementation

- **Does Shopify auto-create a customer when we complete a $0 draft, and
  does it sync back into our `customer` table?** This is now a
  *verify-on-dev* task, not a product decision — the product decision
  ("keep recipients out of customer data") is made. Phase 3 must confirm
  the behavior of `draftOrderComplete` re: customer creation, and Phase 2
  must guarantee the exclusion holds regardless of which way Shopify
  behaves. Two viable implementations, pick after the dev test:
  - **(a) Guest draft** — send `email` + `shippingAddress`, no
    `purchasingEntity`. If Shopify still mints a customer on completion,
    tag it `sample-recipient` and exclude that tag from customer queries.
  - **(b) Explicit tagged customer** — upsert a Shopify customer tagged
    `sample-recipient` up front, attach via `purchasingEntity`, exclude
    by tag in sync. More deterministic, slightly more API work.
  Preference is (a) for less moving parts, falling back to (b) only if
  (a)'s customer-creation behavior is unpredictable. Either way, the
  invariant — *sample recipients never count as customers* — is fixed.

### Parked (revisit when asked)

- **Sample-cost (COGS) tracking.** Out of v1 per the decision above. When
  the dashboard ask comes: add COGS to `order_line_item` (generalizes to
  all orders, gives us margin everywhere), not a bespoke sample-cost
  table. This unlocks "sample spend per channel" and "sample → pilot ROI".

### Risks

- **Forgetting the `not(is_sample)` filter somewhere.** Phase 6's repo
  audit mitigates this for the current state, but every new revenue
  query is a new chance to miss it. Mitigation: add a comment block to
  the top of `attribution.ts` and `funnel/route.ts` explaining the
  convention, and consider a lint rule or a `revenueOrders()` helper
  query builder later if the misses pile up.
- **Tag-driven `is_sample` is bypassable by editing the tag in Shopify
  Admin.** A rep removing the `sample` tag from a shipped sample would
  cause that order to re-enter revenue on next sync. Accept this as a
  feature, not a bug — there are legitimate reasons to "convert" a
  sample to a paid order retroactively (rare but real). Log the
  transition so we can audit if surprises happen.
- **`draftOrderComplete` with `paymentPending: false` records the order
  as paid for $0.** Shopify's own dashboard will show a $0 paid order,
  which is visually weird. The `sample` tag is the only signal that
  separates it from a fraud/bug. Mitigation: make the tag visible in the
  Shopify order-list view (it is by default) and document the convention
  in `specs/current/integrations.md`.

### Sequencing relative to other todo plans

- **`lead-followup-rule-engine`** — reads `lead.stage` and timestamps. Once
  this plan lands, the engine gets a natural "sample stalled >N days"
  rule. No coupling required; just a bigger surface for the engine to act
  on. Land samples first; the engine consumes its outputs.
- **`production-management`** — production POs (incoming inventory). No
  overlap. Samples ship existing inventory; POs create new inventory.
- **`klaviyo-integration` / `grapevine-integration`** — could eventually
  drive sample-follow-up email. Out of scope here; document as future
  work once both lands.
