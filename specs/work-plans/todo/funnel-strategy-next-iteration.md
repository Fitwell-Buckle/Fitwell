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
- Klaviyo API integration (schema, cron, dashboard widgets) for live email-side measurement
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

### Phase 3: Klaviyo API integration (~1–2 days)

Live email-side measurement that resolves the H12 acquisition-vs-retention split from inside the email tool, not via UTM heuristics.

- [ ] Add schema:
  - `klaviyo_list_growth_daily` — date, subscribers, new_subscribers, unsubscribes
  - `klaviyo_email_performance` — campaign_id, sent_at, sends, opens, clicks, conversions, revenue_cents
  - `klaviyo_flow_attribution` — flow_id, customer_id, order_id, attributed_revenue_cents, touched_at
- [ ] Add env: `KLAVIYO_API_KEY` to `.env.example` and Vercel
- [ ] Create `src/lib/analytics/klaviyo.ts` client wrapping the Klaviyo API
- [ ] Create `/api/cron/extract-klaviyo/route.ts` — daily sync to populate the three tables
- [ ] Register cron in `vercel.json` (daily, ~07:30 UTC after other extractions)
- [ ] Add Klaviyo widgets to `/funnel/strategy`:
  - List growth sparkline near the top
  - Per-flow attribution as a row in the channel breakdown (replacing the UTM-heuristic split)
  - Welcome-flow vs. post-purchase split as a small visualization in the retention-loop section
- [ ] Update `specs/current/integrations.md` with Klaviyo integration details
- [ ] Update `specs/current/scheduled-jobs.md` with the new cron

#### Tests
- Unit: Klaviyo API response → schema mapping
- Integration: cron run populates the daily tables (against test API key if available, else mock)

### Phase 4: Order sequence-position column (~half day)

Unlocks acquisition-vs-retention split for any channel, not just Klaviyo.

- [ ] Add `order.orderSequence` integer column (1, 2, 3… per customer chronologically)
- [ ] Generate + apply migration
- [ ] Update Shopify sync (`src/lib/shopify/sync.ts` or wherever order upsert happens) to compute and write this on insert/update — `MAX(order_sequence) + 1` for that customer, or recompute on update
- [ ] Backfill script `scripts/backfill-order-sequence.ts` for existing orders
- [ ] Add a "First order vs. repeat order" toggle to `/funnel/strategy` channel breakdown — splits each channel's revenue between acquisition-position (sequence = 1) and retention-position (sequence > 1)
- [ ] Update `specs/current/schema.md`

#### Tests
- Unit: sequence computation handles concurrent inserts (idempotent — same customer, two orders processed → sequences 1 and 2 not 1 and 1)
- Integration: backfill against a fixture customer with multiple orders

### Phase 5: Judge.me API integration (~1 day)

Live advocate count + vocabulary refresh pipeline.

- [ ] Add schema:
  - `review` — id, reviewer_email, rating, title, body, review_date, product_handle, location, source ('judgeme'|'other'), captured_at
- [ ] Add env: `JUDGEME_API_TOKEN` to `.env.example` and Vercel
- [ ] Create `src/lib/analytics/judgeme.ts` client
- [ ] Create `/api/cron/extract-judgeme/route.ts` — daily sync
- [ ] Register cron in `vercel.json`
- [ ] Update `getRetentionLoop` to replace the `STATIC_ADVOCATE_COUNT = 9` constant with a live query joining `review.reviewer_email = customer.email` and counting outfitter-classified customers
- [ ] Promote the advocate stage from `confidence: 'weak'` to `confidence: 'strong'` once the live query is in place
- [ ] Optional: vocabulary-refresh script that re-runs the distinctive-word analysis from `specs/strategy/vocabulary-map.md` weekly and surfaces drift
- [ ] Update `specs/current/integrations.md`, `scheduled-jobs.md`, `schema.md`

#### Tests
- Unit: review-to-customer match logic (email exact match; later add fuzzy/name match)
- Integration: cron populates `review` table; advocate count > 0

## Notes

### Open questions

- **Should Meta retargeting impressions land in `unaware` or `considering`?** Strictly speaking, retargeted users are at minimum `brand_aware`. The Phase 1 split moves them out of `unaware`; the question is whether they fit `considering` (closer to checkout) or `brand_aware` (still considering). Defer the precise placement until we see the numbers.
- **GSC OAuth Playground workaround durability** — if the workaround turns out to be brittle (needs reauth weekly), reframe as a real engineering project rather than a quick win.
- **Klaviyo "flow" granularity** — Klaviyo flows have steps; do we attribute per-flow or per-step? Per-flow is simpler; per-step is more honest about which email drove the order. Decide during Phase 3.
- **Order sequence under refunds / cancellations** — does a refunded order count toward sequence? Probably yes (it happened), but flag for review when implementing.

### Risks

- **Klaviyo API rate limits** — daily syncs should be fine, but if we add real-time webhook ingestion later (e.g., for live email-open dashboards), need to plan around the limit.
- **Phase 2 (cross-cut) UX** — server-side filter via URL params is fine for v1 but every click is a full re-render. If it gets sluggish (~30+ customers in any channel × persona cell), refactor to client-side filtering.
- **Phase 5 advocate count vs. reality** — the static `9` may be over- or under-counting. Live query will reveal the truth; be prepared for the number to move significantly when the live count lands.

### Alternatives considered

- **Build true persona × stage matrix now** — rejected: would be empty in upper-funnel rows without PostHog persona inference. Channel × persona is more valuable today and fits the same "click → see" UX.
- **Skip Klaviyo, just heuristic UTM forever** — rejected: heuristic mis-classifies welcome vs. post-purchase Klaviyo (we already saw H12 conflate them); live data from the source is much cleaner.
- **Add Shopify Pixel for `checkout_started` instead of waiting for PostHog Phase 1** — viable but a sub-case of PostHog Phase 1 work; cleaner to do once in PostHog Phase 1 than twice.

### Phased rollout strategy

- Phases 1 + 2 are pure dashboard improvements — ship together if same day.
- Phase 3 adds a new external integration; ships independently.
- Phase 4 touches the Shopify sync — coordinate with Greg to avoid stomping on in-flight sync changes.
- Phase 5 adds another external integration; ships independently.

### Where this lives

- This file: `specs/work-plans/todo/funnel-strategy-next-iteration.md`
- Linked from `specs/ops/PRIORITIES.md` (active workstream)
- Move to `specs/work-plans/completed/` when all phases ship and add an entry to `specs/ops/releases.yaml`
