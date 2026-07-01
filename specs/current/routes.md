# Routes

Last updated: 2026-06-01

## (marketing) — Public Pages

| Path | Description | Auth |
|------|-------------|------|
| `/` | Homepage — hero, value props, social proof | None |
| `/micro-adjust` | Product education — how micro-adjust works | None |
| `/compare/[slug]` | Comparison pages (e.g. `/compare/deployant-vs-micro-adjust`) | None |
| `/for-brands` | B2B landing page for watch brand partnerships | None |
| `/creator-signup` | Influencer/creator self-registration form — name + **email and/or phone-WhatsApp (at least one required)** + **multiple** social profiles (add/remove rows; platform dropdown incl. **Other → free-text platform name + domain**, which builds a clickable profile URL). Shareable link sent to creators; submissions land in `/creators` as `source=self_registration`, `vettingStatus=unreviewed` for the team to vet (no admin data entry), and fire a team notification + email. Honeypot-guarded | None |
| `/privacy` | Privacy policy | None |
| `/terms` | Terms of service | None |

All marketing pages include PostHog tracking and UTM parameter capture.

## auth

| Path | Description | Auth |
|------|-------------|------|
| `/auth/login` | Admin login page (Google OAuth) | None |
| `/external/login` | External user login — suppliers + B2B portal (email magic link); `/supplier/login` permanently redirects here | None |
| `/portal/login` | Company B2B portal login (email magic link) | None |

## (admin) — Protected Dashboard

All routes require authenticated admin session. Middleware redirects to `/auth/login` if unauthenticated.

| Path | Description |
|------|-------------|
| `/dashboard` | Overview — revenue, orders, traffic KPIs |
| `/assistant` | **AI data assistant** ("talk to your data") — ask questions in plain English; the agent writes **read-only** SQL (Postgres, via a dedicated read-only role) or HogQL (PostHog) and shows its work (every query + rows). Self-discloses source/units; refuses to fabricate missing data. Sonnet default with an Opus toggle. Two-pane: multi-session history sidebar (reopen/rename/delete) + chat. Admin-only |
| `/leads` | CRM lead list ("B2B Leads") — name/company/stage/source/captured, filters (stage, source, status, search). Tabbed with Messages to Send (SectionTabs) |
| `/leads/new` | Manual lead entry form |
| `/leads/capture` | Mobile-first 3-mode capture: photo (Claude vision OCR), live QR (vCard / MeCard / URL → fields), or type manually |
| `/leads/[id]` | Lead detail — editable fields with stage/persona/source pickers, "Convert to Company" (sets `companyId` + `status='converted'`; does **not** materialize a Shopify `customer` row), drop (soft-delete), card image gallery + raw OCR text. History tab adds comments + shows them with drafted/sent emails; Replies tab shows the contact's emails across all team inboxes |
| `/messages` | "Messages to Send" tab (under B2B Leads) — queue of AI-drafted follow-up emails. Edit subject/body, copy, mark sent, or dismiss |
| `/customers` | "Customers" → **Consumer** tab: consumer list with search/filter/sort. Tabbed with B2B (SectionTabs) |
| `/customers/[id]` | Individual customer detail — orders, LTV, attribution |
| `/customers/brands` | "Customers" → **B2B** tab: B2B companies + price tiers (CRUD) |
| `/customers/brands/[id]` | B2B company detail — tabbed: **Overview** (details, People, order/PO/invoice history) and **Activity** (`company-activity`) — a unified, newest-first feed mirroring the PO Activity timeline: email correspondence (received + sent across all connected inboxes, lazily fetched, violet *Email* badge) merged with documents (manual uploads + read-only docs from the company's POs, each linking to its PO). Email is **only** here, not in Overview |
| `/customers/companies` | Redirect → `/customers/brands` |
| `/invoices` | "Orders" → **B2B** tab: B2B invoice list. Tabbed with Consumer (SectionTabs) |
| `/invoices/new` | Create an invoice (company + line items at retail − tier) |
| `/invoices/[id]` | Invoice detail — status, send, create-PO actions |
| `/invoices/[id]/edit` | Edit a draft/sent invoice (company is fixed) |
| `/invoices/[id]/print` | Printable invoice document (pay link + bank-wire remittance) |
| `/orders` | "Orders" → **Consumer** tab: consumer order list with filters. Tabbed with B2B (SectionTabs) |
| `/campaigns` | Campaign list — performance overview |
| `/campaigns/[id]` | Campaign detail — spend, conversions, ROAS |
| `/attribution` | UTM attribution analysis |
| `/funnel` | Funnel visualization (sessions → users → orders, operational end-state view) |
| `/funnel/strategy` | Strategic / diagnostic funnel — 6-stage acquisition, 5-stage retention loop, channel breakdown, first-order discount split (360 W5 §6 C1 measurement; classification in `src/lib/discount-codes.ts`). Aligned with `specs/strategy/funnel.md`, `retention-loop.md`, `personas.md`. |
| `/creators` | Unified creator database (735-prospect import) — sortable/filterable list (platform, status, search, fit/reach/ER/last-post sort, URL-state), burned hidden by default. **Default landing IS the to-vet queue** (unreviewed only); approve/reject both empty it (approved → "Approved" pill). "⚠ Mismatch N" pill + per-row ⚠ flag surface possible bad cross-platform merges. **"Self-registered N" pill** filters to creators from the public `/creator-signup` form awaiting vetting (`source=self_registration`). Replaces the influencer pages once the gifting flow is re-pointed (creator-program.md decision 2026-06-12) |
| `/creators/[id]` | Creator detail — header Approve/Reject vetting buttons + bad-merge banner; per-platform stats cards each with an **Edit / fix** control (edit handle/platform/url/bio/verified, **Split off** onto a new creator, **Reassign** to another, Delete); posts feed, gifting orders (via `creator_id` links); editable emails (add/remove/kind/portal); discount codes; full editor (name, primary platform, status, rank boost, country, notes) |
| `/influencers` | Influencer list (CRUD) — handle/platform, assigned collections, portal-login allowlist. **Retiring into `/creators`** (unification in progress) |
| `/influencer-tracking` | Gifting orders + content-deadline tracking (approaching / missed / hit); inline-edit deadline, mark published, affiliate link |
| `/influencer-tracking/new` | New gifting order — a **mode toggle**: *Create new gift draft* (100% off Shopify draft; product picker limited to the influencer's assigned collections; content due date + affiliate link; shared `LineItemRow` UI, split-fulfillment grid, staged document attachments → detail page) **or** *Record existing Shopify order* (enter a Shopify order number → preview its line items + tracking + delivery → record it with `shopify_order_id` set, no new draft) |
| `/influencer-tracking/[id]` | Gifting-order detail/edit — full-parity edit form (line items via the shared `LineItemRow`, split-fulfillment grid sourced from the influencer's linked Shopify customer addresses, deadline / published / affiliate / status / platform), a **Sample logistics** card (tracking number + URL, shipped date, delivered/received date with "Mark received today" — auto-filled by fulfillment webhooks, manually editable), document attachments, and **Save & send gift** (pushes the gifting draft + emails the creator). Reuses the same shared modules as the B2B invoice edit form |
| `/products` | Product performance breakdown (+ incoming production qty per SKU) |
| `/cogs` | Cost of goods sold — per-SKU quantity-weighted average unit cost from purchase orders, applied to units sold (date-range filtered) for COGS + gross margin. Cost basis = PO lines that are received **or** linked to a paid invoice (prepaid-before-arrival), non-cancelled, with the multi-supplier cost rollup. Blends ongoing production POs with historical Shopify POs imported via `scripts/import-shopify-pos.ts`. Sample orders excluded; uncosted SKUs flagged and kept out of totals. Logic in `src/lib/cogs/` (pure math in `compute.ts`, unit-tested) |
| `/inventory` | Incoming inventory — per-SKU units in production, stage breakdown, projected ETA |
| `/modules` | Modules hub (Production; Marketing coming soon) |
| `/modules/production` | "POs & Production" — unified PO list + production tracking. Group toggle: Master (one row per master PO, cascades to sub-POs and SKUs) / Sub-PO (one row per sub-PO, cascades to SKUs) / SKU. View toggle: Incoming Inventory (default) / Production Board (kanban) / Production Timeline (Gantt). Instant filters: supplier, status, stage, size, colour, date range (defaults to a rolling 30 days by issued date). **Open POs (active/on-hold) always show regardless of the date window** — it only constrains completed/historical POs — so a long-running in-flight PO never silently ages out (`isOpenPoStatus`). Absorbed the standalone Purchase Orders and Production Summary pages. The by-PO list columns: PO# · Supplier (lists each supplier on a master) · Collections (Shopify, excluding the catch-all "All Products") · Customer (linked company) · Items · Stage · Final ETA — the Final ETA cell flags **"N ETAs not set"** in amber when in-flight line items still lack an explicit `expected_completion_date`. Expanding a row reveals an Open-PO link (master → "Open Master PO", sub-PO → "Open Sub PO") |
| `/modules/production/po/new` | Create a PO with line items (inline "Add new" for supplier + B2B customer; the customer contact email searches synced Shopify customers and links the matched customer) |
| `/modules/production/po/[id]` | PO detail — stage advance, status, and a `DetailTabs` layout: **Items / Production timeline / Activity** (notes & documents). A **sub-PO** shows the same three tabs, scoped to that supplier — Items = its covered lines + costs/ETA (`SubPoCovers`), the Production timeline walks only the supplier's owned stages, and Activity is its own private thread. Posting a note notifies the supplier by email + supplier-portal notification |
| `/modules/production/po/[id]/edit` | Edit PO header + line items (add/update/remove) |
| `/modules/production/po/[id]/send` | Printable PO preview; email it (HTML) to the supplier. The sending admin is auto-CC'd, and every `supplier_contact` row for the PO's supplier (other than the address in "To") is also auto-CC'd so the whole vendor team gets the PO — the list is surfaced in the form before send |
| `/modules/production/kanban` | Kanban board — drag line items across stage columns |
| `/modules/production/supplier-leads` | Supplier Leads list — captured supplier business cards (potential new suppliers): name/company/supplier-type/status/captured. "Capture supplier" button |
| `/modules/production/supplier-leads/capture` | Mobile-first 3-mode supplier-card capture: photo (Claude vision OCR), live QR, or type manually → review → save. Mirrors `/leads/capture` (reuses its `CardCamera`/`QrScannerView`) but feeds the supplier pipeline |
| `/modules/production/supplier-leads/[id]` | Supplier lead detail — editable fields + **Create supplier** (promote → real `supplier` row, `status='converted'`, redirects to the supplier) + drop (soft-delete) |
| `/modules/production/suppliers` | Supplier CRUD. Detail page also lists the vendor's prototypes |
| `/modules/production/prototypes` | **Road Map & Prototypes**. Top: **Product ideas** — rough concepts scored by ICE (impact×confidence×ease), with status (idea→under review→approved→promoted/parked) and "Promote to prototype". Below: prototype list — proposed SKUs in the sample phase. Filter by status/vendor, "Add prototype" (multi-select candidate vendors + create-vendor-inline). Vendor column shows the candidate set with the awarded one marked. Rows link to detail |
| `/modules/production/prototypes/[id]` | Prototype detail — editable fields, **awarded vendor** picker (from candidates), a **Vendors & quotes** card to add/remove candidate vendors (or create one inline), **send each an RFQ email** (PO email path), and **record received quotes** (unit price/lead time/MOQ/tooling) with the lowest highlighted, **Promote to product** (records `final_sku`, stamps `approved_at`), concept reference files, and the **sample rounds** timeline (each round: status/dates/qty/cost/feedback + sample photos) |
| `/products/cad-models` | **CAD Models** tab on Products (SectionTabs; no separate nav entry). CAD library — reusable saved CAD models. Add a model, Generate from Fusion (or upload an OBJ/STL) → auto-converts to a metallic GLB (server-side, Node) with an inline 3D preview. OBJ keeps Fusion satin/cast finishes; STL is fully polished. One model shared across many SKUs (color variants) |
| `/trade-shows` | Trade Shows list (top-level nav) — show cards with a visited-progress bar |
| `/trade-shows/[id]` | Vendor worklist for one show. Mobile-first: progress bar, search + side (supplier/customer) / visited / priority filters (client-side), **sort** (floor plan / priority [value, then hot] / lead value / temperature), tap-to-toggle visited checkbox per row, indicators for temperature (coloured dot) / lead value (★N) / card scanned / pipeline-linked / follow-up status. Rows link to the vendor detail; **Triage all** link → the bulk triage page |
| `/trade-shows/[id]/triage` | Bulk triage — every vendor on one desktop page (company + booth/category, pre-show & booth notes), with inline **type** (supplier/customer/both), **temperature** (hot/warm/cold), and **lead value** (★1–5) controls that auto-save per change (optimistic, no per-row save). Rows hold their position while editing; a "N / total triaged" progress bar counts vendors with both a temp and a value. The post-show first pass before working the sorted worklist |
| `/trade-shows/[id]/vendors/[vendorId]` | Vendor detail capture surface — mark visited, **gave-a-sample** toggle, editable **type** (supplier/customer/both), **multiple contacts** per booth (add manually or scan a card → new contact, click the card image to enlarge it; edit/delete each; star one as primary), company website + booth notes (with push-to-dictate), record **voice notes** (MediaRecorder → Blob + live Web Speech transcript), set follow-up status + **temperature** (hot/warm/cold) + **lead value** (★1–5) + next steps, **Convert** to a Supplier Lead and/or Customer Lead (both always offered; uses the primary contact; shows a link once promoted), and **delete** the vendor (confirm → back to the worklist) |
| `/settings` | Admin settings (nav bottom) — env/DB info **plus** the consolidated config: wire-transfer/billing details (moved from Orders), production-stage editor (moved from POs & Production), and B2B **price tiers** (moved from the B2B Customers page). Brands still pick a tier on the B2B customer form |

## supplier — Supplier Portal

Magic-link auth; middleware requires an authenticated session with `role='supplier'` (else → `/external/login`). Signed-in admins are redirected to `/dashboard`; suppliers who hit admin routes are sent here. Every page is scoped to the signed-in supplier's `supplier_id` and shows production fields only (no company / customer / price-tier).

| Path | Description |
|------|-------------|
| `/supplier` | The supplier's own POs (list) + kanban. On login, a **modal nudge** (`missing-eta-nudge`) appears when the supplier still has line items they own (`currentStage` in their owned stages, unreceived) without a Final ETA — lists those POs (linked) so they go set the dates. Dismiss persists per browser session (sessionStorage); a fresh login re-nags until every line has an ETA |
| `/supplier/po/[id]` | PO detail — advance stages, edit the expected delivery date, and a unified notes & documents timeline (post notes + edit your own, upload documents; no edit/delete of stage-history events); 404 if not their PO. Posting a note/doc emails Fitwell + adds an admin notification. **ETA + timeline target**: on a standalone PO, both target that PO's own row. On a master (multi-supplier split), the page surfaces the *viewing supplier's* sub-PO — the ETA edits the sub-PO's date, and the supplier's posts target the sub-PO too (their private thread). The displayed timeline merges the **master's thread** (admin broadcasts to every supplier) with the supplier's own sub-PO thread, so a single master upload reaches every sub-PO supplier without duplication. A stage-only viewer on a master with no sub-PO of their own stays read-only on ETA and sees the master's thread |
| `/supplier/po/[id]/print` | Printable PO document for the supplier — the same artifact admins print/email from `/modules/production/po/[id]/send` (shared `PrintablePo` component), scoped to the viewing supplier's sub-PO (their stages, their per-line costs). Reached via the "Print / Save PDF" button on the PO detail page; `window.print()` → browser save-as-PDF. 404 if not their PO; a stage-only viewer on a master with no sub-PO of their own can't print it (would leak other suppliers' costs) |
| `/supplier/notifications` | Supplier notification inbox — notes & documents Fitwell posted on the supplier's POs (mark read; same system as the admin inbox). Unread count shows as a bell badge in the top bar |

## portal — Company B2B Portal

Magic-link auth; middleware requires `role='company'` (else → `/portal/login`). Companies are kept out of admin/supplier areas, and admins/suppliers out of the portal. Scoped to the signed-in user's `company_id`; prices reflect the company's price tier.

| Path | Description |
|------|-------------|
| `/portal` | Browse the catalog at the company's tier price; build a cart and check out |
| `/portal/orders` | The company's own order history (paid/sent invoices) with Shopify pay links |

## API Routes

### Auth
| Method | Path | Description |
|--------|------|-------------|
| * | `/api/auth/[...nextauth]` | NextAuth handler (login, callback, session) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | App health check |

### Public (storefront)
No auth. Read-only, open CORS + edge-cached so the Shopify storefront can fetch them cross-origin.
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/review-summary` | Shop-wide review rating + count (`{ data: { rating, count } }`) from the `review` table. Powers the dynamic storefront "review pill" (snippet `fw-review-pill.liquid`) that replaced the old hardcoded static pills. 1h edge cache; source data refreshed daily by the Judge.me extract. |

### Admin API (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/customers` | List customers (paginated, filterable) |
| GET | `/api/admin/customers/[id]` | Customer detail |
| POST | `/api/customers/brands/[id]/attachments` | Upload a document to a B2B company (Vercel Blob → `company_attachment`); shown in the company Activity tab. Admin-only |
| GET | `/api/customers/brands/[id]/emails` | Email correspondence for a B2B company — received from + sent to its contact addresses (free-text `contact_email` + portal-login contacts) across all connected team inboxes, deduped by Gmail id, newest first, with a Gmail deep-link each. Admin-only. Loaded lazily by the company Activity tab (`company-activity`) and merged into the documents feed (violet *Email* badge), mirroring the PO `emails` endpoint, so the page never blocks on Gmail |
| DELETE | `/api/customers/brands/attachments/[attachmentId]` | Remove a manually-uploaded company document (PO-sourced docs are read-only). Admin-only |
| GET | `/api/admin/orders` | List orders (paginated, filterable) |
| GET | `/api/admin/funnel` | Funnel data (date range) |
| GET | `/api/admin/cohort` | Cohort analysis data |
| GET | `/api/admin/attribution` | Attribution breakdown |
| GET | `/api/admin/campaigns` | Campaign performance list |
| GET | `/api/admin/campaigns/[id]` | Campaign detail with daily metrics |
| POST | `/api/admin/assistant` | Ask the AI assistant (`{ conversationId?, message, model? }`). Runs the read-only agent loop (Postgres + PostHog tools), persists the turn (history + query catalog), returns `{ conversationId, answer, steps, stoppedAtStepLimit, model }`. Admin-only |
| GET | `/api/admin/assistant/conversations` | List the signed-in admin's assistant conversations (newest first). Admin-only |
| GET / PATCH / DELETE | `/api/admin/assistant/conversations/[id]` | Load a conversation (messages + replay steps) / rename / delete. Ownership-scoped to the signed-in admin. Admin-only |

### Production API (each handler checks `auth()`)

Supplier scoping: when the session `role='supplier'`, write endpoints are restricted to the supplier's own POs — `advance`, `comments` (add + author-only edit), `attachments` (upload), and `line-items/[id]/stage` are owner-checked (403 otherwise); PO edit (`PATCH`/`PUT po/[id]`), receive, stage-event date edits, attachment delete, and supplier-contact management are admin-only (403 for suppliers). Admins are unaffected.

Cross-party notifications: **every PO write** fires an in-app notification + email to the other side via `notifyPoUpdate` (the supplier-bound type is `update_for_supplier`; admin-bound is `update_for_admin`). Notes and document uploads keep their existing `notifyPoActivity` alerts; the `send` flow already emails the supplier directly so it isn't double-notified. Stage advances also keep their existing `stage_handoff` milestone alert for the supplier-completes case — the generic update lives alongside it so the recipient still sees every move.
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/production/shopify-refs` | Warehouses (Shopify locations) for the PO picker; needs `read_locations` |
| GET | `/api/production/customer-search` | Typeahead over synced customers (name/email) for linking a company |
| POST | `/api/production/companies` | Create a company. If a `contactEmail` is given, auto-attaches a matching **unlinked** lead (preferred) or Shopify customer as the company's primary contact (`lib/b2b/attach-contact.ts`) — so "turning a lead into a company" keeps the person attached |
| PATCH | `/api/production/companies/[id]` | Update a company |
| POST | `/api/production/companies/[id]/contacts` | Add a B2B portal login email to a company (Phase 7 allowlist); admin-only |
| POST | `/api/production/companies/[id]/people` | Attach/detach a person or set Primary Contact — JSON `{ kind: "lead"\|"customer", entityId, action: "add"\|"remove"\|"make_primary" }`. add/remove set/clear their `company_id` (remove also clears the company's primary pointer if it was them); make_primary points `company.primary_contact_*` at them. Powers the company "People" list |
| GET | `/api/crm/people-search?q=` | Typeahead over leads + Shopify customers (name/email/company) to attach to a company; returns `{ kind, id, label, sublabel, companyId }[]` |
| DELETE | `/api/production/company-contacts/[id]` | Remove a company portal login email; admin-only |
| POST | `/api/production/price-tiers` | Create a price tier (% off retail) |
| PATCH | `/api/production/price-tiers/[id]` | Update a price tier |
| GET | `/api/production/collections` | Shopify catalog grouped by collection (+ Uncategorized). Primary source for the chooser's collection selector — `useCatalog` prefers this (and dedupes variants), falling back to the flat endpoint below |
| GET | `/api/production/products` | Flattened active Shopify catalog (variants + `priceCents` + derived `sizeMm`/`color`). Source for the shared searchable product chooser (`ProductCombobox` / `useCatalog`, with size/colour quick-filters) used by the PO form, invoice form, and future inventory page. Server components use the cached `getCatalogCached` (e.g. the POs page size/colour filter) |
| POST | `/api/production/po` | Create a PO + line items (PO number auto-assigned from a sequence, "00100"+) |
| PATCH | `/api/production/po/[id]` | Update PO fields (status, lock, dates, notes) |
| PUT | `/api/production/po/[id]` | Full edit — header + reconcile line items (add/update/remove) |
| POST | `/api/production/po/[id]/advance` | Advance stage — whole PO (locked) or one line item |
| POST | `/api/production/po/[id]/sub-advance` | Advance a **sub-PO**: `{mode}` — `step` (forward within the supplier's stages) or `complete` (hand off to the next supplier). Admin or the owning supplier |
| PUT | `/api/production/po/[id]/line-costs` | Set a sub-PO supplier's per-line unit costs `{costs:[{lineItemId,unitCostCents}]}`; rolled up onto the master by (supplier, line); admin-only |
| POST | `/api/production/po/[id]/receive` | Receive into Shopify (C2) — `inventoryAdjustQuantities` +qty per line item, with the PO number stamped on the adjustment reference; idempotent per line; admin-only; needs `write_inventory` |
| POST | `/api/production/po/[id]/invoice` | Create invoice(s) from a PO — one per bill-to company, priced at Shopify retail − tier; admin-only |
| POST | `/api/production/po/[id]/comments` | Add a note to a PO. Notifies the other party — an internal note emails the supplier + adds a supplier-portal notification; a supplier note emails Fitwell + adds an admin notification |
| PATCH | `/api/production/po/[id]/comments/[commentId]` | Edit a note's body (`{ body }`, 1–5000 chars). **Author-only** — the update is scoped to `(commentId AND author_user_id = you)` in the WHERE clause, so editing anyone else's note matches no row → 403. Stamps `updated_at` (surfaces "(edited)"). Same PO-scope gate as POST (suppliers limited to their own POs). No notification fired on edit |
| POST | `/api/production/po/[id]/attachments` | Upload a document to a PO (Vercel Blob; multipart). Notifies the other party (same routing as notes) |
| GET | `/api/production/po/[id]/emails` | Emails mentioning this PO — searches the team's connected Gmail inboxes (subject OR body) for the PO number + its SKUs, with a Gmail deep-link each. Deduped across inboxes by **RFC822 Message-ID** (so a CC'd email — a different per-mailbox id in each inbox — collapses to one), preferring the **logged-in user's** copy. Emails that name **only a different PO number** (cross-talk surfaced by a shared buckle SKU, e.g. a "PO #14" thread on PO-00104) are filtered out — `lib/production/po-email-filter`. Admin-only. Loaded lazily by the PO Activity tab's `PoTimeline` (`showRelatedEmails`) and **merged into the notes/documents feed, newest first** (violet *Email* badge), so the page never blocks on Gmail |
| DELETE | `/api/production/attachments/[id]` | Delete an attachment (blob + row) |
| DELETE | `/api/production/po/[id]` | Hard-delete a PO and its dependents (line items, stage events, costs, attachments, comments, sub-POs) via schema FK cascade; admin-only. Confirmation required in UI. Linked Shopify drafts / invoices are NOT auto-revoked |
| POST | `/api/production/line-items/[id]/stage` | Set a line item's stage (kanban drag); locked POs move together |
| GET | `/api/production/stages` | List the active production stages (key + label + position) for the editor |
| PUT | `/api/production/stages` | Replace the pipeline — rename/add/delete/reorder stages. Deleting a stage with items in it requires a `{moves:{key:"forward"\|"back"}}` direction; it soft-deletes (history kept) and moves stranded line items. Admin-only. Drives the POs & Production "Setup" modal |
| PATCH | `/api/production/stage-events/[id]` | Edit a stage transition date (entered_at, day-granularity); syncs the previous stage's exited_at; chronological bounds; admin-only |
| POST | `/api/production/suppliers` | Create a supplier |
| PATCH | `/api/production/suppliers/[id]` | Update a supplier |
| POST | `/api/production/suppliers/[id]/contacts` | Add an authorized login email to a supplier |
| DELETE | `/api/production/supplier-contacts/[id]` | Remove a supplier login email |
| POST | `/api/product-ideas` | Create a product idea (`name`, `description?`, `status?`, ICE `impact`/`confidence`/`ease` 1–10) (admin-only) |
| PATCH / DELETE | `/api/product-ideas/[id]` | Update or delete a product idea (admin-only) |
| POST | `/api/product-ideas/[id]/promote` | Gate: create a prototype from the idea (carries name + concept), mark it `promoted`, link `promoted_prototype_id`; returns the new prototype id. Idempotent (admin-only) |
| POST | `/api/prototypes` | Create a prototype (admin-only; suppliers/companies 403). Accepts `supplierIds[]` — the candidate vendor set, attached via `prototype_supplier` |
| PATCH / DELETE | `/api/prototypes/[id]` | Update or delete a prototype. Setting `status:"approved"` requires a `final_sku` (in the payload or already on the row) — validated by `approvePrototype()`, stamps `approved_at`. Setting `supplier_id` (awarded) also ensures it's a candidate. Delete cascades rounds + attachments + candidate-vendor rows |
| POST / DELETE | `/api/prototypes/[id]/suppliers` | Add or remove a candidate vendor (`{ supplierId }`). Idempotent add; removing the awarded vendor clears `supplier_id` (admin-only) |
| PATCH | `/api/prototypes/[id]/suppliers/[supplierId]` | Record/update a vendor's quote (`unitCostCents`, `leadTimeDays`, `moq`, `setupCostCents`, `notes`) — stamps `quote_received_at`. Works whether or not the RFQ went through the system (admin-only) |
| POST | `/api/prototypes/[id]/suppliers/[supplierId]/rfq` | Email a candidate vendor a Request for Quote (`{ to, cc?, message? }`) — reuses the PO email path (Resend, auto-CC sender + vendor contacts, reply-to sender), includes the spec + CAD links, stamps `rfq_sent_at` (admin-only) |
| POST / DELETE | `/api/prototypes/[id]/suppliers/[supplierId]/quote-file` | Upload (multipart, max 10MB → Vercel Blob) or remove the vendor's quote document, stored on the `prototype_supplier` row (`quote_file_url`/`name`). Replacing drops the old blob (admin-only) |
| POST | `/api/prototypes/[id]/rounds` | Add a sample round (round number derived server-side) |
| PATCH / DELETE | `/api/prototypes/rounds/[roundId]` | Update or delete a sample round |
| POST | `/api/prototypes/[id]/attachments` | Upload a prototype-level file — spec sheets, photos, PDFs (Vercel Blob, 10MB) |
| POST | `/api/prototypes/rounds/[roundId]/attachments` | Upload a sample photo for a round (Vercel Blob, 10MB) |
| DELETE | `/api/prototypes/attachments/[id]` | Remove a prototype/round attachment (deletes blob + row) |
| POST | `/api/prototypes/[id]/references` | Attach an Autodesk Fusion CAD share link. Validates the host (`a360.co`/`*.autodesk360.com`), resolves redirects server-side to build the `?mode=embed` viewer URL for the inline 3D preview. Stores the raw link even if resolution fails |
| DELETE | `/api/prototypes/references/[id]` | Remove a CAD reference link |
| POST | `/api/cad-models` | Create a CAD library model (`{ name, fusionUrl? }`); admin-only |
| PATCH / DELETE | `/api/cad-models/[id]` | Update name/Fusion link, or delete (cleans up STL + GLB blobs) |
| POST | `/api/cad-models/[id]/stl` | Upload a source model (OBJ or STL) → convert to GLB server-side (Node) → store both in Blob → status `ready`. 422 on bad mesh. (Route path predates OBJ support.) |
| POST | `/api/cad-models/[id]/fusion-export` | **Generate from Fusion** — fire Autodesk's **OBJ** export to the admin's email (server-side GET; `toFormat=obj`), set status `awaiting_export`. The cron reads it back and converts. OBJ (not STL) so Fusion's per-face appearance names survive → satin/cast finishes |
| GET | `/api/cron/process-cad-exports` | Cron (every 10 min) + admin-nudged: find the Autodesk export email in the requester's Gmail, download the OBJ, convert. `verifyCronOrAdmin` |
| PUT | `/api/products/[sku]/cad-model` | Link (or unlink with null) a SKU to a saved CAD model |
| POST | `/api/products/[sku]/cad-model/shopify` | Push the SKU's model to its Shopify product as native 3D media (`stagedUploadsCreate` → upload → `productCreateMedia`, `write_products`). Writes to the live storefront |
| GET / POST | `/api/notifications` | Admin notification inbox — unread count (GET) + mark read (POST `{id}` or `{all}`); admin-only (suppliers/companies 403). Excludes supplier-bound rows |
| GET / POST | `/api/supplier/notifications` | Supplier notification inbox — unread count (GET) + mark read (POST `{id}`/`{all}`); scoped to the signed-in supplier |
| POST / DELETE | `/api/push/subscribe` | Register (POST, upsert on `endpoint`) or remove (DELETE `{endpoint}`) the current admin's Web Push subscription for one device. Body = browser `PushSubscription.toJSON()`. Admin-only (suppliers/companies 403). Backs Settings → Push notifications |
| POST | `/api/push/test` | Send a test push to every device the current admin has registered (the real-device "is push working" check). 503 if VAPID unset; 409 if no device received it (enable on this device / add to home screen first) |
| PUT | `/api/supplier/po/[id]/eta` | Update the PO's expected delivery date `{expectedDeliveryDate: "YYYY-MM-DD" \| null}`; allowed for the PO's primary supplier OR any supplier assigned to one of its stages (mirrors the page-level access check; 403 otherwise). Rejects masters with 409 — on a multi-supplier split each sub-PO carries its own date |
| PUT | `/api/production/po/[id]/stage-eta` | Upsert a target end date for one stage on this (sub-)PO: `{stage, targetEndDate: "YYYY-MM-DD" \| null}` (null clears). Admin-only; the production timeline's inline editor calls this. Overrides the cycle-time projection on the chart when set |
| PUT | `/api/supplier/po/[id]/stage-eta` | Supplier twin of the stage-eta route: same body, same writes via `setPoStageEta`. Allowed for the PO's primary supplier OR any supplier assigned to one of its stages (mirrors the eta-route access check) |
| POST | `/api/supplier/stage-checkin/[id]` | Answer a positive-control stage check-in `{status: "on_track" \| "at_risk", note?}`. Resolves every still-pending threshold row for that stage instance at once. Scoped to the signed-in supplier's own check-ins (404 otherwise). Surfaced on the supplier PO page via the `stage-checkin-prompts` card |
| PATCH | `/api/settings/production` | Update production settings — supplier ETA-reminder toggle/interval + stage-check-in toggle/thresholds (`production_settings`). Admin-only |
| PATCH | `/api/settings/dashboard` | Update dashboard settings — assumed per-return shipping-label cost used by the Avg Return Value tile (`dashboard_settings`). Admin-only |
| GET / POST | `/api/supplier-leads` | Supplier-lead pipeline (admin-only; suppliers/companies 403). GET lists with optional filters (status, supplierType, search; defaults `status='active'`, `capturedAt desc`). POST creates one — requires at least one of name/email/phone/company |
| GET / PATCH / DELETE | `/api/supplier-leads/[id]` | GET detail; PATCH partial update (any subset); DELETE soft-deletes (`status='dropped'`) |
| POST | `/api/supplier-leads/[id]/promote` | Promote a supplier lead → create a real `supplier` row from its fields, set the lead's `supplier_id` + `status='converted'`, return `{ supplierId }`. Already-linked leads return the existing supplier (no duplicate) |
| POST | `/api/supplier-leads/[id]/cards` | Attach a card image (already on Blob) to a supplier lead — JSON `{ blobUrl }`. Records it in `supplier_lead_card_image` and bumps `supplier_lead.card_image_url` |
| POST | `/api/supplier-leads/scan-card` | Supplier-card twin of `/api/leads/scan-card` (same multipart upload + Claude vision extraction); only the Blob path differs (`supplier-leads/cards/`). Does **not** persist a lead |
| GET | `/api/supplier-leads/types` | Options for the supplier-persona multi-select: built-in presets (`Rapid Prototyping`, `Full Production`) + every distinct persona ever saved on a lead (so "Other" entries persist for next time). Admin-only |

### Invoicing API (B2B; each handler checks `auth()`; admin-only — suppliers 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/invoices` | Create an invoice (company tier discount snapshotted; accepts optional `depositPercent` override) |
| PATCH | `/api/invoices/[id]` | Change status (draft → sent → paid / void) |
| PUT | `/api/invoices/[id]` | Full edit — header + line items (blocked once paid/void); accepts optional `depositPercent` override that beats the brand default at send |
| DELETE | `/api/invoices/[id]` | Hard-delete the invoice + line items + attachments via FK cascade; admin-only; confirmation required in UI. Any linked Shopify draft order (deposit or balance) is NOT auto-revoked |
| POST | `/api/invoices/[id]/send` | Email the invoice (Resend) + push a Shopify draft order with a payment link when the company is linked to a Shopify customer (`write_draft_orders`); marks "sent". **Blocks the send** if the payment link can't be created — 409 for missing scope, 502 for any other Shopify failure — so a linkless invoice never goes out to a Shopify-linked brand |
| POST | `/api/invoices/[id]/create-po` | Create a draft production PO from the invoice (pick supplier) |
| POST | `/api/invoices/[id]/fulfill` | Mark the invoice fulfilled; if a deposit was taken, also creates the second "balance" Shopify draft order for the remainder and stores `shopify_balance_draft_order_id` / `shopify_balance_invoice_url` |
| POST | `/api/invoices/[id]/deposit-paid` | Granular: stamp `deposit_paid_at` (separate from the overall status flip) |
| POST | `/api/invoices/[id]/balance-paid` | Granular: stamp `balance_paid_at` (separate from the overall status flip) |
| POST | `/api/invoices/[id]/attachments` | Upload a customer document to an invoice (e.g. their PDF PO) — Vercel Blob, multipart. Returns a graceful 503 when `BLOB_READ_WRITE_TOKEN` isn't set |
| DELETE | `/api/invoices/attachments/[id]` | Remove an invoice attachment (best-effort blob delete + always-on DB row delete) |
| PATCH | `/api/settings/billing` | Update remittance / bank-wire details shown on invoices |
| PATCH | `/api/settings/lead-followups` | Update the two follow-up rules — `initialDraftEnabled` (auto-draft on new-lead capture) + `enabled`/`nudgeAfterDays` (unanswered-email follow-up); persisted in `lead_followup_settings` |

### CRM API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List leads with optional filters (stage, sourceChannel, ownerUserId, status, search). Defaults to `status='active'`; search is case-insensitive across first/last name, email, and company name. Sorted by `capturedAt desc` |
| POST | `/api/leads` | Create a lead. Requires at least one of name/email/phone/company. **Duplicate guard**: if an active lead with the same email exists, returns 409 `{ error, existingLeadId }` unless `allowDuplicate:true` is sent. Stage defaults to `'prospect'`; owner defaults to the capturing user |
| GET | `/api/leads/[id]` | Lead detail |
| PATCH | `/api/leads/[id]` | Partial update (any subset of fields). "Convert to Company" is a PATCH that sets `companyId` and `status='converted'` |
| DELETE | `/api/leads/[id]` | Default: soft-delete (`status='dropped'`, row preserved). `?hard=1`: **permanent** delete — removes the lead and cascades its card images + outbound messages (used to clean up duplicates) |
| POST | `/api/leads/scan-card` | Upload a business-card image (multipart, 10 MB cap, JPEG/PNG/GIF/WebP); puts to Vercel Blob then calls Claude Sonnet 4.5 vision via a forced tool_use with a strict JSON schema. Returns extracted fields + confidence per field + raw read text + the Blob URL. Does **not** persist a lead — the client follows up with POST `/api/leads`. 503 if `BLOB_READ_WRITE_TOKEN` or `ANTHROPIC_API_KEY` is unset |
| POST | `/api/leads/[id]/cards` | Attach a business-card image (already uploaded to Blob) to an existing lead — JSON body `{ blobUrl }`. Records it in `lead_card_image` and bumps `lead.card_image_url`. Used by the capture dedup flow's "attach to existing lead" action |
| GET | `/api/leads/match?email=` | Given an email, returns `{ matchedCompany, matchedLead, matchedDomain }` — matches the email's (non-free) domain to a company and finds an active same-email lead. Drives the capture-confirm dedup banners |
| POST | `/api/leads/[id]/draft-followup` | Draft a follow-up email from the lead's notes/context via Claude Sonnet 4.5 and queue it in `outbound_message` (status `draft`). `?auto=1` (the fire-and-forget on-capture call) respects the `initial_draft_enabled` setting and no-ops when off; the manual "Draft follow-up" button omits it and always drafts. 503 if `ANTHROPIC_API_KEY` unset |
| POST | `/api/leads/[id]/sync-address` | Push the lead's business-card address to Shopify as an **additional** address on the customer matched by the lead's email (never overwrites, never default; de-duped in `client.createCustomerAddress`). 409 when the lead has no email / no matching Shopify customer; 400 with no card address; 502 if the `write_customers` scope isn't granted yet. Shopify stays source of truth — the address flows back on the next customer sync |
| GET / POST | `/api/leads/[id]/comments` | GET lists the lead's manual timeline comments (newest first, author resolved); POST adds one — JSON `{ body }` (1–5000 chars). Comments appear in the lead's History tab. Admin-only |
| GET | `/api/leads/[id]/replies` | The contact's message history across both channels. Email: searched live across **all Gmail-scoped team inboxes** (not just the owner's), each tagged with the inbox + `threadId`/`mailboxEmail` for a Gmail deep-link. WhatsApp: rows matched to the lead id (`channel:"whatsapp"`, no inbox/thread). `?direction=sent` returns what WE sent; otherwise inbound. Each row carries `channel` (`email`/`whatsapp`). Returns `{ replies, mailboxes }` (mailboxes = email inboxes searched) |
| GET | `/api/messages` | List queued outbound messages (joined with lead name). Defaults to `status='draft'`; `?status=sent\|dismissed` for the others |
| PATCH | `/api/messages/[id]` | Edit a queued message (subject/body/toEmail/`cc`/`bcc`) or change status. `cc`/`bcc` are comma-separated email lists (validated; `""` clears). `scheduled` + `scheduledAt` (ISO) queues an auto-send (records the actor as `created_by_user_id`); `sent` stamps `sent_at`; leaving `scheduled` clears `scheduled_at`; `dismissed` removes it from the queue |
| POST | `/api/messages/[id]/send` | Send the message through the signed-in admin's Gmail (From = their account) then mark it sent. Embeds an invisible open-tracking pixel (multipart text+HTML). Needs the `gmail.send` scope — 409 with a re-sign-in prompt if not yet authorized |
| POST | `/api/messages/[id]/rewrite` | AI-rewrite the on-screen draft — JSON `{ subject, body, instruction? }`. Returns `{ subject, body }` for the editor to apply (never persists; the editor saves via PATCH). 503 if `ANTHROPIC_API_KEY` is unset |
| POST | `/api/leads/[id]/replies/dismiss` | Hide one inbound reply from the lead's Replies tab — JSON `{ gmailMessageId }`, appended to `lead.dismissed_reply_ids` |
| GET | `/api/customer-messages/count` | `{ b2b, consumer, supplier, influencer, total }` of undismissed messages (nav dots) |
| GET | `/api/inbound?emails=a,b` | A contact's message history across both channels. Email: one or more addresses (comma-separated), searched across all connected team inboxes, merged + deduped by gmail id. **Only messages FROM the external contact** — internal senders filtered out (`lib/crm/internal-email.ts`). WhatsApp: pass `waType=customer\|supplier` + `waId` to merge phone-matched WhatsApp rows. `?direction=sent` returns what WE sent. Each row carries `channel`. Returns `{ replies, mailboxes }`. Powers the per-customer / per-supplier **Messages** view |
| POST | `/api/customer-messages/[id]/dismiss` | Mark a customer message dismissed (`dismissed_at = now`) |
| POST | `/api/compose/draft` | AI-draft a reply to an inbound email — JSON `{ contactName?, theirSubject?, theirMessage?, threadId?, relationship? }` → `{ subject, body }`. When `threadId` is given, the full prior Gmail thread (your token) is read and fed to the prompt so the draft is grounded in the real back-and-forth. 503 if `ANTHROPIC_API_KEY` unset |
| POST | `/api/compose/send` | Send a composed reply from the signed-in admin's Gmail — JSON `{ to, subject, body, cc?, bcc?, threadId?, inReplyTo? }` (`cc`/`bcc` comma-separated email lists, validated). Embeds an open-tracking pixel and logs the send as a `sent` outbound_message so opens are tracked. Same `gmail.send`/API-enabled 409s as the messages send route |
| GET | `/api/track/open/[token].gif` | **Public, no auth.** Open-tracking pixel — returns a 1×1 transparent GIF and records the open (`open_count`++, `first/last_opened_at`) on the matching `outbound_message`. `.gif` suffix is stripped. Best-effort: always returns the image; no-cache headers. Opens are approximate (proxy pre-load / image-blocking) |
| POST | `/api/creator-signup` | **Public, no auth.** Backs the `/creator-signup` self-registration form. Zod-validated `{ name, email?, phone?, notes?, profiles: [{platform, platformName?, platformDomain?, handle}], website (honeypot) }`; **requires an email OR a phone** (or both); `platform="other"` requires `platformName` (stored as the platform value) + `platformDomain` (→ `profileUrl` = `https://<domain>/<handle>`). Creates a `creator` (`source=self_registration`, `vettingStatus=unreviewed`, `status=prospect`, `phone`) + one `creator_platform` per profile (`dataSource=self_registration`, `onConflictDoNothing` on the unique platform+handle index so a known handle can't 500 the form or hijack a record) + optional `creator_email`, then fires `notifyNewCreatorSignup` (admin notification + Web Push + email to `ADMIN_EMAILS`, best-effort). Filled honeypot → silent 201, no write. Validation/normalization in `lib/creators/signup.ts` (db-free, unit-tested) |
| GET | `/api/creators/signup-count` | Admin-only. `{ count }` of unreviewed self-registered creators (`source=self_registration` AND `vetting_status=unreviewed`) — drives the blue dot on the **Creators** nav item; the matching **"Self-registered N"** filter pill on the page also shows a blue dot, so the queue is obvious on arrival. Polled by the sidebar every 60s; clears when the team approves/rejects each signup |

### Trade Shows API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trade-shows` | List shows (default `status='active'`, newest first) |
| GET | `/api/trade-shows/[id]` | The show + its filtered vendor list in one call. Query: `side` (supplier/customer — includes `both`), `visited`/`priority` (true/false), `followUpStatus`, `search`. Returns `{ show, vendors }` (priority booths first, then by booth) |
| GET / PATCH / DELETE | `/api/trade-shows/[id]/vendors/[vendorId]` | GET vendor detail (with show, voice notes, linked lead/supplier-lead); PATCH partial update (any subset — visited [stamps `visited_at`/`visited_by` on first visit], `sample_given` [stamps `sample_given_at` on first yes], `side`, follow-up (`follow_up_status`, `follow_up_temp` [hot/warm/cold, nullable], `lead_value` [int 1–5, nullable], `next_steps`), contact fields, card fields); DELETE hard-deletes the vendor (cascades voice notes; promoted lead/supplier-lead untouched) |
| GET / POST | `/api/trade-shows/[id]/vendors/[vendorId]/contacts` | People met at the booth (one company → many contacts). GET lists (primary first, then oldest). POST creates one — `{ firstName?, lastName?, title?, email?, phone?, notes?, isPrimary?, cardImageUrl?, cardRawText?, ocrConfidence? }`. First contact for a vendor defaults to primary; setting one primary demotes the others |
| PATCH / DELETE | `/api/trade-shows/[id]/vendors/[vendorId]/contacts/[contactId]` | PATCH partial update (incl. `isPrimary:true` to make primary). DELETE removes the contact; if it was primary, the oldest remaining contact is promoted |
| POST | `/api/trade-shows/[id]/vendors/[vendorId]/scan-card` | Vendor twin of `/api/leads/scan-card` — multipart image upload (10 MB cap) → Vercel Blob (`trade-show-vendors/[id]/cards/`) + Claude vision extraction. Returns fields + `cardImageUrl`; does **not** persist (the detail page creates a new **contact** from the result). 503 if `BLOB_READ_WRITE_TOKEN`/`ANTHROPIC_API_KEY` unset |
| GET / POST | `/api/trade-shows/[id]/vendors/[vendorId]/voice-notes` | GET lists notes (newest first). POST uploads a recorded memo — multipart `file` (audio/*, 25 MB cap) → Blob, plus optional `transcript` (on-device Web Speech dictation) + `durationSec`. Records a `trade_show_vendor_voice_note` row. 503 if Blob unset |
| GET / POST | `/api/trade-shows/[id]/vendors/[vendorId]/comments` | The vendor's **shared activity thread**. GET lists (newest-first, author resolved). POST adds a note — `{ body }` (1–5000 chars). A note here shows on every linked record (booth / customer lead / supplier lead) |
| GET | `/api/linked-activity?vendorId=\|leadId=\|supplierLeadId=` | **Cross-entity activity** for a booth-met entity, resolvable from any of its linked ids. Returns `{ links, notes, timeline }` — the linked-record summary + a merged newest-first timeline (shared notes, booth voice notes, the customer lead's comments, and events). 204 when the id isn't linked to a trade-show vendor (so detail pages cheaply skip the panel). Powers the `LinkedActivity` component shown on the booth, customer-lead, and supplier-lead detail pages; it merges live email/WhatsApp on top client-side from **both** sides — the customer lead (`/api/leads/[id]/replies`) and the supplier (`/api/inbound` by the supplier lead's email + promoted-supplier id), deduped by message id |
| POST | `/api/trade-shows/[id]/vendors/[vendorId]/promote` | Promote the vendor into a pipeline — JSON `{ target: 'supplier' \| 'customer' }`. Creates a `supplier_lead` or `lead` from the vendor (card data + booth context → notes; show's `source_channel` onto customer leads), links it back (`supplier_lead_id`/`lead_id`), returns `{ supplierLeadId }` or `{ leadId }`. Idempotent per side (already-linked returns the existing id) |

### Influencer API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/creators` | Manually add a creator (auto-approved vetting; 409 if handle already tracked, incl. rejected) |
| PATCH | `/api/admin/creators/[id]` | Update a creator (name/primaryPlatform/status/vettingStatus/scoreBoost/country/phone/notes; status→burned sets a 12-month `burned_until_date`) |
| GET | `/api/admin/creators/search?q=&exclude=` | Typeahead (name or handle) for the reassign-platform picker; returns id/name/platforms |
| POST | `/api/admin/creators/[id]/convert` | Reclassify a creator that's really a B2B prospect/customer. `{target: lead\|company\|customer}` → creates/links the record (`createLead` w/ source `b2b_creator_pipeline`; company insert; customer link via search or manual create), stamps `creator.leadId/companyId/customerId`, archives the creator + backlink note. Idempotent per target |
| POST | `/api/admin/creators/[id]/platforms` | Add a channel to a creator (409 if handle already tracked), then **auto-populate** it synchronously via `populatePlatform()` — pulls stats + recent posts + scores (YT via Data API, IG via Apify). Missing key / TikTok → row created, fills on the next cron |
| PATCH/DELETE | `/api/admin/creators/[id]/platforms/[platformId]` | Edit a platform (handle/platform/url/bio/verified — uniqueness-guarded, recomputes rollups on platform change) / delete it (cascades stats+posts, recomputes rollups) |
| POST | `/api/admin/creators/[id]/platforms/[platformId]/move` | Move a platform: omit `targetCreatorId` → **split** onto a new creator; provide one → **reassign**. Recomputes cross_platform_fit + primary on both sides |
| POST | `/api/admin/creators/[id]/emails` | Add an email (auto-classifies kind; 409 if already on the creator) |
| PATCH/DELETE | `/api/admin/creators/[id]/emails/[emailId]` | Edit (kind/portalAccess/email) / remove an email |
| POST | `/api/admin/creators/[id]/promote` | Ensure a linked `influencer` row exists (idempotent) so the gifting flow can serve this creator; prospect/contacted → committed |
| POST | `/api/admin/creators/[id]/discount-code` | Create a Shopify discount code (default 15%, once-per-customer) via `discountCodeBasicCreate` + register in `creator_discount_code`. Graceful 502 until `write_discounts` is granted |
| POST | `/api/admin/creators/[id]/posts` | Manually log a creator post (TikTok / missed by polling); auto mention-detection; 409 on duplicate URL |
| POST | `/api/admin/creators/[id]/outreach` | Start an outreach thread (channel + first-touch note); prospect → contacted |
| POST | `/api/admin/creators/outreach/[outreachId]` | Log an event (out/in/note, optional status transition — recomputes follow-up date; agreed promotes the creator) |
| PATCH | `/api/admin/creators/outreach/[outreachId]` | Edit thread status/terms/next-follow-up |
| POST/DELETE | `/api/admin/creators/[id]/assets` | Log / remove a deliverable (storage URL pointer, asset type, rights tier — expiry computed server-side) |
| POST | `/api/influencers` | Create an influencer |
| PATCH | `/api/influencers/[id]` | Update an influencer (incl. assigned collections) |
| GET | `/api/influencers/[id]/addresses` | The influencer's saved Shopify addresses (from their linked customer) for the gifting order form's ship-to / split picker; self-heals from Shopify. Mirrors the company addresses route |
| POST | `/api/influencers/[id]/contacts` | Add an influencer portal-login email (future portal allowlist) |
| DELETE | `/api/influencer-contacts/[id]` | Remove an influencer portal-login email |
| POST | `/api/influencer-orders` | Create a gifting order — push a Shopify draft order at 100% off (`write_draft_orders`) with split-fulfillment "Ship to" attributes, record content due date + affiliate link + order/per-line ship-to (address ids resolved to snapshots against the linked customer); still records as `draft` (with a warning) if the Shopify push fails |
| PATCH | `/api/influencer-orders/[id]` | Edit content deadline / published date / affiliate link / status / platform / **sample logistics (trackingNumber, trackingUrl, shippedAt, deliveredAt)** (tracking-table + Sample-logistics-card edits) AND, from the detail page, a full line-item replacement with split-fulfillment ship-to ids (resolved against the influencer's linked Shopify customer). Both parts optional |
| GET | `/api/influencer-orders/shopify-lookup?name=` | Admin-only. Preview an existing Shopify order by number (`findOrderByName`, status=any) → `{ shopifyOrderId, orderName, lineItems, trackingNumber, trackingUrl, shippedAt, deliveredAt, cancelled, alreadyImported }`. Read-only — no write. Powers the "Record existing Shopify order" preview |
| POST | `/api/influencer-orders/import-shopify` | Admin-only. `{ influencerId, orderName }` → re-fetch the Shopify order, map line items + fulfillment (tracking/shipped/delivered) via `mapShopifyOrderToGift`, and record it as a gifting order with `shopify_order_id` set + `status=sent` (no new draft). 409 if that order is already recorded; 404 if not found in Shopify |
| DELETE | `/api/influencer-orders/[id]` | Hard-delete a gifting order + line items via FK cascade; admin-only; per-row icon button on the tracking table. Shopify gifting draft order is NOT auto-revoked |
| POST | `/api/influencer-orders/[id]/send` | Push the Shopify gifting draft at 100% off (with split-fulfillment "Ship to" attributes) + email the creator the gift confirmation (Resend); marks "sent". **Blocks the send** if the draft can't be created — 409 missing scope, 502 other Shopify failure. No payment/deposit/wire (gifting is free) |
| POST | `/api/influencer-orders/[id]/attachments` | Upload a document (gifting agreement, content brief) to a gifting order — Vercel Blob, multipart. Graceful 503 when `BLOB_READ_WRITE_TOKEN` isn't set. Shares the attachments UI with invoices |
| DELETE | `/api/influencer-orders/attachments/[id]` | Remove a gifting-order document (best-effort blob delete + DB row) |

### Gmail API (admin-only)

Uses the signed-in admin's stored Google OAuth access token (DrizzleAdapter's `account` row, `provider='google'`). Auto-refreshes via `refresh_token` when expired and writes the new token back. Requires the `gmail.readonly` scope on the admin's account — granted by the Google provider config in `lib/auth.ts` (`access_type: offline`, `prompt: consent`). Existing admins must sign out + back in once after the scope was added to pick it up; the `signIn` callback then force-writes the fresh tokens (NextAuth's `DrizzleAdapter` won't refresh them on re-sign-in by default).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gmail/search?q=…` | Search the admin's mailbox for messages matching `q`, parse From/To/Cc headers, return distinct email addresses + names + most-recent-message snippet. Returns a friendly `error` string when the token's missing / scope isn't granted / Gmail API isn't enabled (caller renders inline, not as a 500) |

### Portal API (B2B; company-scoped via `role='company'`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/portal/checkout` | Instant self-checkout: create a Shopify draft order at the company's tier discount + record the order as an invoice; returns the Shopify pay link. Needs `write_draft_orders` |

### Cron Jobs (Vercel Cron, protected by `CRON_SECRET`)
| Method | Path | Schedule | Description |
|--------|------|----------|-------------|
| GET | `/api/cron/extract-shopify` | `15 */2 * * *` | Sync orders + customers from Shopify |
| GET | `/api/cron/extract-ga4` | `30 6 * * *` | Daily GA4 traffic data |
| GET | `/api/cron/extract-google-ads` | `45 6 * * *` | Daily Google Ads spend/conversions |
| GET | `/api/cron/extract-gsc` | `0 7 * * *` | Daily Search Console data |
| GET | `/api/cron/extract-posthog` | `0 */3 * * *` | PostHog event aggregation |
| GET | `/api/cron/production-deadline-alerts` | `0 13 * * *` | Email owner + suppliers about line items due soon / overdue, and complete POs ready to receive |
| GET | `/api/cron/sent-followups` | `0 14 * * *` | Scan connected Gmail Sent folders, match recipients to leads/customers/suppliers (`sent_email`), and for any sent ≥N days ago with no reply draft a **threaded** follow-up into Next Steps (replies in the original thread). N + on/off in Settings → Lead follow-ups. Replaced `lead-followups`. `?regenerate=1` skips scanning and re-drafts the follow-ups already queued in Next Steps with the current prompt (overwrites bodies in place) — used after a prompt change |
| GET | `/api/cron/send-scheduled` | `*/15 * * * *` | Send queued messages whose `scheduled_at` has passed, via the scheduler's Gmail (`outbound_message.created_by_user_id`), then mark them sent. Messages with no sender/recipient are skipped (stay scheduled) |
| GET | `/api/cron/lead-replies` | `*/5 * * * *` | Detect new lead replies (owner Gmail, bounded-concurrency) and raise an admin notification ("X replied"); de-duped via `lead.replies_notified_at` |
| GET | `/api/cron/customer-messages` | `*/15 * * * *` | Scan connected team inboxes for recent inbound mail from existing customers, suppliers, **or influencers** (matched by stored email), record new ones in `customer_message` (dedup on gmail id), and raise a `customer_message` notification per match |
| GET | `/api/cron/health` | `0 */4 * * *` | Infrastructure health check |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/shopify` | Shopify webhook receiver (orders/create, orders/updated, customers/update) |
| GET / POST | `/api/webhooks/whatsapp` | WhatsApp (Meta Cloud API). GET = verification handshake (`hub.challenge` when `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`). POST = inbound messages: verifies `X-Hub-Signature-256` HMAC (when `WHATSAPP_APP_SECRET` set), matches each sender's phone to a lead/customer, records a `whatsapp_message`, and raises a notification. Inert until the Meta app + number + webhook are configured |

## Open Questions

- [ ] Do we need `/api/admin/products` or is product data always derived from order line items?
- [ ] Webhook endpoint for additional Shopify topics (products/update, refunds/create)?
- [ ] Public API for partner integrations, or strictly internal?
