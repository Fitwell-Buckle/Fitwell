# Routes

Last updated: 2026-05-23

## (marketing) — Public Pages

| Path | Description | Auth |
|------|-------------|------|
| `/` | Homepage — hero, value props, social proof | None |
| `/micro-adjust` | Product education — how micro-adjust works | None |
| `/compare/[slug]` | Comparison pages (e.g. `/compare/deployant-vs-micro-adjust`) | None |
| `/for-brands` | B2B landing page for watch brand partnerships | None |
| `/privacy` | Privacy policy | None |
| `/terms` | Terms of service | None |

All marketing pages include PostHog tracking and UTM parameter capture.

## auth

| Path | Description | Auth |
|------|-------------|------|
| `/auth/login` | Admin login page (Google OAuth) | None |
| `/supplier/login` | Supplier login (email magic link) | None |
| `/portal/login` | Company B2B portal login (email magic link) | None |

## (admin) — Protected Dashboard

All routes require authenticated admin session. Middleware redirects to `/auth/login` if unauthenticated.

| Path | Description |
|------|-------------|
| `/dashboard` | Overview — revenue, orders, traffic KPIs |
| `/customers` | Customer list with search, filter, sort |
| `/customers/[id]` | Individual customer detail — orders, LTV, attribution |
| `/customers/companies` | B2B companies + price tiers (CRUD) |
| `/invoices` | B2B invoice list |
| `/invoices/new` | Create an invoice (company + line items at retail − tier) |
| `/invoices/[id]` | Invoice detail — status, send, create-PO actions |
| `/invoices/[id]/edit` | Edit a draft/sent invoice (company is fixed) |
| `/invoices/[id]/print` | Printable invoice document (pay link + bank-wire remittance) |
| `/orders` | Order list with filters |
| `/campaigns` | Campaign list — performance overview |
| `/campaigns/[id]` | Campaign detail — spend, conversions, ROAS |
| `/attribution` | UTM attribution analysis |
| `/funnel` | Funnel visualization (sessions → users → orders, operational end-state view) |
| `/funnel/strategy` | Strategic / diagnostic funnel — 6-stage acquisition, 5-stage retention loop, channel breakdown. Aligned with `specs/strategy/funnel.md`, `retention-loop.md`, `personas.md`. |
| `/influencers` | Influencer list (CRUD) — handle/platform, assigned collections, portal-login allowlist |
| `/influencer-tracking` | Gifting orders + content-deadline tracking (approaching / missed / hit); inline-edit deadline, mark published, affiliate link |
| `/influencer-tracking/new` | Create a gifting order (100% off draft order; product picker limited to the influencer's assigned collections; content due date + affiliate link) |
| `/products` | Product performance breakdown (+ incoming production qty per SKU) |
| `/inventory` | Incoming inventory — per-SKU units in production, stage breakdown, projected ETA |
| `/modules` | Modules hub (Production; Marketing coming soon) |
| `/modules/production` | "Purchase Orders" — PO list only (date range + instant filters: supplier, status, stage, size, colour; defaults to Open, last 30 days by issued date) |
| `/modules/production/summary` | "Production Summary" — the kanban board + production timeline (Gantt), with the same instant filters as Purchase Orders (supplier, status, stage, size, colour) applied to both |
| `/modules/production/po/new` | Create a PO with line items (inline "Add new" for supplier + B2B customer; the customer contact email searches synced Shopify customers and links the matched customer) |
| `/modules/production/po/[id]` | PO detail — stage advance, status, stage timeline, and a unified notes & documents timeline (notes + uploads in one feed; posting notifies the supplier by email + supplier-portal notification) |
| `/modules/production/po/[id]/edit` | Edit PO header + line items (add/update/remove) |
| `/modules/production/po/[id]/send` | Printable PO preview; email it (HTML) to the customer |
| `/modules/production/kanban` | Kanban board — drag line items across stage columns |
| `/modules/production/suppliers` | Supplier CRUD |
| `/settings` | Admin settings, sync status, API health |

## supplier — Supplier Portal

Magic-link auth; middleware requires an authenticated session with `role='supplier'` (else → `/supplier/login`). Signed-in admins are redirected to `/dashboard`; suppliers who hit admin routes are sent here. Every page is scoped to the signed-in supplier's `supplier_id` and shows production fields only (no company / customer / price-tier).

| Path | Description |
|------|-------------|
| `/supplier` | The supplier's own POs (list) |
| `/supplier/po/[id]` | PO detail — advance stages + a unified notes & documents timeline (post notes, upload documents; no edit/delete of stages); 404 if not their PO. Posting a note/doc emails Fitwell + adds an admin notification |
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

### Admin API (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/customers` | List customers (paginated, filterable) |
| GET | `/api/admin/customers/[id]` | Customer detail |
| GET | `/api/admin/orders` | List orders (paginated, filterable) |
| GET | `/api/admin/funnel` | Funnel data (date range) |
| GET | `/api/admin/cohort` | Cohort analysis data |
| GET | `/api/admin/attribution` | Attribution breakdown |
| GET | `/api/admin/campaigns` | Campaign performance list |
| GET | `/api/admin/campaigns/[id]` | Campaign detail with daily metrics |

### Production API (each handler checks `auth()`)

Supplier scoping: when the session `role='supplier'`, write endpoints are restricted to the supplier's own POs — `advance`, `comments`, `attachments` (upload), and `line-items/[id]/stage` are owner-checked (403 otherwise); PO edit (`PATCH`/`PUT po/[id]`), receive, stage-event date edits, attachment delete, and supplier-contact management are admin-only (403 for suppliers). Admins are unaffected.
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/production/shopify-refs` | Warehouses (Shopify locations) for the PO picker; needs `read_locations` |
| GET | `/api/production/customer-search` | Typeahead over synced customers (name/email) for linking a company |
| POST | `/api/production/companies` | Create a company |
| PATCH | `/api/production/companies/[id]` | Update a company |
| POST | `/api/production/companies/[id]/contacts` | Add a B2B portal login email to a company (Phase 7 allowlist); admin-only |
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
| POST | `/api/production/po/[id]/attachments` | Upload a document to a PO (Vercel Blob; multipart). Notifies the other party (same routing as notes) |
| DELETE | `/api/production/attachments/[id]` | Delete an attachment (blob + row) |
| POST | `/api/production/line-items/[id]/stage` | Set a line item's stage (kanban drag); locked POs move together |
| GET | `/api/production/stages` | List the active production stages (key + label + position) for the editor |
| PUT | `/api/production/stages` | Replace the pipeline — rename/add/delete/reorder stages. Deleting a stage with items in it requires a `{moves:{key:"forward"\|"back"}}` direction; it soft-deletes (history kept) and moves stranded line items. Admin-only. Drives the Production Summary "Setup" modal |
| PATCH | `/api/production/stage-events/[id]` | Edit a stage transition date (entered_at, day-granularity); syncs the previous stage's exited_at; chronological bounds; admin-only |
| POST | `/api/production/suppliers` | Create a supplier |
| PATCH | `/api/production/suppliers/[id]` | Update a supplier |
| POST | `/api/production/suppliers/[id]/contacts` | Add an authorized login email to a supplier |
| DELETE | `/api/production/supplier-contacts/[id]` | Remove a supplier login email |
| GET / POST | `/api/notifications` | Admin notification inbox — unread count (GET) + mark read (POST `{id}` or `{all}`); admin-only (suppliers/companies 403). Excludes supplier-bound rows |
| GET / POST | `/api/supplier/notifications` | Supplier notification inbox — unread count (GET) + mark read (POST `{id}`/`{all}`); scoped to the signed-in supplier |

### Invoicing API (B2B; each handler checks `auth()`; admin-only — suppliers 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/invoices` | Create an invoice (company tier discount snapshotted) |
| PATCH | `/api/invoices/[id]` | Change status (draft → sent → paid / void) |
| PUT | `/api/invoices/[id]` | Full edit — header + line items (blocked once paid/void) |
| POST | `/api/invoices/[id]/send` | Email the invoice (Resend) + push a Shopify draft order with a payment link when the company is linked to a Shopify customer (`write_draft_orders`); marks "sent" |
| POST | `/api/invoices/[id]/create-po` | Create a draft production PO from the invoice (pick supplier) |
| PATCH | `/api/settings/billing` | Update remittance / bank-wire details shown on invoices |

### Influencer API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/influencers` | Create an influencer |
| PATCH | `/api/influencers/[id]` | Update an influencer (incl. assigned collections) |
| POST | `/api/influencers/[id]/contacts` | Add an influencer portal-login email (future portal allowlist) |
| DELETE | `/api/influencer-contacts/[id]` | Remove an influencer portal-login email |
| POST | `/api/influencer-orders` | Create a gifting order — push a Shopify draft order at 100% off (`write_draft_orders`), record content due date + affiliate link; still records as `draft` (with a warning) if the Shopify push fails |
| PATCH | `/api/influencer-orders/[id]` | Edit content deadline / published date / affiliate link / status |

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
| GET | `/api/cron/health` | `0 */4 * * *` | Infrastructure health check |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/shopify` | Shopify webhook receiver (orders/create, orders/updated, customers/update) |

## Open Questions

- [ ] Do we need `/api/admin/products` or is product data always derived from order line items?
- [ ] Webhook endpoint for additional Shopify topics (products/update, refunds/create)?
- [ ] Public API for partner integrations, or strictly internal?
