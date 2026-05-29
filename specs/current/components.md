# Components

Last updated: 2026-05-28

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
| `admin-sidebar` | Dashboard sidebar navigation (Marketing group includes Influencer List + Influencer Orders) |

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
