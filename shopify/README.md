# Shopify-side PostHog install (manual)

These artifacts live in this repo for version control but are **installed
by hand in the Shopify admin** — they cannot be deployed from this codebase.
They pair with the in-repo backend (extraction cron, admin dashboard, and
in future, UTM write-through + webhook enrichment).
Plan: `specs/work-plans/todo/posthog-integration.md`.
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

## How identity stitches across surfaces

Storefront snippet and pixel are both posthog-js instances on `.fitwellbuckle.co`.
Shopify hosts the Custom Pixel iframe at
`https://www.fitwellbuckle.co/web-pixels@.../sandbox/...` — same origin as the
storefront — so the first-party posthog-js cookie is shared between them.

1. First storefront pageview → posthog-js mints anonymous distinct_id, writes
   `.fitwellbuckle.co` cookie. Person row created lazily on identify (we run
   `person_profiles: 'identified_only'`).
2. Subsequent pageviews accumulate against the same anonymous distinct_id.
3. Checkout page loads → Custom Pixel inits its own posthog-js, which reads the
   shared cookie and bootstraps with the same anonymous distinct_id.
4. On `checkout_completed`, pixel calls `posthog.identify(email)`. posthog-js
   sends a `$identify` event with `$anon_distinct_id` set, and PostHog merges
   the anonymous person onto the email-keyed person.
5. Result: one Person carries the full journey — pre-checkout pageviews +
   purchase + post-checkout activity.

This was empirically confirmed on 2026-06-03: see
`specs/research/posthog-shopify-stitching.md`. Earlier drafts of the plan
included an `fw_distinct_id` identity bridge to work around a presumed
cookie-isolation problem in the pixel sandbox; the spike showed the pixel
iframe is same-origin and the problem doesn't exist on Shopify's current
implementation, so the bridge was removed.
