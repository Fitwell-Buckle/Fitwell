# Priorities

Last updated: 2026-06-03

## ⚠️ Action needed — Greg (Shopify scope deploy)

`shopify.app.toml` now requests **`write_customers`** (needed by the new
"Add to Shopify addresses" button on leads — pushes a lead's business-card
address as an *additional* address, never overwriting). It won't work until the
scope is released + the store re-authorizes:

1. `shopify app deploy --message "add write_customers scope"`
2. `shopify app release --version <name> --allow-updates`
3. Re-authorize the app in Shopify Admin (scope changes force a re-grant — UI only).

Until then the button returns a graceful 502. See `specs/current/shopify-app-config.md`.

## Current Strategic Focus (2026-05-25)

**The thesis:** Instrument the existing Shopify funnel end-to-end before scaling ad spend. Current state is ~300–400 daily visitors producing ~7 daily sales (~1.5% conversion). Doubling conversion has more leverage than doubling traffic — pouring more spend into a leaky funnel wastes money. See where people actually bail before deciding what to fix.

**The strategic question:** top-of-funnel-first across all channels, isolate-and-perfect one channel, or instrument-first? We're choosing **instrument-first**. Working strategy until evidence suggests otherwise.

**Sequence:**
1. PostHog instrumentation across the existing storefront funnel (in flight — see workstream 6 below)
2. Establish baseline conversion at each funnel stage
3. Identify the largest leak point
4. Test fixes against the leak (landing variants, content, copy, checkout friction)
5. Once the funnel converts at target, scale top-of-funnel spend

### Current Numbers (Baseline as of 2026-05-25)

- **Daily visitors:** ~300–400
- **Daily sales:** 6–9 (median ~7). Never zero post-Black-Friday — the floor looks algorithmic, mechanism unknown
- **Conversion rate:** ~1.5%
- **Ad spend mix:** heavily Meta; only Google paid spend is a branded keyword ad on "fitwell" / "fitwell buckles"
- **Channel attribution:** most sales come from Google, but the mechanism (paid branded search vs. organic vs. post-creator branded search vs. post-Meta-ad branded search) is unknown

### What "Rightness" Looks Like (Initial Targets — Refine with Data)

Measured as an **event-based** funnel (HogQL `windowFunnel`, route-agnostic), not a strict URL flow. Visitors can enter on any page (`/`, `/pages/m1-micro-adjust-buckle`, `/collections/*`, `/products/*`) and traverse via any route — the stages are progression *events*, not page visits.

| Stage (event) | Current | Target | Notes |
|---|---|---|---|
| `$pageview` → `product_viewed` | ? | 60%+ | `product_viewed` includes Shopify's standard event on `/products/*` AND the storefront snippet's custom emission on declared landing PDPs (currently `/pages/m1-micro-adjust-buckle`). |
| `product_viewed` → `product_added_to_cart` | ? | 8–12% | Industry baseline for considered purchase. |
| `product_added_to_cart` → `checkout_started` | ? | 50%+ | |
| `checkout_started` → `purchase_completed` | ? | 70%+ | Friction here is highest-leverage to fix. |
| **`$pageview` → `purchase_completed` (overall)** | **~1.5%** | **3%+** | Doubling is the near-term target. |

Each `?` gets a real number once `posthog_daily` accumulates and the `/funnel` page's event-funnel card has data. Targets are placeholders based on industry norms — replace with our own once we have baseline. The `/funnel` page's "Entry Pages" card complements this view by showing which doors visitors actually come in through.

### Catalog of Unknowns

Captured for systematic attack rather than ambient anxiety. Living index in `specs/strategy/hypotheses.md` (Open Questions section). Highlights:

- **Ad fatigue:** how many people are sick of seeing our ads? What's the optimal frequency cap?
- **Content type effect:** which formats (installation videos, comparisons, lifestyle) move buyers from `solution_aware` to `considering`?
- **Creator attribution:** what's the correlation between creator post metrics (engagement, follower count, niche fit) and resulting sales lift?
- **Creator × ad overlap:** what % of creator-driven sales were already ad-exposed beforehand? Is the creator a closer or an introducer?
- **Google mechanism:** how is Google traffic actually finding us — branded search post-ad, organic, referral, post-creator?
- **Funnel bail point:** where exactly does the 1.5% break — top, middle, checkout?
- **The 6–9 floor:** why is daily sales so tightly bounded? What's the algorithmic mechanism producing this?

Every unknown above is an opportunity. The goal of instrumentation is to convert as many as possible into hypotheses we can test, then into validated answers.

---

## Blockers

_None active. See "Recently resolved" below._

### Recently resolved

- **Shopify `write_draft_orders` granted (2026-05-28)** — Oliver ran `shopify app deploy` + `shopify app release` (version `fitwell-admin-7`), then re-authorized the install from Shopify Admin. Token-exchange now returns all 11 declared scopes. Prod was redeployed to flush the cached 24h Shopify token so warm Vercel instances pick up the new scope immediately. Unblocked: B2B invoice payment links, deposit/balance flow, influencer gifting draft orders.

---

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

### 6. 🔨 Conversion Funnel Observability (PostHog)
**Last worked**: 2026-06-03 (Phases 0–6 code-complete; awaiting Shopify theme redeploy + data accumulation)
**Source of truth**: `specs/work-plans/todo/posthog-integration.md`, `specs/strategy/event-taxonomy.md`, `specs/strategy/funnel.md`
**Owner**: Greg

**Goal:** end-to-end visibility into the existing Shopify storefront funnel so we know where visitors actually bail. Drives the bottom-up strategy in "Current Strategic Focus" above — we cannot make data-driven calls about ad spend or landing pages until we can see the funnel.

**Done (2026-06-03):**
- [x] **Phase 0 spike:** vanilla install confirmed default stitching works (no `fw_distinct_id` bridge needed). Same-origin Custom Pixel iframe shares the `.fitwellbuckle.co` cookie. Findings: `specs/research/posthog-shopify-stitching.md`.
- [x] **Phase 1:** vanilla theme snippet + Custom Pixel live on production.
- [x] **Phase 2:** UTM capture + first-touch write-through to `utm_attribution` via `/api/tracking/utm` (CORS, idempotent on session_id). `fw_attribution` cookie marks first-touch.
- [x] **Phase 3:** `_fw_distinct_id` cart attribute backstop → orders/create webhook reads it, stamps `link_method = 'pixel'`, marks `utm_attribution.converted`, server-side enriches the PostHog Person with order + first-touch UTM.
- [x] **Phase 4:** server-side posthog-node client.
- [x] **Phase 5:** extraction cron (every 3h) populating `posthog_daily`.
- [x] **Phase 6:** pixel subscribes to `checkout_started`, `checkout_completed`, `product_viewed`, `product_added_to_cart`.
- [x] **Phase 7 (partial):** `/funnel` page now has a PostHog 5-stage funnel card; `/attribution` already shows orders+revenue by first-touch channel with link-confidence split.

**Greg's deploy steps:**
1. Re-paste `shopify/theme-posthog-snippet.html` into `theme.liquid` (replaces the Phase 0 minimal snippet — now includes UTM capture, cart-attribute backstop, person properties)
2. Re-paste `shopify/custom-pixel.js` into the existing `posthog` Custom Pixel (Settings → Customer events → edit code — now includes `product_viewed` and `product_added_to_cart`)

**Then:**
- [ ] Wait 24–72h for `posthog_daily` to accumulate baseline data (cron runs every 3h; needs a few cycles plus traffic).
- [ ] Compare PostHog funnel card on `/funnel` against the "Rightness" targets above — identify the biggest leak.
- [ ] Future: identify admin staff in the admin posthog-provider (so staff Persons aren't created backwards via test purchases — Greg's admin events were back-stitched onto his email Person during the Phase 0 test).
- [ ] Future: backfill pre-pixel orders via email-match for historical attribution. Not load-bearing — defer until the live funnel is settled.

**Why this matters now:** every dollar of additional ad spend without instrumentation is a dollar we can't learn from. Until the funnel is observable, scaling top-of-funnel is throwing darts.

---

### 7. 🔨 Resend Email Integration (transactional live; digests deferred)
**Last worked**: 2026-05-27
**Source of truth**: `specs/work-plans/completed/resend-email-integration.md`
**Owner**: Greg

Transactional email is **live in production** as of 2026-05-27 — `RESEND_API_KEY` + `EMAIL_FROM` (`Fitwell Buckle Co. <info@portal.fitwellbuckle.co>`, on the verified `portal.fitwellbuckle.co` domain) set in Vercel and deployed. Powers supplier magic-link sign-in, PO handoff/activity notifications, invoice sends, and the deadline-alert cron. Invoice *payment links* started working 2026-05-28 once `write_draft_orders` was granted (see Blockers → Recently resolved). Digest/analytics emails remain low priority until the analytics pipeline is feeding data.

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
- [x] Grant Shopify `write_draft_orders` scope so gifting draft orders actually push — granted 2026-05-28 (see Blockers → Recently resolved)
- [ ] **Phase 2 (next chunk): self-serve influencer portal** — `role='influencer'`, magic-link login (`influencer_contact` allowlist), browse only assigned collections, enter publish date at checkout

---

### 9. 🔨 Strategic Funnel — Next Iteration (in flight)
**Last worked**: 2026-06-03 (Phase 4 shipped)
**Source of truth**: `specs/work-plans/todo/funnel-strategy-next-iteration.md`
**Owner**: Tom (planning), Greg (engineering)

V1 of `/funnel/strategy` shipped 2026-05-26 (commits `81e4079`, `fd5f5bd`). Iteration plan progress:
- [x] **Phase 1: Tier 1 quick wins** — D2C wholesale filter + Meta cold/retargeting split shipped 2026-05-27 (`067d6be`). GSC auth unblock deferred.
- [x] **Phase 2: Channel × persona cross-cut** — segment pills + per-channel segment mix bars (data layer `c9e92ec`, UI `c209fdc`).
- [x] **Phase 3: Klaviyo API integration** — Phase 0 read-side shipped in `c209fdc`. Per-order grain attribution deferred to Phase 0.5.
- [x] **Phase 4: Order position split (acquisition vs retention)** — shipped 2026-06-03. Runtime-computed via `ROW_NUMBER` window function instead of stored column (preserved zero-drift guarantee that two existing denormalized customer fields have already broken).
- [x] **Phase 5: Judge.me API integration** — shipped 2026-06-03. New `review` table, paginated client + idempotent extract cron at 07:45 UTC, advocate stage in retention loop is now live-computed (outfitter customers whose email matches a reviewer's). Confidence falls back to `weak` with a how-to-fix note when the table is empty (Judge.me API key + outage clearance still pending).

**Iteration plan complete.** Pending follow-ups: vocabulary-map drift script (deferred, cheap), per-order Klaviyo flow attribution grain (Phase 0.5 of `klaviyo-integration.md`), upper-funnel persona × stage cross-cut (needs PostHog client-side).

PostHog client-side instrumentation (workstream 6) is the largest unblock for upper-funnel measurement but is independent of this plan.

## Completed Workstreams

- **Infrastructure Setup** — 2026-05-11 — NeonDB, Vercel, domain, OAuth, dev branching
- **Admin Dashboard MVP** — 2026-05-13 — All pages live with real data, shared components, date range picker
