# PostHog instrumentation — how it's wired and how to extend it

End-to-end map of the visitor → buyer instrumentation, and the recipes for adding new measurement.

> Definitions: **Event taxonomy** (what events exist, what to call them) lives at `specs/strategy/event-taxonomy.md`. **Identity stitching** (the spike that proved the two-surface install works without a bridge) lives at `specs/research/posthog-shopify-stitching.md`. This doc is about *operations*: how the pieces fit and how to change them.

## Architecture: three surfaces

| Surface | Where it runs | Files | Auto-fired events |
|---|---|---|---|
| Storefront theme snippet | `www.fitwellbuckle.co` (every storefront page) | `shopify/theme-posthog-snippet.html` → pasted into `theme.liquid` | `$pageview`, `$autocapture`, `$pageleave`, `$web_vitals` |
| Shopify Custom Pixel | Sandboxed iframe at `www.fitwellbuckle.co/web-pixels@.../sandbox/...` (same origin) | `shopify/custom-pixel.js` → pasted into Customer Events → pixel `posthog` | `product_viewed`, `product_added_to_cart`, `checkout_started`, `purchase_completed` |
| Admin Next.js client | `portal.fitwellbuckle.co/*` | `src/components/providers/posthog-provider.tsx` + `posthog-admin-identify.tsx` | `$pageview` + identifies signed-in admins so staff Persons don't get back-stitched onto buyer profiles |

Identity stitches across all three because they all run posthog-js against `.fitwellbuckle.co` first-party cookies, and the Custom Pixel iframe is same-origin (Shopify hosts it under the storefront domain). The pixel's `posthog.identify(email)` triggers posthog-js's standard `$anon_distinct_id` merge → one Person carries the full pre-purchase + purchase + post-purchase timeline. The spike that confirmed this: `specs/research/posthog-shopify-stitching.md`.

## Backend pieces

| File | Purpose |
|---|---|
| `src/lib/schema.ts` | `customer.posthogDistinctId`, `order.posthogDistinctId`, `utm_attribution` table. DB columns are still named `fw_distinct_id` (drizzle column mapping); rename queued for a focused `drizzle-kit` session — see `customer.posthogDistinctId` comment. |
| `src/app/api/tracking/utm/route.ts` | Public endpoint the storefront snippet POSTs UTM captures to. CORS for `www.fitwellbuckle.co`. Accepts both `posthogDistinctId` (current) and `fwDistinctId` (legacy snippet name) for deploy-lag tolerance. Idempotent upsert by `session_id`. |
| `src/lib/analytics/order-attribution.ts` | `linkOrderToAttribution()` — called from the orders/create webhook. Reads `_fw_distinct_id` cart attribute, sets `order.linkMethod = 'pixel'`, marks the matching `utm_attribution` row converted, enriches the PostHog Person server-side, back-fills `utm_attribution.visitor_id = customer.id` so repeat-customer orders can fall back to `email_match`. |
| `src/lib/analytics/posthog.ts` | Server-side posthog-node client (lazy singleton). |
| `src/lib/analytics/posthog-extract.ts` + `src/app/api/cron/extract-posthog/route.ts` | Every-3h cron rolls up event counts + unique persons by event-name into `posthog_daily`. Used by dashboards that need historical aggregates. |
| `src/lib/admin/funnel.ts` | `getFunnelData()` runs a HogQL `windowFunnel` cohort query; `getLandingPageBreakdown()` runs an entry-page aggregation. Both query PostHog live (not `posthog_daily`). |
| `src/lib/analytics/attribution.ts` | `getChannelPerformance()` (legacy, customer.utm_source), `getPixelAttributedChannelPerformance()` (true first-touch, joins order → utm_attribution via fw_distinct_id), `getLinkConfidence()` (pixel / email_match / unattributed split). |

## How to: add measurement to a new landing page

Goal: tag a new page so it contributes to `section_scrolled_into_view`, `section_dwelled`, `cta_clicked`, and is countable in the funnel without writing new JS.

**Prerequisites:** Shopify CLI workflow (`specs/current/shopify-theme-edits.md`).

1. Identify the page template:
   ```bash
   curl -sS "https://www.fitwellbuckle.co/pages/<handle>.json" \
     | python3 -c "import json,sys; p=json.load(sys.stdin)['page']; print(p.get('template_suffix'))"
   ```
2. `shopify theme pull --live`, then open the corresponding `templates/page.<suffix>.json` (or the default `page.json`). Find the active `custom_liquid_*` block (skip `disabled: true`).
3. In the embedded HTML, add attributes:
   - `data-section="<id>"` on wrapping elements. Allowed ids (canonical, from `specs/strategy/event-taxonomy.md`): `hero`, `problem`, `how_it_works`, `specs`, `comparison`, `story`, `faq`, `cta`, `footer`. Inventing new ones is fine; just register them in the taxonomy doc.
   - `data-cta="<page>_<location>_<intent>"` on primary CTAs (e.g. `data-cta="m1_hero_shop_buckles"`). Page-scoped + snake_case so they're greppable later.
4. `shopify theme push --live --allow-live --nodelete --only "templates/page.<suffix>.json"`
5. Verify (per `specs/current/shopify-theme-edits.md`): re-pull + grep for the attributes; wait 5–15 min for CDN; check PostHog Activity for the new events.

The storefront snippet's `wireEngagementListeners()` (in `shopify/theme-posthog-snippet.html`) does the rest — IntersectionObserver fires `section_scrolled_into_view` immediately and `section_dwelled` after 3s; document-level click delegation fires `cta_clicked`. No per-element JS, no theme rebuild.

### Custom `product_viewed` on landing-PDP pages

Shopify's Custom Pixel `product_viewed` only fires on `/products/*` URLs. Some landing pages (e.g., `/pages/m1-micro-adjust-buckle`) are conceptually PDPs but live at `/pages/*`. To count them in the funnel, register the path in the snippet's `fireLandingPdpView()`:

```js
var LANDING_PDPS = {
  '/pages/m1-micro-adjust-buckle': {
    product_handle: 'm1-micro-adjust-buckle',
    product_title: 'Fitwell M1 Micro-Adjust Buckle',
    product_type: 'buckle'
  },
  // add new landing PDPs here
};
```

Then re-paste the updated snippet into `theme.liquid` (or push via `shopify theme push --only "layout/theme.liquid"`). The new entry starts firing immediately.

## How to: add a new custom event

1. Add the event name + properties to `specs/strategy/event-taxonomy.md` under the right registry section (engagement, intent, cart/checkout, etc.). Naming convention: `<surface>_<action>_<object>` snake_case.
2. Add the capture call where the event is emitted:
   - Storefront snippet (`shopify/theme-posthog-snippet.html`) — for events fired from real-DOM storefront pages
   - Shopify Custom Pixel (`shopify/custom-pixel.js`) — for events tied to Shopify standard subscriptions (`analytics.subscribe(...)`)
   - Admin code — call `posthog.capture("<event_name>", { ...properties })` directly (posthog-js is initialized in the root layout)
3. If the event should flow into the funnel/admin dashboards, add it to the `event IN (...)` filter in `src/lib/admin/funnel.ts` (windowFunnel + landing-page query).
4. Update the stage progression mapping in `specs/strategy/event-taxonomy.md` if the new event signals stage transitions.

## How to: write HogQL queries from the codebase

The extraction cron + dashboard helpers all hit `${host}/api/projects/${POSTHOG_PROJECT_ID}/query/` with `{ query: { kind: "HogQLQuery", query: "<SQL>" } }`. Examples:

- `src/lib/analytics/posthog-extract.ts` — daily event rollup (groups by event name + date, counts uniques per person)
- `src/lib/admin/funnel.ts` — `windowFunnel(2592000)(toUnixTimestamp(timestamp), event = '$pageview', event = 'product_viewed', …)` for cohort progression
- `src/lib/admin/funnel.ts` — `argMin(properties.$pathname, timestamp)` per person for entry-page aggregation

PostHog exposes most ClickHouse string/array/window functions (`windowFunnel`, `argMin`, `groupArray`, `percentile_cont`, etc.). When prototyping a new query, run it via curl first to check the shape:

```bash
cat > /tmp/q.json <<'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT … FROM events WHERE … LIMIT 5"}}
EOF
curl -s -X POST "$NEXT_PUBLIC_POSTHOG_HOST/api/projects/$POSTHOG_PROJECT_ID/query/" \
  -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  --data @/tmp/q.json | python3 -m json.tool
```

Wrap successful queries in a helper that lives next to the consumer (e.g., `src/lib/admin/funnel.ts`) — keep the HogQL string close to its caller for review.

## Common pitfalls

- **Custom Pixel is sandboxed** — only `analytics`, `init`, `browser` accessors are reliably available. `document`, `window`, `localStorage` may exist on some Shopify themes and not others. The pixel must fail safe; wrap subscriptions in `try { … } catch (e) {}`.
- **CDN cache** — theme pushes take 5–15 minutes to reach all CDN edges. Verify by re-pulling, not by curling the storefront. See `specs/current/shopify-theme-edits.md`.
- **PostHog 1M events/month free tier** — ample for current volume. Watch the event count in PostHog → Settings if we start firing high-cardinality custom events.
- **Person profiles `identified_only`** — anonymous visitors generate events but no Person profile until `identify()` runs (purchase). This is correct for our use case; just be aware that some PostHog queries that "GROUP BY person" exclude unidentified visitors.
- **Schema field rename gap** — code uses `posthogDistinctId`; DB columns are still `fw_distinct_id`. The cart attribute (`_fw_distinct_id`) and Shopify-side webhook payload field also stay as-is. Don't be surprised by the dual naming until the migration ships.
- **Admin identification timing** — `PosthogAdminIdentify` calls `identify()` on mount inside the admin layout. If an admin visits the storefront first (anonymous) then logs into admin, the merge happens correctly via `$anon_distinct_id`. The first time you see an admin's email in PostHog, their prior anonymous browsing of the storefront retroactively attaches to that Person.

## Related docs

- `specs/strategy/event-taxonomy.md` — canonical event names, properties, stage progression
- `specs/strategy/funnel.md`, `specs/strategy/retention-loop.md` — funnel definitions the events feed
- `specs/invariants/attribution.md` — attribution model (first-touch, 30-day window, link confidence)
- `specs/research/posthog-shopify-stitching.md` — the spike that proved the install architecture
- `specs/current/shopify-theme-edits.md` — Shopify CLI workflow for the theme half of the install
- `shopify/README.md` — manual paste-install instructions for the snippet + pixel (one-time setup)
