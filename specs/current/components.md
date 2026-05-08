# Components

Last updated: 2026-05-07

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
| `admin-sidebar` | Dashboard sidebar navigation |

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
