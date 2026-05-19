# Shopify-side PostHog install (manual)

These two artifacts live in this repo for version control but are **installed
by hand in the Shopify admin** — they cannot be deployed from this codebase.
They pair with the in-repo backend (tracking endpoint, webhook enrichment,
extraction cron, dashboard). Plan: `specs/work-plans/todo/posthog-integration.md`.
Invariant: `specs/invariants/attribution.md`.

| File | Where it goes |
|---|---|
| `theme-posthog-snippet.html` | Online Store → Themes → Edit code → `theme.liquid`, just before `</head>` (storefront + landing pages) |
| `custom-pixel.js` | Settings → Customer events → Add custom pixel (name `posthog`) → paste → Save → Connect (checkout) |

PostHog project (US Cloud): token `phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq`,
project ID `430335`, host `https://us.i.posthog.com`.

## Required env vars (Vercel + .env.local)

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xhdBzfsf47Vy5MU9spMMtaJWtBuAJFkGxg2DcRiGN7Aq
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PROJECT_ID=430335
POSTHOG_PERSONAL_API_KEY=<server-only secret, for the extraction cron>
```

The first two are also safe in the public theme/pixel. `POSTHOG_PERSONAL_API_KEY`
is server-only (Vercel) — never in the theme or pixel.

## ⚠️ Do Phase 0 BEFORE trusting the bridge

The whole point of the `fw_distinct_id` bridge is to fix an *unverified*
assumption: that the sandboxed checkout pixel can't read the storefront
cookie. Confirm empirically first (see plan Phase 0):

1. Install both artifacts on a **dev/preview theme + test pixel**.
2. Open `https://www.fitwellbuckle.co/?utm_source=spiketest&utm_medium=qa`,
   browse a product, complete a real test checkout.
3. In PostHog → Activity, find the person for that checkout:
   - **Same person** holds the `$pageview` (with `utm_source=spiketest`) **and**
     `purchase_completed` → stitching works; the bridge is hardening.
   - **Two persons** → the bridge is load-bearing; keep it.
4. Compare the `fw_distinct_id` cookie value (storefront devtools) against the
   pixel's `distinct_id` on the purchase event — equal confirms the bridge.
5. Record the result in `specs/research/posthog-shopify-stitching.md`.

## How the pieces connect

```
theme snippet ──► posthog-js ($pageview, $set_once UTM)
      │
      ├──► POST /api/tracking/utm ──► utm_attribution (durable, DB)
      ├──► /cart/update.js attributes._fw_distinct_id  (server backstop)
      └──► fw_distinct_id cookie (.fitwellbuckle.co)
                                   │
checkout pixel ──► bootstrap(distinctID) ─┘ ──► purchase_completed + identify(email)

Shopify orders/create webhook
      └──► linkOrderToAttribution(): reads note_attributes._fw_distinct_id
           → stamps order.fw_distinct_id + link_method='pixel'
           → marks utm_attribution.converted
           → server-side PostHog identify + purchase_completed (belt & suspenders)

extract-posthog cron (every 3h) ──► posthog_daily rollups
Attribution page ──► Channel Performance (orders+revenue, first-touch) + link confidence
```

Two independent paths produce the deterministic link (client pixel **and**
the server webhook via the cart note attribute), so a blocked beacon does not
lose attribution.
