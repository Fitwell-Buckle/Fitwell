# Priorities

Last updated: 2026-05-11

## Active Workstreams

### 1. ✅ Project Scaffolding & Infrastructure Setup
**Completed**: 2026-05-11
**Source of truth**: `specs/work-plans/completed/infrastructure-setup.md`

NeonDB (with dev branching), Vercel (admin.fitwellbuckle.co), Google OAuth, ADMIN_EMAILS locked down. Sentry descoped.

---

### 2. 🔨 Shopify Integration
**Last worked**: 2026-05-11
**Source of truth**: `specs/work-plans/todo/shopify-integration.md`
**Owner**: Greg

**Done**:
- [x] API client with client credentials auth (24h token exchange)
- [x] Rate limiting + Link header pagination + async generator
- [x] Webhook receiver with HMAC verification, wired to real upserts
- [x] Cron sync (25h overlap window)
- [x] Historical backfill script
- [x] Shopify CLI (8 commands) + /shopify skill
- [x] Admin dashboard wired to real data
- [x] source_name tracking (DTC vs wholesale/OEM)
- [x] UTM attribution parsing from landing_site
- [x] 30-day backfill complete (476 orders, 425 customers)

**Next**:
- [ ] Full historical backfill (1529 orders total)
- [ ] Register Shopify webhooks (orders/create, orders/updated, customers/update)
- [ ] Move work plan to completed/

---

### 3. ✅ Admin Dashboard MVP
**Completed**: 2026-05-11
**Source of truth**: `specs/current/routes.md`

Dashboard, customers (list + detail + LTV), orders, products (top SKUs), settings, attribution — all wired to real Shopify data.

---

### 4. 🔨 Analytics Extraction Pipeline (Google + Meta)
**Last worked**: 2026-05-11
**Source of truth**: `specs/work-plans/todo/google-integrations.md`
**Owner**: Greg

**Done**:
- [x] Shared Google service account JWT auth module
- [x] GA4 Data API extraction (daily, source/medium breakdown)
- [x] Google Search Console extraction (query/page, pagination)
- [x] Google Ads GAQL extraction (campaign-level, micros→cents)
- [x] Meta Ads Marketing API extraction (logs only, needs table)
- [x] All cron routes wired up
- [x] GA4 Property ID set: 516065986
- [x] Google Ads Customer ID set: 293-513-7197

**Blocked**:
- [x] Service account key created (`fitwell-analytics@fitwell-496020.iam.gserviceaccount.com`), credentials set in Vercel + .env.local
- [ ] **GA4 rejects service account** — "doesn't match a Google Account" error in both property and account access management UI. Tried at account level too. The existing `fitwell-ops-bot` service account (from unknown `fitwell-ops` project) works, but we can't access that project. Need to investigate: may need to add the service account via the Analytics Admin API with proper OAuth scopes, or find who controls the `fitwell-ops` project.
- [ ] Google Ads developer token (apply in Ads → Tools → API Center)
- [ ] Google Search Console — add service account (same issue as GA4 likely)
- [ ] Meta Ads: need META_AD_ACCOUNT_ID + META_ACCESS_TOKEN + meta_ads_daily table migration

---

### 5. 📋 Landing Page Framework
**Last worked**: —
**Source of truth**: `specs/current/routes.md` (marketing section)
**Owner**: Greg

**Next**:
- [ ] Marketing layout finalized
- [ ] Product education pages
- [ ] Comparison page template
- [ ] UTM capture component (client-side, coordinates with PostHog)

---

### 6. 📋 PostHog Integration
**Last worked**: —
**Source of truth**: `specs/work-plans/todo/posthog-integration.md`
**Owner**: Greg

Depends on: Landing pages (need pages to track), Shopify integration (need purchase data to close attribution loop)

---

### 7. 📋 Resend Email Integration
**Last worked**: —
**Source of truth**: `specs/work-plans/todo/resend-email-integration.md`
**Owner**: Greg

Low priority until analytics pipeline is feeding data for digest emails.

## Completed Workstreams

- **Infrastructure Setup** — 2026-05-11 — NeonDB, Vercel, domain, OAuth, dev branching
