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

### Phase 0: Spike — does default Shopify-pixel stitching already work? ✅ DONE 2026-06-03
**Result: yes.** Vanilla install (no `fw_distinct_id` bridge) stitches the storefront's anonymous person to the pixel's identified person on Chrome desktop. Mechanism: Shopify hosts the Custom Pixel iframe at `https://www.fitwellbuckle.co/web-pixels@.../sandbox/...` — same origin as the storefront — so the first-party `.fitwellbuckle.co` posthog-js cookie is shared between both posthog-js instances. The pixel's `posthog.identify(email)` triggers posthog-js's standard `$anon_distinct_id` merge.

- [x] Stand up the vanilla install: `posthog-js` snippet in `theme.liquid` + minimal Custom Pixel that does `posthog.identify(email)` + `posthog.capture('purchase_completed')`. No bridge.
- [x] One controlled test order (Greg, Chrome desktop, 100% discount): pre-purchase pageviews + `purchase_completed` landed on one Person `127e9a10-edc3-59a8-8865-ca245daeb61f`.
- [x] Findings + reasoning recorded in `specs/research/posthog-shopify-stitching.md`.
- [x] Mobile Safari verification skipped — Safari ITP affects third-party cookies, not first-party same-origin, so the chosen mechanism doesn't have a plausible Safari-specific failure mode. Will swap to bridged install if real-customer Safari traffic ever shows split Persons.

### Phase 1: PostHog on Shopify — vanilla install ✅ DONE 2026-06-03
Steady-state install is what was deployed in Phase 0. Files: `shopify/theme-posthog-snippet.html` (theme.liquid) + `shopify/custom-pixel.js` (Settings → Customer events, `posthog`). Both are vanilla (no `fw_distinct_id` bridge). The pixel subscribes to `checkout_started` and `checkout_completed`; `$pageview`/autocapture come from the theme snippet.

### Phase 2: UTM capture & first-touch attribution ✅ CODE COMPLETE 2026-06-03 — awaiting theme redeploy
- [x] UTM parser added to `shopify/theme-posthog-snippet.html` (`source`/`medium`/`campaign`/`term`/`content`/`gclid` from `location.search`, plus `document.referrer`).
- [x] First-touch guard: `fw_attribution` cookie (`Domain=.fitwellbuckle.co`, 30 days, SameSite=Lax). Subsequent pageviews short-circuit. Direct visits (no UTM/gclid/referrer) just set the cookie and skip the POST.
- [x] PostHog person properties: `$set_once` first-touch (`utm_*`, `first_referrer`, `first_landing_page`); `$set` last-touch.
- [x] Write-through to `utm_attribution`: POST to `https://admin.fitwellbuckle.co/api/tracking/utm` (already-deployed Next.js endpoint, Zod-validated, idempotent upsert on `session_id`, CORS for `www.fitwellbuckle.co`).
- [x] Endpoint tests pass (`src/app/api/tracking/utm/route.test.ts`).

### Phase 3: Purchase → PostHog link enrichment ✅ CODE COMPLETE 2026-06-03 — awaiting theme redeploy
- [x] Pixel emits `purchase_completed` with `order_id`, `checkout_token`, `order_value`, `currency`.
- [x] Pixel `$set` `last_order_at`, `$set_once` `first_order_at` (`shopify/custom-pixel.js`).
- [x] Cart-attribute backstop: theme snippet POSTs `/cart/update.js` with `{ attributes: { _fw_distinct_id: <posthog distinct_id> } }` on every storefront pageview. Survives to the order webhook as `note_attributes._fw_distinct_id`.
- [x] `orders/create` webhook handler (via `linkOrderToAttribution` in `src/lib/analytics/order-attribution.ts`, called from `src/lib/shopify/sync.ts:241`) reads the note attribute, stamps `link_method = 'pixel'` on `order.linkMethod` and `customer.fwDistinctId`, marks the matching `utm_attribution.converted = true`, and server-side captures the purchase in PostHog with first-touch UTM enrichment.
- [x] Email-match fallback (lower confidence, `link_method = 'email_match'`) wired for orders missing the note attribute.
- [ ] Backfill pre-pixel orders (pre-2026-06-03) via the email-match path. Defer until baseline funnel is up; not load-bearing.

### Phase 4: Server-side PostHog client ✅ DONE
- [x] Lazy singleton `posthog-node` client at `src/lib/analytics/posthog.ts`. `captureEvent`, `identify`, `aliasIdentity`, `captureServerEvent`, `flushEvents`. Used by `linkOrderToAttribution`.

### Phase 5: PostHog → NeonDB extraction cron ✅ DONE
- [x] HogQL query, daily aggregate by event name + person → `posthog_daily`. Wired to `/api/cron/extract-posthog` on every 3h cron (`vercel.json`).

### Phase 6: Conversion events (pixel) — feature flags deferred ✅ CODE COMPLETE 2026-06-03
- [x] `checkout_started`, `checkout_completed`, `product_viewed`, `product_added_to_cart` subscribed in `shopify/custom-pixel.js`.
- [x] Storefront `$pageview` + autocapture from the theme snippet.
- [ ] **Feature flags / landing-page A/B testing: deferred** (see Scope). Custom Pixel sandbox cannot gate theme rendering; would require a Shopify theme app embed — separate plan.

### Phase 7: Admin dashboard attribution & funnel — partially done
- [x] `getChannelPerformance(from, to)` + `getLinkConfidence(from, to)` in `src/lib/analytics/attribution.ts`; the `/attribution` page renders both (orders+revenue by first-touch channel, link confidence split).
- [x] `getFunnelData()` (PostHog `$pageview` → `product_viewed` → `product_added_to_cart` → `checkout_started` → `purchase`) wired into `/funnel` page as a new card. Empty until events accumulate.
- [ ] "Full journey" view for a customer: PostHog events → Shopify order. Deferred — requires customer-detail PostHog query.
- [ ] Baseline funnel comparison against "Rightness" targets in `specs/ops/PRIORITIES.md` — review once 7+ days of data have flowed.

## Notes
- **Stitching works without a bridge** (confirmed 2026-06-03, `specs/research/posthog-shopify-stitching.md`). Shopify hosts the Custom Pixel iframe at `https://www.fitwellbuckle.co/web-pixels@.../sandbox/...` — same origin as the storefront — so the first-party `.fitwellbuckle.co` posthog-js cookie is shared. Earlier drafts of this plan assumed the pixel sandbox couldn't read the storefront cookie and prescribed an `fw_distinct_id` bridge. That assumption was wrong for Shopify's current implementation; the bridge was dropped.
- **Two-surface model (per official PostHog Shopify guide):** `theme.liquid` runs the full `posthog-js` snippet with real `window`/`document` (landing + storefront — autocapture, $pageview, UTM, person props all work normally). The **checkout** page rejects the snippet, so it uses a Custom Pixel; the pixel loads its own posthog-js instance and calls `posthog.capture`/`posthog.identify`.
- **Linkage mechanism:** posthog-js's standard `$identify` event carries `$anon_distinct_id`. On `checkout_completed` the pixel calls `posthog.identify(email)`; PostHog merges the pre-purchase anonymous Person onto the email-keyed Person.
- Project token is the public write-only key (safe in the pixel/client). `POSTHOG_PERSONAL_API_KEY` is server-only for the extraction cron — never ship it in the pixel.
- `person_profiles: identified_only` is fine: anonymous visitors still generate events under their posthog-js distinct_id; the Person profile is created/enriched when `identify` runs (purchase).
- Cookie attributes are specified in specs/invariants/attribution.md §3 (`Domain=.fitwellbuckle.co`). The `fw_attribution` cookie now just marks first-touch capture; visitor identity rides on PostHog's own cookie.
- Flush on Vercel: serverless dies after response — always `flushAsync()` before returning from webhook/cron handlers.
- PostHog free tier 1M events/month — ample for this funnel volume.
- Optional uplift: an email-capture form on the Shopify landing section increases identified-rate before purchase, but is no longer required for attribution correctness given the deterministic pixel link.
