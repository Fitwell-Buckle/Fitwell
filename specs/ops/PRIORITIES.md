# Priorities

Last updated: 2026-05-25

## Active Workstreams

### 1. ✅ Project Scaffolding & Infrastructure Setup
**Completed**: 2026-05-11
**Source of truth**: `specs/work-plans/completed/infrastructure-setup.md`

NeonDB (with dev branching), Vercel (admin.fitwellbuckle.co), Google OAuth, ADMIN_EMAILS locked down. Sentry descoped.

---

### 2. 🔨 Shopify Integration (near complete)
**Last worked**: 2026-05-13
**Source of truth**: `specs/work-plans/todo/shopify-integration.md`
**Owner**: Greg

**Done**:
- [x] API client with client credentials auth (24h token exchange)
- [x] Rate limiting + Link header pagination + async generator
- [x] Webhook receiver with HMAC verification, wired to real upserts
- [x] Cron sync (25h overlap window)
- [x] Historical backfill script + Shopify CLI (8 commands) + /shopify skill
- [x] Admin dashboard wired to real data with shared UI components
- [x] source_name tracking (DTC vs wholesale/OEM)
- [x] UTM attribution parsing from landing_site
- [x] landing_site + referring_site stored on every order
- [x] All orders backfilled (1529). Customers partially backfilled (~8750/15845, resuming)

**Remaining**:
- [ ] Complete customer backfill (remaining ~7000)
- [ ] Register Shopify webhooks (orders/create, orders/updated, customers/update) for real-time sync
- [ ] Move work plan to completed/

---

### 3. ✅ Admin Dashboard
**Completed**: 2026-05-13
**Source of truth**: `specs/current/routes.md`

All pages functional with real data, shared UI components (PageHeader, Badge, DataTable, Mono, Muted), DM Sans/Mono typography, global date range picker (7d/30d/90d/YTD/All). Pages: dashboard, customers (list + detail + LTV), orders, attribution, campaigns & traffic (GA4), funnel (with bar visualization), products (SKU performance), settings.

---

### 4. 🔨 Analytics Extraction Pipeline (Google + Meta)
**Last worked**: 2026-05-13
**Source of truth**: `specs/work-plans/todo/google-integrations.md`
**Owner**: Greg

**GA4 — LIVE ✅**
- [x] Service account created + credentials in Vercel + .env.local
- [x] Service account added to GA4 via Analytics Admin API (OAuth Playground workaround for Google UI bug)
- [x] GA4 extraction verified working
- [x] 30-day backfill complete (752 rows)
- [x] Campaigns page shows real GA4 traffic data

**Google Search Console — code ready, needs access grant**
- [ ] Add service account to GSC via OAuth Playground (same workaround as GA4)
- [ ] Test extraction, backfill

**Google Ads — pending API approval**
- [x] Manager Account created (272-385-8162), linked to Fitwell Ads (293-513-7197)
- [x] Developer token obtained, set in Vercel + .env.local
- [x] Google Ads API enabled on GCP project
- [x] Basic access application submitted (2026-05-14) — expect ~3 business days
- Check approval status: Google Ads → switch to manager account 272-385-8162 → Tools (wrench) → Setup → API Center → "Access level" (Test → Basic → Standard). Google also emails the application contact on status change. Definitive test: a real extraction fails with DEVELOPER_TOKEN_NOT_APPROVED until Basic is granted.
- [ ] Once approved: test extraction, backfill 30 days

**Meta Ads — pending token approval**
- [x] Ad Account ID: 821060387465001
- [x] Meta App "Ad Manager" created, connected to Fitwell Buckles business
- [x] System user "Fitwell Analytics" created (Employee access — upgrade to Admin after 7 days for write access / inventory management)
- [x] Ad Manager app assigned with full control
- [ ] **Token generation pending team approval** — Oliver or Tom needs to approve in Meta Business Settings
- [ ] Once token is available: set META_ACCESS_TOKEN in Vercel + .env.local
- [ ] Add `meta_ads_daily` table migration
- [ ] Test extraction, backfill

**Future: upgrade Meta system user to Admin** for inventory-aware ad management (pause ads when products go out of stock). Requires 7 days from system user creation (~2026-05-21).

---

### 5. 📋 Landing Page Framework (deferred)
**Last worked**: —
**Source of truth**: `specs/current/routes.md` (marketing section)
**Owner**: Greg

Deferred — Shopify is the primary web property for now. Decision logged in `specs/ops/domains/product.md`. Revisit when SEO content strategy is ready.

---

### 6. 📋 PostHog Integration (deferred)
**Last worked**: —
**Source of truth**: `specs/work-plans/todo/posthog-integration.md`
**Owner**: Greg

Depends on landing pages. Not needed while Shopify is the only web property.

---

### 7. 📋 Resend Email Integration (deferred)
**Last worked**: —
**Source of truth**: `specs/work-plans/todo/resend-email-integration.md`
**Owner**: Greg

Low priority until analytics pipeline is feeding data for digest emails.

### 8. 🔨 Influencer Tracking (phase 1 — admin-managed)
**Last worked**: 2026-05-25
**Owner**: Oliver
**Branch**: `production-management` (PR)

Gift product to creators in exchange for content, tracked against a publish
deadline. Styled to mirror the B2B Orders/Brands system. Pricing = **gifting
(100% off) + an affiliate link per order**.

**Done (phase 1, admin-managed)**:
- [x] Schema: `influencer`, `influencer_contact`, `influencer_order` (+ line items), `influencer_order_number_seq` ("GIFT-00100"); migration `0011_sour_junta.sql` (influencer tables only — `user.influencer_id` deferred to the portal phase so the app never queries a missing column)
- [x] Pure `deadlineStatus()` helper (approaching/missed/hit/on_track/no_deadline) + 12 unit tests
- [x] Service + API: influencer CRUD, portal-login allowlist, gifting-order create (Shopify draft order at 100% off + affiliate link + content due date), order PATCH (deadline/published/link/status)
- [x] Pages under **Marketing**: `/influencers` (manager + assigned-collections picker), `/influencer-tracking` (deadline list, inline-edit deadline, mark published, affiliate link), `/influencer-tracking/new` (order form, picker restricted to assigned collections)
- [x] Nav + middleware + date-picker wiring; `npm run check` green (213 tests)

**Remaining / handoff**:
- [ ] **Migration-history reconciliation (carryover from the main-merge consolidation).** `drizzle-kit migrate` fails on this branch with `type "production_stage" already exists` — the DB physically has everything through `0010`, but drizzle's `__drizzle_migrations` table doesn't recognize the consolidated `0010` file, so it re-runs it. This blocks **any** `db:migrate` here and on production. Needs a deliberate reconciliation with Greg (consistent across all dev branches + prod).
- [ ] **NOTE for that reconciliation:** Oliver's dev branch (`ep-icy-lake-aqix27gq`) already has the influencer tables created **directly** (via `/tmp/apply-influencer-tables.mjs`, bypassing drizzle tracking) to unblock local work. So `0011_sour_junta` is applied in the DB but **not recorded** in `__drizzle_migrations` — the reconciliation must mark it applied (or it'll try to recreate and fail with "already exists").
- [ ] Grant Shopify `write_draft_orders` scope so gifting draft orders actually push (otherwise orders still save as `draft` with a warning)
- [ ] **Phase 2 (next chunk): self-serve influencer portal** — `role='influencer'`, magic-link login (`influencer_contact` allowlist), browse only assigned collections, enter publish date at checkout

---

## Completed Workstreams

- **Infrastructure Setup** — 2026-05-11 — NeonDB, Vercel, domain, OAuth, dev branching
- **Admin Dashboard MVP** — 2026-05-13 — All pages live with real data, shared components, date range picker
