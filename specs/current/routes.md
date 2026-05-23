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

## (admin) — Protected Dashboard

All routes require authenticated admin session. Middleware redirects to `/auth/login` if unauthenticated.

| Path | Description |
|------|-------------|
| `/dashboard` | Overview — revenue, orders, traffic KPIs |
| `/customers` | Customer list with search, filter, sort |
| `/customers/[id]` | Individual customer detail — orders, LTV, attribution |
| `/customers/companies` | B2B companies + price tiers (CRUD) |
| `/orders` | Order list with filters |
| `/campaigns` | Campaign list — performance overview |
| `/campaigns/[id]` | Campaign detail — spend, conversions, ROAS |
| `/attribution` | UTM attribution analysis |
| `/funnel` | Funnel visualization (landing → Shopify → purchase) |
| `/products` | Product performance breakdown |
| `/modules` | Modules hub (Production; Marketing coming soon) |
| `/modules/production` | Production PO list with supplier/status/stage filters |
| `/modules/production/po/new` | Create a PO with line items |
| `/modules/production/po/[id]` | PO detail — stage advance, status, timeline, comments |
| `/modules/production/po/[id]/edit` | Edit PO header + line items (add/update/remove) |
| `/modules/production/kanban` | Kanban board — drag line items across stage columns |
| `/modules/production/suppliers` | Supplier CRUD |
| `/settings` | Admin settings, sync status, API health |

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
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/production/shopify-refs` | Warehouses (Shopify locations) for the PO picker; needs `read_locations` |
| POST | `/api/production/companies` | Create a company |
| PATCH | `/api/production/companies/[id]` | Update a company |
| POST | `/api/production/price-tiers` | Create a price tier (% off retail) |
| PATCH | `/api/production/price-tiers/[id]` | Update a price tier |
| GET | `/api/production/collections` | Shopify catalog grouped by collection (+ Uncategorized) for the cascading PO picker |
| GET | `/api/production/products` | Flattened active Shopify catalog (variants) — fallback picker source |
| POST | `/api/production/po` | Create a PO + line items |
| PATCH | `/api/production/po/[id]` | Update PO fields (status, lock, dates, notes) |
| PUT | `/api/production/po/[id]` | Full edit — header + reconcile line items (add/update/remove) |
| POST | `/api/production/po/[id]/advance` | Advance stage — whole PO (locked) or one line item |
| POST | `/api/production/po/[id]/comments` | Add a comment to a PO |
| POST | `/api/production/line-items/[id]/stage` | Set a line item's stage (kanban drag); locked POs move together |
| POST | `/api/production/suppliers` | Create a supplier |
| PATCH | `/api/production/suppliers/[id]` | Update a supplier |

### Cron Jobs (Vercel Cron, protected by `CRON_SECRET`)
| Method | Path | Schedule | Description |
|--------|------|----------|-------------|
| GET | `/api/cron/extract-shopify` | `15 */2 * * *` | Sync orders + customers from Shopify |
| GET | `/api/cron/extract-ga4` | `30 6 * * *` | Daily GA4 traffic data |
| GET | `/api/cron/extract-google-ads` | `45 6 * * *` | Daily Google Ads spend/conversions |
| GET | `/api/cron/extract-gsc` | `0 7 * * *` | Daily Search Console data |
| GET | `/api/cron/extract-posthog` | `0 */3 * * *` | PostHog event aggregation |
| GET | `/api/cron/health` | `0 */4 * * *` | Infrastructure health check |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/shopify` | Shopify webhook receiver (orders/create, orders/updated, customers/update) |

## Open Questions

- [ ] Do we need `/api/admin/products` or is product data always derived from order line items?
- [ ] Webhook endpoint for additional Shopify topics (products/update, refunds/create)?
- [ ] Public API for partner integrations, or strictly internal?
