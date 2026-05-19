# PostHog Integration

## Context
- PostHog is our product analytics platform for visitor behavior, attribution, and (separately) admin-dashboard usage.
- **Architecture reality (confirmed 2026-05-18):** every visitor-facing page — campaign landing pages, storefront, cart, and checkout — is served by **Shopify under `www.fitwellbuckle.co`**. There is no Next.js client surface in the buyer funnel. The only Next.js-hosted surface is the admin dashboard at `admin.fitwellbuckle.co`.
- **Consequence:** visitor tracking is **not** a Next.js `PosthogProvider`. Following PostHog's official Shopify guide (https://posthog.com/docs/libraries/shopify), it is **two surfaces**: (a) the full `posthog-js` snippet injected in the theme's `theme.liquid` `</head>` for landing + storefront pages (normal theme pages, not sandboxed), and (b) a **Shopify Custom Web Pixel** (Settings → Customer events) for the checkout page only, because the checkout page rejects the snippet. The Next.js PostHog client is scoped to admin-usage tracking only.
- **What the official guide already does:** its checkout pixel calls `posthog.identify(customer.email)` before capturing the order, so **purchases are always tied to an email-identified person — never anonymous.** The open question is *identity stitching*, not anonymity: does the pre-purchase anonymous browsing (pageviews, UTM, funnel) merge into that email-identified buyer? That hinges on whether the sandboxed checkout pixel's `posthog-js` can read the same `.fitwellbuckle.co` cookie the storefront snippet set — behaviour PostHog's doc does not specify. Most likely it stitches (common case, why the default is fine for many stores); the failure mode is "buyer is identified by email but disconnected from their earlier anonymous funnel," i.e. lost first-touch linkage — **not** anonymous purchases.
- **Where this plan extends the official guide:** it adds (i) an explicit `fw_distinct_id` identity bridge to *de-risk* the stitching question above, and (ii) UTM/attribution write-through, which the official doc does not cover at all. Whether the bridge is load-bearing or merely belt-and-suspenders is decided empirically by Phase 0 — do not assume the default is broken.
- Because the entire funnel is one registrable domain (`fitwellbuckle.co`), a first-party cookie scoped to `Domain=.fitwellbuckle.co` *can* span landing → storefront → checkout. If Phase 0 confirms the pixel can read it, the same `fw_distinct_id` is present on the first landing pageview and on `checkout_completed`, making the purchase → person link deterministic (email match then retained only as backfill for pre-pixel orders). If Phase 0 shows default stitching already works without the bridge, the bridge becomes a redundancy safeguard, not the mechanism.
- Reference: specs/current/integrations.md, specs/current/data-flows.md, specs/invariants/attribution.md
- Depends on Shopify integration being complete (order/customer data flowing).

## Dependencies
- Shopify integration completed (orders and customers syncing to DB). ✅
- **Shopify store access** to add a Custom Pixel (Settings → Customer events → Add custom pixel). Requires staff permission for customer events.
- PostHog project (confirmed values, US Cloud):
  - Project token (public, write-only — safe in client/pixel): `phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq`
  - Project ID (for the PostHog query/export API): `430335`
  - API host: `https://us.i.posthog.com`
  - `person_profiles` default is `identified_only` — acceptable; anonymous visitors still get events, profiles created on identify.
- Env vars:
  - `NEXT_PUBLIC_POSTHOG_KEY` = the project token above (used by admin Next client + as the pixel's posted token)
  - `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
  - `POSTHOG_PROJECT_ID` = `430335`
  - `POSTHOG_PERSONAL_API_KEY` = personal API key (server-side, **secret**, Vercel-only — for the extraction cron / query API; never in the pixel)

## Scope
Included:
- Shopify Custom Pixel: pageview + event capture across landing/storefront/checkout, posting directly to PostHog's capture endpoint.
- First-party `fw_distinct_id` + `fw_attribution` cookies scoped to `.fitwellbuckle.co`, set/read via the pixel sandbox `browser.cookie` API.
- First-touch UTM capture ($set_once) + write-through to `utm_attribution` table.
- Deterministic purchase → person link via the pixel `checkout_completed` event carrying `fw_distinct_id`.
- Server-side `orders/create` webhook enrichment (revenue/products onto the person) + email-match backfill for orders that predate the pixel.
- Server-side PostHog client (`posthog-node`) for admin events and webhook-side capture.
- PostHog → NeonDB extraction cron (event rollups into `posthog_daily`).
- Admin dashboard attribution + funnel views combining PostHog events with Shopify order data.

Excluded:
- Session replay (separate plan).
- Heatmaps.
- PostHog surveys.
- Client-side feature flags / landing-page A/B testing — **deferred**: not feasible from a sandboxed Shopify Custom Pixel without theme/app-embed work. Tracked as a follow-up, out of scope here.

## Implementation Phases

### Phase 0: Spike — does default Shopify-pixel stitching already work? (de-risk, ~half day)
**Goal:** empirically settle whether the official vanilla install already stitches anonymous browsing → identified buyer, *before* committing to build the `fw_distinct_id` bridge. Outcome decides whether Phase 1's bridge is the mechanism or a safeguard.

- [ ] Stand up the **official guide install only** — `posthog-js` snippet in `theme.liquid` + a minimal Custom Pixel that does `posthog.identify(email)` + `posthog.capture('purchase_completed')`. No `fw_distinct_id` bridge yet.
- [ ] Use a Shopify dev/preview theme or test storefront; place a real test order end-to-end (landing with `?utm_source=spiketest` → product → checkout).
- [ ] In PostHog, inspect the resulting person: does the `purchase_completed` event share a person with the pre-purchase `$pageview`/UTM events (single timeline), or are they two separate persons?
- [ ] Record the anonymous `distinct_id` from the storefront cookie and the `distinct_id` the pixel used — same or different? (Answers the sandbox-cookie-sharing question directly.)
- [ ] Test on at least: desktop Chrome, mobile Safari (ITP), and with the pixel sandbox in Shopify's stricter mode if configurable.
- [ ] Write findings to `specs/research/posthog-shopify-stitching.md`: which case (stitches / doesn't), under what conditions, and the decision: bridge required vs. safeguard vs. unnecessary.

#### Exit criteria / branch
- **Stitches reliably** → demote the `fw_distinct_id` bridge in Phase 1 to optional hardening; proceed mostly on the official path.
- **Does not stitch (or flaky by browser)** → bridge is load-bearing; Phase 1 proceeds as written.
- Either way, the overstated "default silently breaks attribution" framing is replaced by the measured result.

### Phase 1: PostHog on Shopify — theme snippet + checkout pixel + identity bridge
- [ ] **Theme snippet (landing + storefront):** add the official `posthog-js` snippet to `theme.liquid` before `</head>`, init `phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq`, `api_host: https://us.i.posthog.com`. Autocapture + `$pageview` come for free here.
- [ ] **Identity bridge:** immediately after `posthog.init`, write `posthog.get_distinct_id()` into a first-party cookie `fw_distinct_id` (`Domain=.fitwellbuckle.co`, 400-day, `SameSite=Lax`). This is the seam the official guide leaves unaddressed.
- [ ] **Checkout pixel:** create the Custom Pixel (Settings → Customer events → Add custom pixel, name `posthog`). Load `posthog-js` in the pixel per the official guide, **but bootstrap its distinct_id from the `fw_distinct_id` cookie** read via the sandbox `browser.cookie` API (do not let the pixel mint a fresh anonymous id) — `posthog.init(token, { bootstrap: { distinctID: fwId } })`.
- [ ] Subscribe to Shopify standard events: `checkout_started`, `checkout_completed` (purchase handled in Phase 3). Theme snippet already covers `$pageview`/`product_viewed`.
- [ ] Guard all `browser`/`init`/`analytics` sandbox accessors (can be undefined on some surfaces); pixel must fail safe.
- [ ] CORS note (per official guide): use the pixel for *conversion* events only; rely on the theme snippet for general events to avoid cross-origin warnings.

#### Tests
- Unit: identity-bridge cookie write/read (present / absent / malformed).
- Unit: pixel bootstrap-id selection (cookie id used, not a new uuid).
- Manual: load landing → storefront → checkout, confirm one stable `distinct_id` across all three in PostHog Activity.

### Phase 2: UTM capture & first-touch attribution (theme snippet — not the pixel)
- [ ] In a small `theme.liquid` script (runs after posthog-js init, has real `window`/`document`), parse UTM params (`source`, `medium`, `campaign`, `term`, `content`) + `gclid` from the URL. (Official guide does not cover this — our addition.)
- [ ] First-touch only: if `fw_attribution` cookie absent, write it (`Domain=.fitwellbuckle.co`, 30-day, `SameSite=Lax`) with session_id, utm_*, referrer, landing_page, timestamp. Do not overwrite on later pageviews (per specs/invariants/attribution.md §2/§3).
- [ ] Send PostHog person properties via `posthog.setPersonProperties`: UTM + referrer + landing_page as **`$set_once`** (first-touch, immutable); `last_*` as `$set`.
- [ ] Write-through to `utm_attribution`: POST to a new public route `POST /api/tracking/utm` (Next.js app) with `fw_distinct_id`, utm_*, landing_page, referrer, captured_at. Zod-validated, idempotent upsert per session_id.
- [ ] Add CORS for `https://www.fitwellbuckle.co` on `/api/tracking/utm`.

#### Tests
- Unit: UTM parse across URL shapes (missing params, encoded, gclid-only).
- Unit: first-touch guard (cookie present ⇒ no new record).
- Integration: `/api/tracking/utm` round-trip → `utm_attribution` row, idempotent on replay.

### Phase 3: Deterministic purchase → PostHog link
- [ ] On the pixel `checkout_completed` event (posthog-js bootstrapped from `fw_distinct_id` per Phase 1): `posthog.identify(email)` then `posthog.capture('purchase_completed', { order_id, order_value, currency, line_items, utm_* })` — the official guide's pattern, but anchored to the bridged distinct_id so it merges with the pre-purchase anonymous person instead of a fresh id.
- [ ] Pixel also sends `$set` person props: `last_order_at`, `total_orders`+, and `$set_once` `first_order_at` — the person profile now carries first-touch UTM **and** revenue, keyed to the original anonymous visitor.
- [ ] Backstop (server, deterministic): in the pixel `checkout_started`/`checkout_completed`, write `fw_distinct_id` into a Shopify cart/checkout **note attribute** (`_fw_distinct_id`) so the `orders/create` webhook can read it server-side even if the client beacon is blocked.
- [ ] Extend the existing `orders/create` webhook handler: read `_fw_distinct_id` attribute; if present, server-side `posthog.capture(distinct_id, 'purchase_completed', …)` and `posthog.identify` merging the customer email; store `fw_distinct_id` on the `customer`/`order` record for future cross-reference.
- [ ] Backfill path (pre-pixel orders only): retain probabilistic email match (`utm_attribution` email ↔ order email, most-recent within 30-day window per attribution invariant §4). Mark these `link_method = 'email_match'` vs `'pixel'` for confidence reporting.

#### Tests
- Unit: note-attribute extraction from webhook payload.
- Unit: link_method selection (pixel id present ⇒ deterministic; absent ⇒ email fallback).
- Integration: simulate `orders/create` with `_fw_distinct_id` ⇒ server PostHog capture (mocked) + customer row stamped.

### Phase 4: Server-side PostHog client
- [ ] Build singleton lazy `posthog-node` client in `src/lib/analytics/posthog.ts` (extend the existing 28-line stub).
- [ ] Methods: `capture(distinctId, event, properties)`, `identify(distinctId, properties)`, `shutdown()`.
- [ ] `flushAsync()` before every serverless handler returns (Vercel kills the process after response — current stub's per-call `flush()` is acceptable but centralize it).
- [ ] Server-side capture for key admin actions (login, report viewed) using the Next admin client — distinct from the visitor pixel.

#### Tests
- Unit: singleton behavior, lazy init without env (no throw in dev).
- Unit: flush invoked on shutdown.

### Phase 5: PostHog → NeonDB extraction cron
- [ ] Extend `src/lib/analytics/posthog.ts` with extraction via PostHog query API (project ID `430335`).
- [ ] Daily aggregate by event name + date → upsert `posthog_daily` (event_name, date, count, unique_users).
- [ ] Key events: `$pageview`, `purchase_completed`, plus per-source uniques for the attribution dashboard.
- [ ] Wire `/api/cron/extract-posthog` (every 3h per vercel.json); cron-auth protected.
- [ ] Backfill script: `scripts/backfill-posthog.ts`.

#### Tests
- Unit: query API response parsing.
- Unit: daily aggregation.
- Integration: extract one day → `posthog_daily` rows.

### Phase 6: Conversion events (pixel) — feature flags deferred
- [ ] Add pixel events for funnel steps available from Shopify standard events: `product_viewed`, `checkout_started` (the Shopify equivalent of the old "shopify_redirect" — there is no separate redirect now; landing and store are one Shopify site).
- [ ] Ensure every pixel event carries `fw_distinct_id` + UTM context from `fw_attribution`.
- [ ] **Feature flags / landing-page A/B testing: deferred** (see Scope). Document the constraint in specs/current/integrations.md: Custom Pixel sandbox cannot gate theme rendering; would require a Shopify theme app embed — separate plan.

#### Tests
- Unit: event property construction includes distinct_id + utm context.
- Manual: walk product_viewed → checkout_started → checkout_completed, verify ordered funnel in PostHog.

### Phase 7: Admin dashboard attribution & funnel
- [ ] `/api/admin/attribution`: combine `utm_attribution` + linked Shopify orders → channel → conversion + revenue (not just visits). Show `link_method` confidence split.
- [ ] `/api/admin/funnel`: pageview → product_viewed → checkout_started → purchase, distinct persons per step (from `posthog_daily` + Shopify orders).
- [ ] Replace the customers-only UTM card on the attribution page with orders + revenue by first-touch channel (resolves the order-vs-customer grain mismatch noted in prior review).
- [ ] "Full journey" view for a customer: PostHog events → Shopify order.

#### Tests
- Unit: funnel conversion-rate math.
- Unit: attribution query joining UTM + orders.
- E2E: attribution page shows channel breakdown with conversion + revenue.

## Notes
- **Deterministic vs probabilistic (the core upgrade):** because all pages share `fitwellbuckle.co`, the same `fw_distinct_id` cookie is present at first landing pageview and at `checkout_completed`. The link is exact. The old plan's email-match approach is demoted to a backfill for orders predating the pixel and is explicitly labeled lower-confidence (`link_method`).
- **Two-surface model (per official PostHog Shopify guide):** `theme.liquid` runs the full `posthog-js` snippet with real `window`/`document` (landing + storefront — autocapture, $pageview, UTM, person props all work normally). The **checkout** page rejects the snippet, so it uses a Custom Pixel; the official guide *does* load `posthog-js` inside that pixel and calls `posthog.capture`/`posthog.identify`. (Correction to an earlier draft of this plan: posthog-js is used in the pixel — not raw fetch.)
- **The gap the official guide leaves open (our core add):** it relies on "default cookie handling," but the checkout pixel is sandboxed and won't reliably read the `.fitwellbuckle.co` posthog-js cookie set by the theme — so a naive install attaches the purchase to a *new* anonymous person and breaks attribution. Fix = the `fw_distinct_id` identity bridge (theme writes it, pixel bootstraps from it via `browser.cookie`). The Custom Pixel sandbox exposes only `analytics`/`browser`/`init`; `browser.cookie` can still set/read `Domain=.fitwellbuckle.co`. Code defensively — sandbox accessors may be undefined on some surfaces.
- Project token is the public write-only key (safe in the pixel/client). `POSTHOG_PERSONAL_API_KEY` is server-only for the extraction cron — never ship it in the pixel.
- `person_profiles: identified_only` is fine: anonymous visitors still generate events under `fw_distinct_id`; the profile is created/enriched when `identify` runs (purchase or email capture).
- Cookie attributes are now specified in specs/invariants/attribution.md §3 (`Domain=.fitwellbuckle.co`). Keep the two cookies in sync with that invariant.
- Flush on Vercel: serverless dies after response — always `flushAsync()` before returning from webhook/cron handlers.
- PostHog free tier 1M events/month — ample for this funnel volume.
- Optional uplift: an email-capture form on the Shopify landing section increases identified-rate before purchase, but is no longer required for attribution correctness given the deterministic pixel link.
