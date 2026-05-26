# Components

Last updated: 2026-05-23

## UI Primitives (`components/ui/`)

Radix UI + Tailwind CSS. Styled with `class-variance-authority` for variants.

| Component | Radix Primitive | Variants |
|-----------|----------------|----------|
| `button` | Slot | default, destructive, outline, secondary, ghost, link + sizes |
| `card` | — | card, card-header, card-title, card-description, card-content, card-footer |
| `dialog` | Dialog | — |
| `dropdown-menu` | DropdownMenu | — |
| `input` | — | default |
| `label` | Label | — |
| `select` | Select | — |
| `separator` | Separator | — |
| `tabs` | Tabs | — |
| `tooltip` | Tooltip | — |
| `table` | — | table, table-header, table-body, table-row, table-head, table-cell |

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
| `suppliers/supplier-manager` | Supplier list with inline create/edit forms |

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
