# Architecture

Last updated: 2026-05-28

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15 (App Router) | React 19, Turbopack dev server |
| Language | TypeScript (strict) | `noEmit` checks via `tsc` |
| Database | NeonDB (PostgreSQL) | Serverless Postgres, per-dev branching |
| ORM | Drizzle ORM | Type-safe schema, migrations via `drizzle-kit` |
| Styling | Tailwind CSS 4 | PostCSS plugin, no config file |
| UI Primitives | Radix UI | Hand-rolled wrappers in `components/ui/` (button, card, tabs, modal, table, tooltip, badge, input, page-header, data-table, detail-tabs, delete-button) |
| Auth | NextAuth v5 (beta) | Google OAuth (admins; now also requests `gmail.readonly`) + custom email magic-link (suppliers, B2B brands) |
| Hosting | Vercel | Serverless functions, edge middleware, cron |
| File storage | Vercel Blob (`fitwell-attachments`) | Customer-supplied PO/invoice docs; public URLs with random suffix |
| Analytics | PostHog | Client + server SDKs, event tracking, feature flags |
| Web Analytics | GA4 | Measurement Protocol + Data API extraction |
| Search | Google Search Console | Daily keyword/page data via API |
| Ads | Google Ads API | Campaign spend and conversion data |
| Commerce | Shopify Admin API | REST + GraphQL, order/customer/address sync, draft orders for B2B/influencer payment + gifting |
| Shopify app config | `shopify.app.toml` + Shopify CLI | Scopes, embed, webhooks declared in repo; deploy/release runs from a maintainer's laptop |
| Email | Resend | Transactional email (magic links, PO/invoice notifications, deadline alerts) |
| Gmail (admin's mailbox) | Direct REST + admin's OAuth token | Read-only contact-search; only on explicit user query |
| Errors | Sentry | Error reporting and performance monitoring |
| Charts | Recharts | React charting library for dashboard |

## Application Structure

```
src/
  app/
    (marketing)/     # Public-facing pages (no auth required)
    (admin)/         # Protected dashboard (admin auth required)
    auth/            # Login page
    api/             # API routes (auth, admin, cron, webhooks)
  components/        # Shared React components
  lib/               # Utilities, schema, DB client, auth config
```

## Route Groups

### (marketing) — Public Pages
No authentication. Server-rendered where possible. PostHog tracking on all pages. UTM capture on landing pages.

### (admin) — Protected Dashboard
Requires authenticated admin session via NextAuth. Middleware redirects unauthenticated requests to `/auth/login`.

## Middleware

Single `middleware.ts` at project root handles:
1. **Auth gating** — checks session for `/dashboard`, `/customers`, `/orders`, etc.
2. **PostHog identification** — passes distinct_id cookie to server
3. **Security headers** — CSP, HSTS, X-Frame-Options (also in `next.config.ts`)

## Infrastructure

- **Dev server**: `next dev --turbopack --port 30100`
- **Testing**: Vitest (unit), Playwright (e2e)
- **Database migrations**: `drizzle-kit generate` + `drizzle-kit migrate`
- **Cron jobs**: Vercel Cron (configured in `vercel.json`)
- **CI**: GitHub Actions (typecheck + test on PR)

## Open Questions

- [ ] Do we need edge runtime for any routes, or Node runtime everywhere?
- [ ] Redis/KV for rate limiting on webhook endpoint?
- [ ] Image optimization strategy for product photos on landing pages?
