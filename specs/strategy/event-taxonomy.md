# PostHog Event Taxonomy

Last updated: 2026-06-03

> **Status: reconciled with the deployed install (2026-06-03).** The
> original draft invented our own names for cart/page lifecycle events
> (`page_viewed`, `cart_item_added`). The deployed install uses
> Shopify's Custom Pixel standard events and posthog-js's automatic
> events directly — renaming them would create parallel taxonomies that
> drift. This doc now uses the actual names we fire, and the persona ×
> funnel framework is layered as event *properties* rather than custom
> names.

## Why a Taxonomy

PostHog events are useless if they're inconsistently named. We can't
ask "did this page move visitors from `problem_aware` to
`solution_aware`?" if some pages emit `solution_clicked`, others emit
`btn_click_solution`, and a third emits `clicked-solution`. Pick
one shape and stick to it.

This file is the source of truth for event names and the properties
attached to them.

## Where events come from

Our install has three event sources, each fixing certain names. We
adopt their names verbatim and don't invent parallel ones.

1. **posthog-js (storefront theme snippet)** — auto-fires `$pageview`,
   `$autocapture`, `$pageleave`, `$web_vitals`, `$exception`,
   `$identify`, `$set`. We don't rename these.
2. **Shopify Custom Pixel** — subscribes to Shopify standard events:
   `product_viewed`, `product_added_to_cart`, `checkout_started`,
   `checkout_completed`, `cart_viewed`, `payment_info_submitted`, etc.
   These names are also adopted as-is.
3. **Custom events fired by the storefront snippet** — events we
   explicitly capture for engagement signal that posthog-js and
   Shopify don't provide (e.g. `section_dwelled`, `video_progress`,
   `cta_clicked`). These follow our naming convention below.

## Naming Conventions (custom events only)

### Event names

- **`snake_case`** — lowercase, words separated by underscores.
- **Format:** `<surface>_<action>_<object>` where applicable.
- **Surfaces:** `section`, `video`, `cta`, `form`, `email`, `nav`.
  Cart/checkout/page surfaces are owned by Shopify standard events
  and posthog-js — don't invent custom names that overlap.
- **Examples:**
  - `section_scrolled_into_view`
  - `video_played`
  - `cta_clicked`
  - `compatibility_checked`

### Don't

- Don't rename built-in events. `product_viewed` stays
  `product_viewed`; we won't fork to `pdp_viewed`.
- Don't include the page name in custom event names. Pass it as a
  property instead.
- Don't create one-off events for one-off pages. Reuse the event,
  vary the properties.
- Don't synonym-drift. `cta_clicked` and `button_clicked` should
  not both exist.

## Required properties on custom events

Every custom event carries these properties so we can later cohort by
persona × stage. Built-in events (`$pageview`, `product_viewed`,
etc.) get persona/stage cohort signal from the page they're emitted
on — passed via `posthog.register()` on the snippet so all events on
a page inherit the page's targeting metadata.

| Property | Type | Required | Description |
|---|---|---|---|
| `page` | string | yes | Canonical page slug (e.g. `home`, `m1-landing`) |
| `page_goal_stage` | enum | yes for marketing pages | Target funnel stage the page is built to advance ([[funnel]]) |
| `page_target_persona` | enum | yes for marketing pages | Target persona ([[personas]]) or `mixed` |
| `funnel_stage_inferred` | enum | optional | Best guess at visitor's current stage based on entry signals |
| `persona_hint` | enum | optional | Best guess at visitor's persona, when distinguishable |
| `hypothesis_id` | string | optional | If this page/variant is testing a specific hypothesis (e.g. `H4`) |
| `variant` | string | optional | A/B test variant identifier |

UTM properties (`utm_source`, `utm_medium`, `utm_campaign`, etc.) are
attached to the **Person** profile by the snippet (first-touch
`$set_once`, last-touch `$set`) — they don't need to be on every
event; PostHog joins them automatically when grouping by person.

## Event Registry

### Page lifecycle (posthog-js, automatic)

- **`$pageview`** — every page load. Carries `$current_url`,
  `$pathname`, `$host`, `$referrer`, `$referring_domain`,
  `$browser`, `$device_type`, plus all UTM params on the URL.
- **`$pageleave`** — page unload. Carries `$time_spent_seconds`.
- **`$autocapture`** — clicks on auto-instrumented elements
  (anchors, buttons, form submits). Useful for low-effort coverage
  but high noise — prefer explicit `cta_clicked` for known CTAs.
- **`$web_vitals`** — Core Web Vitals (LCP, INP, CLS) per page load.

### Cart and checkout (Shopify Custom Pixel, standard events)

- **`product_viewed`** — fires on `/products/*` PDPs via the Shopify
  pixel. Also fired by the storefront snippet on canonical "landing
  PDPs" listed in `LANDING_PDP_PATHS` (currently
  `/pages/m1-micro-adjust-buckle`) so the bulk of Meta/IG traffic
  isn't excluded. Properties: `product_id`, `product_title`,
  `variant_id`, `variant_title`, `sku`, `price`, `currency`,
  optionally `source: 'shopify_pixel' | 'theme_snippet'`.
- **`product_added_to_cart`** — Shopify standard. Properties:
  `product_id`, `product_title`, `variant_id`, `variant_title`,
  `sku`, `quantity`, `price`, `currency`.
- **`checkout_started`** — Shopify standard. Properties: `value`,
  `currency`.
- **`checkout_completed`** — Shopify standard (purchase finalised).
  We re-emit as **`purchase_completed`** for consistency with the
  rest of the analytics vocabulary. Properties: `order_id`,
  `checkout_token`, `order_value`, `currency`.
- **`cart_viewed`** — not yet subscribed; add if cart-page abandon
  becomes a focus.

### Custom engagement (storefront snippet, our names)

These don't have built-in equivalents and are useful for refining
mid-funnel stage progression beyond what Shopify exposes.

- **`section_scrolled_into_view`** — major page sections (`hero`,
  `problem`, `how_it_works`, `specs`, `comparison`, `story`, `faq`,
  `cta`, `footer`) report when they enter the viewport. Property:
  `section_id`.
- **`section_dwelled`** — section was in viewport for ≥N seconds.
  Properties: `section_id`, `dwell_seconds`.
- **`video_played`** — video started.
- **`video_progress`** — fired at 25/50/75/100% completion.
  Property: `progress_pct`.
- **`video_paused`** — user paused.
- **`cta_clicked`** — any primary call-to-action. Properties:
  `cta_id`, `cta_label`, `destination`.
- **`compatibility_checked`** — user used a fit/compatibility tool.
  Properties: `watch_model`, `result`.
- **`pricing_viewed`** — pricing element entered viewport.
- **`spec_expanded`** — user opened technical detail accordion.
- **`faq_opened`** — user expanded an FAQ entry. Property:
  `question_id`.
- **`form_started`** — first field interaction. Property: `form_id`.
- **`form_submitted`** — submission. Property: `form_id`.
- **`email_subscribed`** — newsletter or list signup.
- **`nav_clicked`** — top-nav or footer link click. Property:
  `link_id`, `destination`.
- **`internal_link_clicked`** — in-content link click. Property:
  `link_text`, `destination`.

## Stage Progression Mapping

These are the events we treat as "progression signals" for funnel
analysis. Movement from one stage to the next is inferred when a
session emits the trigger event(s):

| From → To | Trigger events |
|---|---|
| `unaware` → `problem_aware` | `section_dwelled` on `problem`; `video_progress >= 25%` on problem-framing video |
| `problem_aware` → `solution_aware` | `section_dwelled` on `how_it_works`; `video_progress >= 50%`; `spec_expanded` |
| `solution_aware` → `brand_aware` | `section_scrolled_into_view` on `story`; `nav_clicked` to about; return visit within 7d |
| `brand_aware` → `considering` | `product_viewed` (any source); `pricing_viewed`; `compatibility_checked` |
| `considering` → `converting` | `product_added_to_cart`; `checkout_started` |
| `converting` → `outfitting` | `purchase_completed`; subsequent return visit |

These mappings are themselves hypotheses — refine as we see which
signals actually predict downstream behavior. (See [[hypotheses]]
H6 for the video-dwell example.)

## Implementation Notes

- **Where events live:** the storefront theme snippet sets up
  posthog-js + the custom event capture hooks. The Shopify Custom
  Pixel fires the cart/checkout events from the sandbox. Custom
  events from React components (admin) go through the same
  `posthog-js` instance.
- **Server-side events:** purchase enrichment is server-side via the
  `orders/create` webhook (see `linkOrderToAttribution` in
  `src/lib/analytics/order-attribution.ts`). The client pixel still
  fires `checkout_completed`/`purchase_completed` as the primary
  source; the server side adds confidence-rated link metadata.
- **Identification:** anonymous IDs at first touch (posthog-js
  default); `posthog.identify(email)` on `checkout_completed` from
  the pixel. Person merging happens automatically via
  `$anon_distinct_id` — see `specs/research/posthog-shopify-stitching.md`.
- **PII:** email is the identify key (PostHog stores it on the Person
  record). Don't pass raw emails or names as event properties.

## Open Questions

- Do we need a separate `experiment_id` property, or is
  `hypothesis_id` + `variant` enough?
- How do we attribute multi-session, cross-device journeys?
  PostHog's identity resolution covers some of this; the rest
  is a question for [[../invariants/attribution]].
- Should we capture scroll depth as a continuous percentage
  event, or only at section boundaries?

## Related

- [[personas]] — persona enum values used in `page_target_persona`
  and `persona_hint`.
- [[funnel]] — stage enum values used in `page_goal_stage` and
  `funnel_stage_inferred`.
- [[hypotheses]] — `hypothesis_id` values reference entries
  there.
- [[landing-page-goals]] — every page's `page_goal_stage` and
  `page_target_persona` are declared in that file.
