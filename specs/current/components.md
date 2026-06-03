# Components

Last updated: 2026-06-01

## UI Primitives (`components/ui/`)

Radix UI + Tailwind CSS. Styled with `class-variance-authority` (`button`) or hand-rolled Tailwind. Only the components actually in the repo are listed.

| Component | Backed by | Notes |
|---|---|---|
| `button` | Radix Slot (for `asChild`) | Variants: default, destructive, outline, secondary, ghost. Sizes: default, sm, lg, icon |
| `card` | — | Simple `<Card>` wrapper with rounded border + bg + padding |
| `badge` | — | Status / pill labels |
| `input` | — | Standard form input |
| `table` | — | `<Table>` / `<TableHeader>` / `<TableBody>` / `<TableRow>` / `<TableHead>` / `<TableCell>` |
| `data-table` | — | `<DataTable>` chrome (filter chips, summary) + `<Mono>` helper, wraps `<Table>` |
| `page-header` | — | Page title strip |
| `tabs` | `@radix-ui/react-tabs` | Underline-on-active tab strip — `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>`. **New 2026-05-28** |
| `detail-tabs` | composes `tabs` | `<DetailTabs tabs={[{ value, label, content }, …]} />` — generic wrapper used by the PO and invoice detail pages for their reference / history sections. **New 2026-05-28** |
| `modal` | `@radix-ui/react-dialog` | Controlled dialog with title/description/X-close. Used by `delete-button` for the confirm step |
| `delete-button` | composes `button` + `modal` | `<DeleteButton entityKind entityLabel deleteUrl redirectTo? iconOnly? />` — confirmation modal calls out that linked Shopify draft orders are NOT auto-revoked. Used on PO/invoice detail headers and the influencer tracking-table per row. **New 2026-05-28** |
| `tooltip` | `@radix-ui/react-tooltip` | Hover help text |

## Layout (`components/layout/`)

| Component | Usage |
|-----------|-------|
| `header` | Marketing site header — logo, nav, CTA |
| `footer` | Marketing site footer — links, legal |
| `admin-sidebar` | Dashboard sidebar navigation. **Customers** group: B2B Leads, Customer List, Orders. **Products** group: Purchase Orders, Supplier List, Production Summary, Product List. Marketing group: Influencer List + Orders. Settings (bottom) hosts the consolidated config |
| `production/notification-list` | Shared notification inbox (admin `/notifications` + supplier portal). **New / Dismissed** tabs, per-item + "Dismiss all" (the underlying model is still `read_at`). Email-derived notifications (customer messages, lead replies) carry a `mailbox` + `mailbox_email`, so the list color-codes each row by inbox (shared `lib/crm/mailbox-color.ts`), shows **per-inbox filter chips** (your own first, via `currentUserEmail`), and an "In X's inbox" tag — matching the messaging views. Date sits top-right; body shows a 3-line preview. On any dismiss it broadcasts `admin-notifications-changed` so the sidebar badge re-reads immediately |
| `ui/section-tabs` | Client tab bar that presents paired sibling routes as tabs (active by pathname). Used to group Consumer/B2B Customers, Consumer/B2B Orders, and B2B Leads/Messages to Send under one heading without merging the pages. Tab sets live in `lib/nav-tabs.ts` |

## CRM / Leads (`app/(admin)/leads/`)

Server-page-fetches / client-component-mutates-then-`router.refresh()` shape
shared with Production and Influencers. Pure helpers (display labels, badge
classes, QR payload parsing) live in `lib/crm/` and are unit-tested.

| Component | Usage |
|-----------|-------|
| `leads/lead-form` | Client — shared editable form used by `/leads/new` and the capture confirm step. **Field order: Persona → Quick note → identity (name/email/phone/title/company) → Address → stage/source/date.** Address is six free-text fields (street, line 2, city, region, postal, country) so foreign addresses fit. Accepts `initial`, `confidence` (per-field 0–1 from OCR), `submitLabel`, `onSuccess`, `rapid`. In `rapid` (booth) mode the Address and stage/source/date blocks collapse under `<details>`. Renders a colored confidence dot beside each input when `confidence` is supplied (green ≥0.8 / amber 0.4–0.8 / red <0.4). POSTs to `/api/leads` |
| `leads/leads-filters` | Client — query-string-backed filter strip (stage / source / status / search) on the list page |
| `leads/new/new-lead-form` | Thin wrapper around `lead-form` for the manual-entry route |
| `leads/[id]/lead-detail` | Client editor — stage/status/persona badges, "Convert to Company" picker + button (PATCH sets `companyId` + `status='converted'`; the picker's "+ Add a new company…" option creates the company inline via POST `/api/production/companies` — prefilled name from the lead's free-text company, contact from the lead — then converts into it), Drop button (DELETE → soft-delete), DetailTabs (Overview / Messages to Send / Replies / History); **Overview** is read-only until Edit, shows a formatted mailing **Address** block (via `lib/crm/address.ts` `formatAddress`) editable as six fields, includes an **Owner** field (defaults to the lead's creator; reassignable to any internal user via `listAssignableOwners()`), and now holds the **Notes** section (textarea + Save + "Draft follow-up email" + raw OCR card text) directly below the lead fields (no separate Notes tab); the **History** tab has an "Add comment" composer (POST `/api/leads/[id]/comments`) and a unified timeline of comments + drafted/sent emails (merged via `lib/crm/timeline.ts` `buildLeadTimeline`); shows the business-card photo via `next/image` |
| `leads/[id]/replies-tab` | Client — the contact's inbound emails, fetched on mount from `GET /api/leads/[id]/replies` which searches **all connected team inboxes** (cross-mailbox, Gmail-scoped admins only); each row is a link that **opens the thread in Gmail** (deep-link by `threadId` + `authuser` of the inbox owner), color-coded per inbox with a quick filter, plus per-reply **Compose Message** (AI reply) and **Dismiss** (persisted). A footer lists which inboxes were searched. Marks replies seen on open (clears the "new" dot) |
| `crm/compose-message` | Client — `<ComposeMessageButton target={{to, contactName?, theirSubject?, theirMessage?, relationship?}} />`. Opens a modal that AI-drafts a reply on open (`POST /api/compose/draft`), editable, with "Re-draft with AI" and **Send via Gmail** (`POST /api/compose/send`, From = signed-in admin). Shared by customer messages + lead replies |
| `crm/message-list` | **The single source of truth for the messaging interface.** `<MessageList items relationship onDismiss? footer? emptyText? />` — renders a list of normalized message rows: per-inbox color stripe, filter chips (your own inbox first), Gmail deep-link + AI **Compose** *only* when the row is in your own inbox (a teammate's is read-only), optional **Dismiss** (optimistic). Each item carries an optional `company` shown in the preview (with a building icon, when it differs from the contact name). Multi-message threads collapse into a group card whose header has a **Dismiss all** button (dismisses every message in the thread at once) when `onDismiss` is set. Used by the lead Replies tab, the `inbound-messages` view, and the `customer-messages-panel` — change it once, every surface updates |
| `crm/inbound-messages` | Client — `<InboundMessages emails={[…]} relationship />`. Full inbound history for a customer/company/**supplier** across all connected team inboxes (`GET /api/inbound?emails=…`); fetch + loading/footer wrapper around `<MessageList>`. Rendered on the consumer customer detail (`/customers/[id]`), B2B company detail (`/customers/brands/[id]`), and **supplier detail** (`/modules/production/suppliers/[id]`) pages |
| `crm/customer-messages-panel` | Client — "new messages" panel at the top of the Customers B2B/Consumer tabs, the Suppliers list, **and the Influencer List** (`audience` = `b2b`/`consumer`/`supplier`/`influencer`). Maps undismissed `customer_message` rows into `<MessageList>` (Dismiss → `POST /api/customer-messages/[id]/dismiss`). Server pages fetch via `listCustomerMessages(audience)`, which now resolves each sender's `company` (direct B2B match, or the matched customer's linked company) for the preview |
| `crm/company-history` | Server — `<CompanyHistory orders pos />` on the B2B company detail. **Order history** = Shopify orders from every customer linked to the company (its primary linked customer + attached People customers). **PO history** = `production_po` rows routed to the company (`company_id`), each linking to `/modules/production/po/[id]` — only shown when there are linked POs. B2B company detail (`/customers/brands/[id]`) order: customer details card → People → order/PO history → inbound messages |
| `customers/brands/[id]/customer-detail-view` | Client — the company "details" card. A **tabbed** card (`ui/tabs`) with **Details** (read-only field grid + Create B2B Order / Edit / **Delete** — DELETE `/api/production/companies/[id]`, confirm + toast, redirects to the list; blocked when invoices/POs exist), **Addresses (n)** (Shopify-synced addresses for the linked customer), and **Portal logins (n)** (`<CompanyLogins embedded>`) — consolidated to conserve space. "Edit customer" swaps the whole card for `<CompanyForm>`. `<CompanyLogins embedded>` renders bare (no Card/heading); its default form (with Card) is still used by the brands manager |
| `crm/company-picker` | Client — searchable company combobox on the lead form/detail. "+ Add new company" creates it inline (`POST /api/production/companies`), now passing the lead's `contact` (name + email) so the server auto-attaches that person as the new company's primary contact |
| `leads/capture/capture-client` | Client — mobile-first capture state machine. **Opens straight into the camera** (Cancel → 3-mode picker: Scan card / Scan QR / Type it in). After save it loops back to the camera ("Save & capture another") for rapid booth capture. Feeds the shared `lead-form` (in `rapid` mode) |
| `ui/use-dictation` | Client hook wrapping the Web Speech API (`webkitSpeechRecognition`) for push-to-dictate. Used by `lead-form`'s Notes field (mic button); hidden when the browser doesn't support it |
| `leads/capture/card-camera` | Client — live rear-camera viewfinder (`getUserMedia`, `facingMode: environment`) with a shutter that grabs a frame to canvas → JPEG `File`. Auto-falls-back to an `<input capture="environment">` (OS camera hand-off) when a live camera isn't available — e.g. a phone hitting the dev server over plain-HTTP LAN, where `getUserMedia` is blocked as an insecure context |
| `leads/capture/qr-scanner-view` | Client — wraps `qr-scanner` (dynamic-imported so the library never lands in a server bundle); calls back with the first successful decode |
| `messages/messages-list` | Client — "Messages to Send" queue. Each draft card: editable subject/body, Copy, Mark as sent, Dismiss (all PATCH `/api/messages/[id]`). Server page at `app/(admin)/messages` lists `status='draft'` joined with the lead name |

## Influencer List + Orders (`app/(admin)/influencers/`, `app/(admin)/influencer-tracking/`)

Same server-page-fetches / client-component-mutates-then-`router.refresh()` shape
as the Production module. Deadline logic is pure + unit-tested in
`lib/influencer/influencer.ts`; DB writes go through `lib/influencer/service.ts`.

| Component | Usage |
|-----------|-------|
| `influencers/influencers-manager` | Client — influencer CRUD, assigned-collections picker, customer-search contact autocomplete, portal-login allowlist |
| `influencer-tracking/tracking-table` | Client — gifting-order list with urgency chips; inline-edit content deadline, mark published, add/edit affiliate link |
| `influencer-tracking/new/order-form` | Client — create a gifting order (100% off); product picker restricted to the influencer's assigned collections; content due date + affiliate link |

## Tracking (`components/tracking/`)

| Component | Usage |
|-----------|-------|
| `utm-capture` | Client component — reads UTM params from URL, stores in cookie/PostHog |
| `conversion-tracker` | Fires conversion events on specified user actions |

## Charts (`components/charts/`)

Built with Recharts. Used in admin dashboard.

| Component | Usage |
|-----------|-------|
| `metric-card` | Single KPI with value, trend arrow, comparison period |
| `line-chart` | Time series (revenue, traffic, etc.) |
| `bar-chart` | Category comparison (channels, products) |
| `funnel-chart` | Conversion funnel visualization |

## Production Module (`app/(admin)/modules/production/`)

Client components colocated with their routes. Server pages fetch with Drizzle
and pass plain props; client components mutate via the Production API then call
`router.refresh()`. Stage rules live in `lib/production/stages.ts` (pure,
unit-tested); display helpers in `lib/production/display.ts`.

| Component | Usage |
|-----------|-------|
| `po/new/po-form` | Create-PO form with dynamic line-item rows |
| `po/[id]/po-controls` | Line-item table, stage advance, status + lock toggles |
| `po/[id]/po-stage-timeline` | Per-line-item stage-event timeline (used in the Progress tab) |
| `po/[id]/sub-po-covers` | Sub-PO covers cell — `r.covers` is `{ sku, title }[]` so raw-blank suppliers see the finished SKUs *and* their product titles (not just bare codes) |
| `suppliers/supplier-manager` | Supplier list with inline create/edit forms |
| `components/production/supplier-form` | Shared create/edit supplier form; includes `<GmailContactSearch>` above the contact email field — pick fills email and, if blank, contact name |
| `components/production/supplier-logins` | Authorized-logins (magic-link allowlist) card on the supplier detail page; uses the same `<GmailContactSearch>` |
| `components/production/po-timeline` | Unified notes + documents feed (admin + supplier sides) |
| `components/production/gmail-contact-search` | Reusable Gmail-search affordance — `<GmailContactSearch onPick={…} />`. Hits `GET /api/gmail/search?q=…`. Renders an input + button + results list (email, parsed name, snippet). Self-clears after a pick. Surfaces friendly errors inline. **New 2026-05-28** |

## Invoicing Module (`app/(admin)/invoices/`, `components/invoicing/`)

Invoice detail page composes inline cards (header, metadata, line items) with a
`<DetailTabs>` (Attachments / Linked POs / History) for reference content;
`<InvoiceActions>` stays inline above the tabs as the payment-collection
surface.

| Component | Usage |
|-----------|-------|
| `invoices/invoice-form` | Create/edit invoice form. Includes a "Deposit % (optional override)" field — leave blank to inherit the brand's default at send time, set 0 to waive, set a number to override on this invoice only. **2026-05-28** |
| `invoices/[id]/invoice-actions` | The "Collect Payment" card. For drafts, renders a separate "Payment preview" block showing the projected deposit/balance breakdown (using `invoice.deposit_percent ?? company.deposit_percent`) — no buttons. For sent/partial: deposit row + balance row with mark-paid buttons. **2026-05-28** |
| `invoices/[id]/invoice-document` | The shared printable document (used by `/print` and `/send`). Includes a deposit terms paragraph in the Payment block when an effective deposit applies (so the customer reads it on the document, not just on the screen). **2026-05-28** |
| `invoices/[id]/invoice-status-select` | Status dropdown on the detail page header |
| `components/invoicing/invoice-attachments` | Customer-document upload UI (Vercel Blob). Self-wraps in a `<Card>` so it composes uniformly inside `<DetailTabs>` |

## SEO (`components/seo/`)

JSON-LD structured data for marketing pages.

| Component | Usage |
|-----------|-------|
| `product-schema` | Product structured data for buckle pages |
| `faq-schema` | FAQ structured data for comparison/education pages |

## Providers (`components/providers/`)

| Component | Usage |
|-----------|-------|
| `posthog-provider` | Wraps app with PostHog client initialization |

## Open Questions

- [ ] Toast/notification component — Sonner is installed, need wrapper?
- [ ] Data table component with sorting/filtering for admin lists?
- [ ] Shared loading skeleton components?
