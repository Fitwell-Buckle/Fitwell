# PostHog × Shopify identity stitching — Phase 0 findings

**Status:** closed 2026-06-03.
**Decision:** **Default stitching works. No `fw_distinct_id` bridge needed.** Shipping vanilla install as the steady state.

---

## Question

Does PostHog's default cookie handling stitch the anonymous storefront person to the identified checkout person on `.fitwellbuckle.co`, *without* an explicit identity bridge between the theme snippet and the Custom Pixel?

The earlier draft of `specs/work-plans/todo/posthog-integration.md` assumed the pixel sandbox couldn't read the storefront's posthog cookie, and prescribed an `fw_distinct_id` bridge as the fix. We needed to test that assumption before building the bridge.

## Result

**Stitched perfectly on Chrome desktop, N=1 controlled test.**

Mechanism observed:
- Shopify hosts the Custom Pixel iframe at `https://www.fitwellbuckle.co/web-pixels@.../sandbox/modern/checkouts/cn/<token>/<locale>` — **same origin** as the storefront.
- The posthog-js cookie set on `.fitwellbuckle.co` by the theme snippet is therefore visible to the pixel's posthog-js instance.
- When the pixel calls `posthog.identify(email)`, posthog-js sends a `$identify` event with `$anon_distinct_id: <the storefront's anonymous id>`, and PostHog merges the pre-purchase anonymous Person onto the email-keyed Person.

The earlier framing — "the official guide silently breaks attribution" — was wrong for Shopify's current pixel implementation.

## Evidence

Greg ran one controlled test on 2026-06-03 (Chrome desktop, 100% discount code, no real payment). Person `127e9a10-edc3-59a8-8865-ca245daeb61f` carries the full timeline:

| Time (UTC) | Surface | distinct_id | event(s) | person_id |
|---|---|---|---|---|
| 22:14 | admin.fitwellbuckle.co | `019e40b9-...` (anon) | $autocapture x9 (admin dashboard) | `127e9a10-...` |
| 23:10 | www.fitwellbuckle.co | `019e40b9-...` (anon, same id) | $pageview / | `127e9a10-...` |
| 23:10–23:14 | www.fitwellbuckle.co | `019e40b9-...` | $pageview /collections/buckles, /cart, /products/fitwell-m1-titanium-bead-blasted, /cart | `127e9a10-...` |
| **00:02:31** | **Custom Pixel sandbox** | **`greg@fitwellbuckle.co`** (identified) | **`$identify` + `purchase_completed`** | **`127e9a10-...`** |
| 00:02:52+ | www.fitwellbuckle.co | `greg@fitwellbuckle.co` | $pageview / | `127e9a10-...` |

Pixel was the vanilla install in `shopify/phase-0-vanilla/custom-pixel.js` (now promoted to `shopify/custom-pixel.js`) — no identity bridge. The merge happened via posthog-js's standard `$anon_distinct_id` mechanism, which only works if the pixel's posthog-js can read the same cookie the storefront's posthog-js wrote.

**Side benefit:** Greg's admin dashboard usage (via the admin's posthog-provider) was anonymous at the time and got back-stitched onto the email-keyed Person. Future change: identify admin staff explicitly in the admin posthog-provider so staff Persons aren't created backwards via test purchases.

## Why we didn't bother with mobile Safari verification

The chosen mechanism is first-party same-origin cookie sharing. Safari ITP only affects *third-party* cookies; first-party cookies on the same origin are unaffected. There's no plausible failure mode unique to Safari here. If real-customer Safari data ever shows split Persons, the fix path is to swap to a bridged install — which we know works because it was already designed and is recoverable from git history.

## Implications for the rest of the plan

- **Phase 1 (bridged install with `fw_distinct_id`):** dropped. Steady-state install is the vanilla version that's already live.
- **Phase 2 (UTM capture + write-through to `utm_attribution`):** unchanged. Doesn't depend on the bridge — uses posthog-js's own distinct_id directly.
- **Phase 3 (cart-attribute `_fw_distinct_id` backstop on `orders/create`):** demoted to belt-and-suspenders, not load-bearing. The client pixel's `purchase_completed` + `identify(email)` is the primary linkage. Server-side backstop is a future enhancement only if we see beacon drop-off in real traffic.
- **Phases 4–7:** unchanged.
