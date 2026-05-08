# Priorities

Last updated: 2026-05-07

## Active Workstreams

### 1. 🔨 Project Scaffolding & Infrastructure Setup
**Last worked**: 2026-05-07
**Source of truth**: `specs/current/architecture.md`
**Owner**: Greg

Set up the foundational codebase — Next.js project, database schema, auth, deployment pipeline.

**Done**:
- [x] Initialize Next.js 15 project with TypeScript strict
- [x] Configure Drizzle ORM + NeonDB connection
- [x] Set up NextAuth with Google OAuth
- [x] Define database schema (all tables)
- [x] Configure Vercel deployment + cron jobs
- [x] Set up Sentry error reporting
- [x] Create specs operating system

**Next**:
- [ ] Run initial database migration
- [ ] Verify Vercel deployment works
- [ ] Set up PostHog provider and test event tracking
- [ ] Configure CI (GitHub Actions for typecheck + test)

---

### 2. 📋 Shopify Integration (Order/Customer Sync)
**Last worked**: —
**Source of truth**: `specs/current/integrations.md` (Shopify section)
**Owner**: Greg

Build the core data pipeline that syncs orders and customers from Shopify.

**Next**:
- [ ] Implement Shopify API client (`src/lib/shopify.ts`)
- [ ] Build cron handler for order sync
- [ ] Build cron handler for customer sync
- [ ] Implement webhook receiver with HMAC verification
- [ ] Test with real Shopify data
- [ ] Backfill historical orders

---

### 3. 📋 Admin Dashboard MVP
**Last worked**: —
**Source of truth**: `specs/current/routes.md` (admin section)
**Owner**: Greg

Build the minimum viable admin dashboard — overview KPIs, customer list, order list.

**Next**:
- [ ] Admin layout with sidebar navigation
- [ ] Dashboard overview page (revenue, orders, traffic cards)
- [ ] Customer list page with search and pagination
- [ ] Customer detail page
- [ ] Order list page

---

### 4. 📋 Analytics Extraction Pipeline
**Last worked**: —
**Source of truth**: `specs/current/scheduled-jobs.md`
**Owner**: Greg

Build cron jobs to extract data from GA4, Google Ads, GSC, and PostHog.

**Next**:
- [ ] GA4 Data API client and daily extraction
- [ ] Google Ads API client and daily extraction
- [ ] GSC API client and daily extraction
- [ ] PostHog extraction and aggregation
- [ ] Campaign dashboard page

---

### 5. 📋 Landing Page Framework
**Last worked**: —
**Source of truth**: `specs/current/routes.md` (marketing section)
**Owner**: Greg

Build SEO-optimized marketing pages for product education and comparison content.

**Next**:
- [ ] Marketing layout (header, footer)
- [ ] Homepage with hero and value propositions
- [ ] `/micro-adjust` product education page
- [ ] Comparison page template (`/compare/[slug]`)
- [ ] UTM capture component
- [ ] JSON-LD structured data components
- [ ] `/for-brands` B2B landing page
