# Strategic Funnel — Next Iteration

> **Picking back up:** plan drafted 2026-05-26 at end of session. The
> `/funnel/strategy` page (commit `81e4079`, hotfix `fd5f5bd`) ships v1
> with honest gap markers. This plan covers the next pass — close the
> measurable gaps, then add the persona × channel cross-cut Tom
> sketched ("click a stage → see personas; click a persona → see
> stage"). PostHog client-side is the largest unblock but it's a
> multi-week project tracked separately in
> `posthog-integration.md`. Everything in this plan is independent
> of that.

## Context

The `/funnel/strategy` page (commit `81e4079`, hotfix `fd5f5bd`) is
live and renders:
- 6-stage acquisition funnel (Meta Ads + GA4 + Shopify proxies; gaps marked)
- 5-stage retention loop (full from `customer` + line items; advocate is a static count)
- Channel entry breakdown (first-touch UTM mapped to the channel taxonomy in `specs/strategy/funnel.md`)

V1 was scoped to "use what's already feeding the app, mark the gaps."
This iteration closes the cheapest measurable gaps and adds the
persona × channel cross-cut visualization Tom wants.

PostHog client-side instrumentation is the largest unblock but it's
a multi-week effort tracked in `posthog-integration.md`. Everything in
this plan ships independent of that work.

## Dependencies

- `/funnel/strategy` v1 shipped (commits `81e4079`, `fd5f5bd`).
- Data layer at `src/lib/funnel/strategy.ts` + pure logic at `src/lib/funnel/classify.ts` + tests at `src/lib/funnel/classify.test.ts` (26 tests).
- Existing extractions: Shopify, GA4, Google Ads, Meta Ads, PostHog daily rollups.
- Strategy framework: `specs/strategy/funnel.md`, `retention-loop.md`, `personas.md`, `hypotheses.md`.

## Scope

### Included
- Tier 1 quick wins (wholesale filter, Meta cold/retargeting split, GSC unblock if cheap)
- Klaviyo API integration (read side: schema, cron, dashboard widgets) — **scope moved to `klaviyo-integration.md`** (its Phase 0). Listed here because this iteration's measurement goals depend on that work.
- Judge.me API integration for live advocate tracking + vocabulary refresh
- Order sequence-position column (`order.order_sequence`) for clean acquisition-vs-retention discrimination at the order level
- Channel × persona cross-cut on `/funnel/strategy` (click-to-expand channel rows; persona filter at the top)

### Excluded — defer to other plans
- PostHog client-side storefront pixel — separate plan (`posthog-integration.md`)
- True persona × stage matrix — requires PostHog-based persona inference for upper-funnel visitors who haven't purchased; revisit when Phase 1+2 of `posthog-integration.md` lands
- Creator-program system Phases 1–6 — separate plan (`specs/strategy/creator-program.md`); a 360-decision conversation
- Multi-touch attribution math (utm_attribution table population) — requires PostHog Phase 2

## Implementation Phases

Phases are sequenced by ROI per hour of work. Each phase is
independently shippable; no phase blocks the next.

### Phase 1: Tier 1 quick wins — ✅ shipped 2026-05-27 (commit `067d6be`)

Sharpens the existing v1 page without new integrations.

- [x] **Wholesale / draft-order filter** on the strategy funnel queries. The strategy funnel is scoped to D2C per `funnel.md` — orders with `sourceName = 'shopify_draft_order'` excluded from `getAcquisitionFunnel`, `getRetentionLoop`, and `getChannelBreakdown`. `getRetentionLoop` and `getChannelBreakdown` also switched from the denormalized `customer.orderCount` / `customer.totalSpent` (drifty) to per-customer computed rollups from the order table.
- [x] **Meta campaign-name parsing**: `mapMetaCampaign(name)` pure helper in `src/lib/funnel/classify.ts`. `unaware` now uses cold-only impressions; `considering` uses retargeting impressions (confidence: weak — still a proxy, but better than the previous "missing" marker). 7 new unit tests.
- [ ] ~~**GSC auth unblock** via OAuth Playground workaround.~~ **Deferred 2026-05-27.** Not cheap — requires rewriting GSC auth from service account to OAuth tokens with refresh-token rotation plus user steps in OAuth Playground. 2-4h work, exceeds the half-day-total budget. Promote to its own work plan when ready.

#### Tests
- [x] Unit: `mapMetaCampaign` covers cold, retargeting, broad-keyword, ambiguous-name, and edge cases (case-insensitive, RT-word-boundary anti-false-match). 7 tests.
- [ ] Smoke: hit `/funnel/strategy` against dev DB and verify wholesale orders are excluded from counts. *(Tom — please verify after refresh.)*

### Phase 2: Channel × persona cross-cut (~1 day)

The visualization Tom sketched: click a channel row → see the persona
mix that came through it; persona filter at the top → entire page
filters to that persona's slice.

- [ ] Extend `getChannelBreakdown` to compute a per-channel persona-segment mix (using the existing `classifyRetentionStage` against each customer in that channel). Returns segments as a sub-array per channel row.
- [ ] Make channel rows in the table expandable (URL-based: `?expand=channelId`). Expanded row shows a small stacked bar / list of segment counts + percentages.
- [ ] Add persona filter pills at the top of the page (`?persona=outfitter`). Server-side filter that re-runs all three section queries narrowed to that persona's customers.
- [ ] Update `src/lib/funnel/strategy.ts` query helpers to accept an optional persona filter.
- [ ] Note in the "What's missing" card: upper-funnel cross-cut (e.g., persona mix at `unaware` / `problem_aware`) requires PostHog persona inference and is deferred.

#### Tests
- Unit: per-channel segment classifier produces expected percentages on a fixture.
- Smoke: filter pills + expand-row both work via URL params.

### Phase 3: Klaviyo API integration — moved out 2026-05-27

Scope grew beyond the read-only measurement piece originally planned
here (Tom wants write-side authoring too — campaigns and flows
deployed from this repo). The full integration now lives in
`specs/work-plans/todo/klaviyo-integration.md`. Its **Phase 0** is
the read-side work originally scoped here: same three tables, same
daily cron, same `/funnel/strategy` widgets. That phase is the
dependency for this iteration's measurement goals; the write-side
phases (1–5 there) are independent of this plan.

### Phase 4: Order position (acquisition vs retention) — ✅ shipped 2026-06-03

Unlocks acquisition-vs-retention split for any channel, not just Klaviyo.

**Design change vs. original plan:** computed at query time via
`ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY processed_at)`
instead of a stored `order.order_sequence` column. Two existing
denormalized fields (`customer.orderCount` and `customer.totalSpent`)
have drifted by ~10x from the live order table (per
[[personas]] Distribution); adding a third denormalized field would
inherit the same drift risk. Runtime computation is zero-drift,
needs no migration / sync code / backfill, and at current scale
(~1,500 orders) the window function is microseconds. If a stored
column becomes warranted (e.g., a hot query needing index-backed
"is first order" lookups), promote then on measured need.

- [x] Add `OrderPosition` type ('acquisition' | 'retention') to `src/lib/funnel/classify.ts`
- [x] Extend `CustomerOrderRollup` with optional `displayedOrders` + `displayedSpentCents` overrides — lifetime metrics stay used for retention-stage classification; displayed metrics use the filtered subset
- [x] Update `aggregateChannelsFromCustomers` to read displayed overrides when present
- [x] Extend `getChannelBreakdown` with optional `positionFilter` — runs a third query (CTE with ROW_NUMBER window) when set, populates display overrides; drops customers with no matching orders so the customer count stays accurate per slice
- [x] Add 3-way pill toggle on `/funnel/strategy` (All orders / First order / Repeat orders), URL param `?position=…`
- [x] Removes the "Order sequence-position" entry from the page's "What's missing" backlog card

#### Tests
- [x] Unit: classification continues to use lifetime metrics when display overrides are present (an outfitter shown via first-order view doesn't get mis-classified as first_buyer)
- [x] Unit: displayed orders + revenue reflect the override values
- [x] Unit: avgLtv computes against displayed spend
- [x] Unit: behavior is unchanged when no overrides provided
- [x] Unit: position filter combines correctly with segmentFilter (5 new tests, 468 total passing)

### Phase 5: Judge.me API integration — ✅ shipped 2026-06-03

Live advocate count + vocabulary refresh pipeline.

- [x] Add schema: `review` table (`id`, `external_id`, `source`, `reviewer_email`, `reviewer_name`, `rating`, `title`, `body`, `verified`, `product_id`, `product_handle`, `location`, `review_date`, `captured_at`, `updated_at`). Unique index on `(source, external_id)`; indexes on `reviewer_email`, `rating`, `review_date`. Migration `0048_light_zemo.sql`.
- [x] Add env: `JUDGEME_API_TOKEN` + `JUDGEME_SHOP_DOMAIN` to `.env.example`. Vercel-prod additions deferred until Tom can paste the token (Judge.me/Shopify outage was in flight at ship time).
- [x] Create `src/lib/judgeme/client.ts` — paginated `fetchAllReviews()` async generator + pure `normalizeReview()` mapper.
- [x] Create `src/lib/judgeme/extract.ts` — orchestrates the upsert on `(source, external_id)` so re-runs are idempotent and review edits sync forward.
- [x] Create `/api/cron/extract-judgeme/route.ts`; register cron in `vercel.json` at daily 07:45 UTC.
- [x] Update `getRetentionLoop` — replaces `STATIC_ADVOCATE_COUNT = 9` with a `selectDistinct` over `review.reviewer_email`, joined in-memory to outfitter-classified customers by lowercased email. Source label, confidence, and "What's missing" notes updated to reflect the live query.
- [x] Confidence promotes from `weak` to `strong` once review data is present; falls back to `weak` + a how-to-fix note when the table is empty (Judge.me outage / pre-key state).
- [ ] **Deferred:** vocabulary-refresh script that re-runs the distinctive-word analysis from `specs/strategy/vocabulary-map.md` weekly and surfaces drift. Real follow-up; cheap; doable when there's energy.
- [x] Update `specs/current/integrations.md`, `scheduled-jobs.md`, `schema.md`.

#### Tests
- [x] Unit: 11 `normalizeReview` tests covering string vs numeric ratings, truthy/falsy verified, case-insensitive emails, malformed dates, whitespace trimming, and null reviewer objects. 504 tests total passing.
- [ ] Integration: cron populates `review` table; advocate count > 0. Deferred until Judge.me API is reachable + key is in Vercel prod env — both currently blocked.

## Notes

### Open questions

- **Should Meta retargeting impressions land in `unaware` or `considering`?** Strictly speaking, retargeted users are at minimum `brand_aware`. The Phase 1 split moves them out of `unaware`; the question is whether they fit `considering` (closer to checkout) or `brand_aware` (still considering). Defer the precise placement until we see the numbers.
- **GSC OAuth Playground workaround durability** — if the workaround turns out to be brittle (needs reauth weekly), reframe as a real engineering project rather than a quick win.
- **Order sequence under refunds / cancellations** — does a refunded order count toward sequence? Probably yes (it happened), but flag for review when implementing.

### Risks

- **Phase 2 (cross-cut) UX** — server-side filter via URL params is fine for v1 but every click is a full re-render. If it gets sluggish (~30+ customers in any channel × persona cell), refactor to client-side filtering.
- **Phase 5 advocate count vs. reality** — the static `9` may be over- or under-counting. Live query will reveal the truth; be prepared for the number to move significantly when the live count lands.

### Alternatives considered

- **Build true persona × stage matrix now** — rejected: would be empty in upper-funnel rows without PostHog persona inference. Channel × persona is more valuable today and fits the same "click → see" UX.
- **Skip Klaviyo, just heuristic UTM forever** — rejected: heuristic mis-classifies welcome vs. post-purchase Klaviyo (we already saw H12 conflate them); live data from the source is much cleaner.
- **Add Shopify Pixel for `checkout_started` instead of waiting for PostHog Phase 1** — viable but a sub-case of PostHog Phase 1 work; cleaner to do once in PostHog Phase 1 than twice.

### Phased rollout strategy

- Phases 1 + 2 are pure dashboard improvements — ship together if same day.
- Phase 3 moved to `klaviyo-integration.md`. This iteration consumes its Phase 0 (read side) but doesn't block on the write-side phases.
- Phase 4 touches the Shopify sync — coordinate with Greg to avoid stomping on in-flight sync changes.
- Phase 5 adds another external integration; ships independently.

### Where this lives

- This file: `specs/work-plans/todo/funnel-strategy-next-iteration.md`
- Linked from `specs/ops/PRIORITIES.md` (active workstream)
- Move to `specs/work-plans/completed/` when all phases ship and add an entry to `specs/ops/releases.yaml`
