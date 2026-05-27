# PostHog Event Taxonomy

Last updated: 2026-05-25

> **Status: starter draft.** Establishes naming conventions and the
> initial event registry. Instrumentation is forthcoming — this doc
> exists to fix the vocabulary *before* events get coded so we don't
> accumulate inconsistent names.

## Why a Taxonomy

PostHog events are useless if they're inconsistently named. We can't
ask "did this page move visitors from `problem_aware` to
`solution_aware`?" if some pages emit `solution_clicked`, others emit
`btn_click_solution`, and a third emits `clicked-solution`. Pick
one shape and stick to it.

This file is the source of truth for event names and the properties
attached to them.

## Naming Conventions

### Event names
- **`snake_case`** — lowercase, words separated by underscores.
- **Format:** `<surface>_<action>_<object>` where applicable.
- **Surfaces:** `page`, `section`, `video`, `cta`, `form`, `cart`,
  `checkout`, `email`, `nav`.
- **Examples:**
  - `page_viewed`
  - `video_played`
  - `cta_clicked`
  - `section_scrolled_into_view`
  - `cart_item_added`
  - `checkout_started`

### Don't
- Don't include the page name in the event name. Pass it as a
  property instead. `page_viewed` with `{page: "home"}`, not
  `home_page_viewed`.
- Don't create one-off events for one-off pages. Reuse the event,
  vary the properties.
- Don't synonym-drift. `cta_clicked` and `button_clicked` should
  not both exist.

## Required Properties

Every event carries these properties so we can later cohort by
persona × stage:

| Property | Type | Required | Description |
|---|---|---|---|
| `page` | string | yes | Canonical page slug (e.g. `home`, `pdp-classic`) |
| `page_goal_stage` | enum | yes for marketing pages | Target funnel stage the page is built to advance ([[funnel]]) |
| `page_target_persona` | enum | yes for marketing pages | Target persona ([[personas]]: `P1_collector`, `P2_casual`, etc.) or `mixed` |
| `funnel_stage_inferred` | enum | yes | Best guess at visitor's current stage based on entry signals |
| `persona_hint` | enum | optional | Best guess at visitor's persona, when distinguishable |
| `hypothesis_id` | string | optional | If this page/variant is testing a specific hypothesis (e.g. `H4`) |
| `variant` | string | optional | A/B test variant identifier |
| `referrer_source` | enum | yes | `direct`, `organic`, `google_ads`, `meta_ads`, `email`, `social`, `referral`, `other` |
| `utm_campaign` | string | optional | UTM passthrough |

`page_goal_stage` and `page_target_persona` are the heart of the
persona × funnel framework — they declare what the page is *for*,
which lets us measure whether each page is actually doing its job.

## Event Registry

### Page lifecycle
- **`page_viewed`** — fired on every page load.
- **`page_left`** — fired on page unload, includes `time_on_page_s`.

### Engagement
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

### Intent
- **`cta_clicked`** — any primary call-to-action. Properties:
  `cta_id`, `cta_label`, `destination`.
- **`compatibility_checked`** — user used a fit/compatibility
  tool. Properties: `watch_model`, `result`.
- **`pricing_viewed`** — pricing element entered viewport.
- **`spec_expanded`** — user opened technical detail accordion.
- **`faq_opened`** — user expanded an FAQ entry. Property:
  `question_id`.

### Cart and checkout
- **`product_viewed`** — PDP loaded. Property: `product_id`.
- **`variant_selected`** — variant chosen on PDP. Properties:
  `product_id`, `variant_id`.
- **`cart_item_added`** — add-to-cart. Properties: `product_id`,
  `variant_id`, `quantity`, `price_cents`.
- **`cart_item_removed`** — removed from cart.
- **`cart_viewed`** — cart page or drawer opened.
- **`checkout_started`** — proceeded to checkout. (Note: Shopify
  owns the rest of checkout; we may need server-side webhooks to
  close the loop on `checkout_completed`.)

### Forms and email
- **`form_started`** — first field interaction. Property:
  `form_id`.
- **`form_submitted`** — submission. Property: `form_id`.
- **`email_subscribed`** — newsletter or list signup.

### Navigation
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
| `brand_aware` → `considering` | `product_viewed`; `pricing_viewed`; `compatibility_checked` |
| `considering` → `converting` | `cart_item_added`; `checkout_started` |
| `converting` → `outfitting` | `checkout_completed` (server-side); subsequent return visit |

These mappings are themselves hypotheses — refine as we see which
signals actually predict downstream behavior. (See [[hypotheses]]
H6 for the video-dwell example.)

## Implementation Notes

- **Where events live:** thin wrapper around PostHog's `capture()`
  in a shared client module. Don't call PostHog directly from
  components — go through the wrapper so required properties are
  enforced.
- **Server-side events:** purchase/checkout completion must be
  captured server-side from Shopify webhooks, not client-side.
  Client-side checkout completion is unreliable.
- **Identification:** anonymous IDs at first touch; identify on
  email capture, account creation, or checkout. Persist across
  sessions.
- **PII:** never send raw email or name as a property. PostHog
  identify call only.

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
