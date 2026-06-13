# Session: retention-led marketing recalibration (2026-06-06 → 2026-06-09)

> **Purpose of this doc.** A multi-day session covered substantial
> strategic reasoning that produced four committed changes
> ([[bundle-strategy]], [[in-box-card-strategy]], [[../ops/domains/costs]]
> COGS update, and 360-campaign W1 §2 / §4 / W5 edits), but the *why*
> behind the decisions and the open follow-ups risk getting lost. This
> doc captures the deliberation, the decisions, and the in-flight
> follow-ups so the next contributor (Tom, Oliver, Greg, or a future
> Claude session) has full context without re-reading the chat log.
>
> Specifically motivated by a prior session that performed a bundle
> analysis Tom asked to commit; the commit step was dropped silently
> and the reasoning was lost. This doc + the
> [[../../../../.claude/projects/-Users-tomsimson-code-Fitwell/memory/feedback_commit_verification|commit-verification feedback memory]]
> guard against that failure mode recurring.

## What triggered this session

Tom returned to a working session after substantial work had landed on
the marketing/instrumentation front and asked to evaluate the marketing
plan in light of the new information. Recent shipped:

- **Grapevine Phases 1–3** — survey ingestion, 180-day backfill, self-
  report attribution with `link_method='self_report'` outranking pixel
  and email-match.
- **360 campaign Workstream 4.5 (organic social)** — added with the
  "compass not contract" cadence philosophy and validated baseline
  pattern.
- **PostHog Phases 0–6 code-complete** (awaiting Shopify theme
  redeploy + data accumulation).
- **Klaviyo Phases 1–3** shipped: MJML template pipeline, campaign
  drafts from repo, flow API spike findings.

The session's job was to integrate this new state, identify what the
data tells us we should do next, and resequence the active workstreams.

## What the data says (resolved during this session)

### Grapevine survey reveals true intro mix

30-day baseline, 33% response rate:

- **Meta-family (IG + FB + TikTok) ≈ 58% of self-reported intros.**
- **Google as introducer only ~7.55%** — much smaller than its share
  of converting traffic. Google is the *closer*, not the introducer.
  "Post-creator branded search" compound path validated directionally.
- **WatchChris ≈ 7.55%** of intros — single largest creator-driven
  introduction.

### Persona Distribution + bundle analysis reveal where the leak is

Per [[../personas]] Distribution + `scripts/persona-segments.ts` +
`scripts/bundle-strategy-analysis.ts`:

- **824 D2C customers / 996 orders / $61,307 revenue** over the Nov 2025
  → May 2026 window. Mature-cohort LTV $76.50.
- **65.9% Single Buyer at $47 LTV vs 5.7% Outfitter at $242 LTV** — 5×
  LTV delta. The structural retention leak.
- **Klaviyo welcome flow: +27.6% LTV lift** ($92 vs $72), driven by
  order size not repeat frequency.
- **Post-purchase Klaviyo motion: $551 across 5 orders in 7 months** —
  effectively zero retention motion in flight today.
- **88.4% of orders are 1–2 units; 5+ unit orders are 0.4%** (three in
  seven months). Demand curve does not support a public bundle SKU above
  2 units.
- **Repeat rate ≈ 7–8% flat across first-order size.** Repeat buyers
  don't bulk up — they place more small orders. Outfit-the-collection
  is structurally a multi-order email-driven motion, not a single-order
  bundle motion.

### Attribution gap (filed separately)

While building Grapevine Phase 3 the team discovered only **5.4% of
orders have `link_method` stamped** (40 of 734) even though 1,249 UTM
rows are marked `converted=true`. The UTM linker is firing on ~3% of
what it should. Filed at [[../../work-plans/completed/utm-linking-gap]].

### COGS confirmed (2026-06-06)

Per [[../../ops/domains/costs]]:

- M1 Stainless Steel + M4 Universal Link: **$3.65/unit**
- M1 Titanium: **$4.50/unit**
- **Blended gross margin ≈ 91%** at $40 retail.

This was the load-bearing input that flipped the in-box card economics
during the session (see Lesson 3 below).

## Decisions made

### 1. Strategic lean — retention-led, organic top-of-funnel continues

- Engineering bandwidth focuses on the post-purchase Klaviyo retention
  motion + adjacent attribution work.
- Workstream 4.5 organic social continues on Tom's compass-not-contract
  cadence — validated by a concrete data point: Tom's M4 organic post on
  **2026-06-03 → 6 next-day M4 orders.**
- Paid channels (W6) wait until the retention motion lands; ~6–8 weeks
  from now, not 3.
- Reframes the 2026-05-25 "instrument-first" thesis: instrumentation is
  now sufficient; the data identifies the leak (retention, not first-
  touch CVR), so we ship the fix.

### 2. Bundle — declined (no public bundle SKU)

Captured in [[../bundle-strategy]] (commit `fb685a0`). The 360 W1 §2
$40 / $92 / $134 ladder cut. Outfit-the-collection move lives in W5 D30
as an email-delivered code, not a SKU.

Tom's framing: *"I don't want to put a bundle on the website. I'd rather
we recognize that most people are just buying one to test it out, and
then we need to get them to test it and like it and buy it more."*

### 3. In-box card — declined on brand-posture grounds

Captured in [[../in-box-card-strategy]] (commit `0db05c6`). The 360 W1
§4 card was originally $29-for-next-buckle / 30-day-expiry with D7 + D25
reminder emails.

**The corrected math (91% margin) actually supports printing** — break-
even is 5 pp lift over 7% baseline, which is industry-typical. But the
decision was declined on three brand-posture grounds:

1. 85% of natural repeats fire within 30 days — meaning the product
   earns its own repeat behavior. Card would subsidize demand already
   converting (76.5% of in-window repeaters pay full retail).
2. Stacking welcome-flow (15% off) + card ($11 off) + D7 + D25 reminders
   + D30 outfit code (25% off 5+) = 3–4 discount touchpoints in 30 days.
   Too much discount cadence for premium-precision $40 positioning.
3. Post-purchase posture should be product-experience-led, not discount-
   led. Push the one discount at D30 when leverage is highest.

### 4. Post-purchase Klaviyo flow shape — 4 emails

| Day | Email | Job |
|---|---|---|
| D1 | Install guide + tips | Product experience |
| D14 | "How many watches do you own?" | Intel + engagement; no longer gates anything |
| D21 | Judge.me review request | Social proof / advocacy |
| D30 | Outfit-the-collection code (25% off 5+, 30-day expiry) | The single discount touchpoint, goes to everyone |

D7 and D25 dropped (they were card reminders; card cut).

The D14 reply ladder originally gated D30 content (3+ watches → outfit;
1–2 → single reorder). Tom reversed this during the session: replies
don't gate D30. Everyone reaching D30 gets the outfit code; the D14
replies remain useful as intel only.

### 5. Klaviyo Phase 4 — Greg signed off

Greg signed off on the Phase 4 architecture (managed-flows allowlist,
PATCH-content-only deploy safety model). Next step is Tom creating the
flow skeleton in Klaviyo UI; then Claude pulls as YAML and writes
content per the workflow in
[[../../work-plans/todo/klaviyo-integration]].

### 6. Discount code naming

When pulling discount code names from Shopify (see follow-up #3 below):

- **Bucket all Judge.me review codes together** (each reviewer gets a
  unique code, but for our analysis they're one bucket = "review-leaver
  code").
- **Keep creator codes separate per-creator** (`watchbros15`,
  `watchchris20`, etc.) — the whole point is knowing which creator
  drove which revenue. Tag them with a "creator" family for rollups.

### 7. Greg's queue order (after Klaviyo Phase 4 unblock)

1. **UTM linking gap** — root-cause why only 5.4% of orders get
   `link_method` stamped + backfill the 1,209 converted-but-unlinked
   rows. Highest leverage given retention is the lead — without it the
   retention motion's channel attribution is unmeasurable.
2. **PostHog theme redeploy** — two paste actions in Shopify Admin.
   Lets client-side funnel data accumulate before retention results
   land.
3. **Shopify scope deploy + Feb-2024 history import** — lowest urgency
   for retention thread; nice-to-have for the LTV-back-to-launch view.

### 8. Creator program (Decision #7 in 360-campaign.md)

Existing manual / spreadsheet cadence continues until Tom returns from
Geneva. **Engineering compress (Phases 1+2+4+5 of
[[../creator-program]]) starts ~2026-06-21.** Don't let perfect be the
enemy of good.

## New workstreams proposed (not yet added to 360-campaign.md)

### Acquisition-side email signup lift — proposed as 360 W5 §6

Surfaced in [[../bundle-strategy]] §"Add a new workstream — acquisition-
side email signup lift."

The case: **67.5% of first orders pay no welcome-flow discount → mostly
not on the email list.** Per the bundle analysis Cut 6, that's ~450 of
670 D2C window orders — every one a missed downstream retention
opportunity worth multiples of the at-cart discount we'd otherwise give
them. The welcome flow's +27.6% LTV lift is concentrated in the 32.5%
who use it; lifting list-signup rate compounds with the post-purchase
flow.

Engineering dependencies:
- Discount-code-name visibility (see follow-up #3) — unlocks the C1
  measurement (creator-code share of the 15–20% band).
- PostHog client-side funnel data — measurement gate; W6 in flight.

Interventions to test (none bundle-shaped):
- Replace email-for-discount popup with trust-frame (guarantee badge +
  "first to know about new finishes" framing).
- Post-add-to-cart capture (ask after commitment, not before).
- Gift-friendly checkout option (code to recipient or buyer's inbox).
- Creator-code attribution sub-flow (buyers using `watchbros15` enter
  a Watch Bros-themed nurture).

**To be added to 360-campaign.md W5 §6 as part of follow-up #1.**

## In-flight follow-ups (open after this session)

| # | Item | Owner | State |
|---|---|---:|---|
| 1 | Add signup-lift workstream to 360-campaign.md W5 §6 | Claude | ✅ Done 2026-06-10 — W5 §6 added; W1 §2(b) pointer + stale D14-gating text in §2(c) fixed |
| 2 | Update [[../../ops/PRIORITIES]] with retention-led sequence + Greg's queue order + new dates | Claude | ✅ Done 2026-06-10 — strategic focus rewritten, Greg's queue folded in, workstream 10 added, resolved unknowns marked |
| 3 | Scope discount-code-name visibility (Shopify GraphQL pull, ~½ day) | Claude + Greg signoff | ✅ Code-complete 2026-06-10 (Greg signed off) → [[../../work-plans/completed/discount-code-visibility]]. No GraphQL needed — payloads already carried `discount_codes`. First C1 read: 71.8% of first orders no-code. Prod deploy pending (Phase 4) |
| 4 | Tom creates Klaviyo Phase 4 post-purchase flow skeleton in Klaviyo UI | Tom (~15–20 min) | Pending |
| 5 | Claude pulls Klaviyo YAML + writes D1 / D14 / D21 / D30 email content | Claude (~2–3 hrs) | Blocked on #4 |
| 6 | Klaviyo D30 outfit code — generate in Shopify (25% off any 5+, 30-day expiry, single-use or shared code, name TBD) | Tom or Claude (~10 min) | Pending; choose shared vs single-use mechanic |

## Operational FYIs

- ~~**M4 size bundle is oversold** in Shopify catalog~~ — old news per
  Tom (2026-06-10); no bearing on the retention work. Don't resurface.
- **`scripts/inspect-bundles.ts`** is an untracked one-off from earlier
  in this session (mid-conversation product catalog check). Bundle
  analysis script (`scripts/bundle-strategy-analysis.ts`, committed in
  `fb685a0`) supersedes it. Delete when convenient.

## Lessons captured (process-level)

### 1. Verify commit SHAs before saying "done"

A prior session ran a bundle analysis Tom asked to commit. The commit
step was dropped silently; the analysis was lost; we had to rebuild it
in this session (parallel-instance work in `fb685a0`). To prevent
recurrence:

- After every `git commit`, run `git log -1 --oneline` immediately and
  surface the SHA in the reply to the user.
- Don't say "committed" or "done" until the SHA is shown.

Now codified as a feedback memory:
[`feedback_commit_verification.md`](/Users/tomsimson/.claude/projects/-Users-tomsimson-code-Fitwell/memory/feedback_commit_verification.md).

### 2. Don't assume key business inputs — ask

The in-box card analysis was initially run with a 60% gross-margin
placeholder. That placeholder produced a "card doesn't pencil"
recommendation that flipped when Tom shared the actual COGS ($3.65 /
unit, ~91% margin). The decision still landed on "decline card" but
for brand-posture reasons, not economics — a meaningfully different
framing.

Lesson: when running any business-economics analysis that depends on
margin / cost / CAC / LTV inputs, **ask Tom for the actual numbers
before using a placeholder**, OR run the placeholder analysis with
explicit sensitivity to the unknown, OR (best) check if the data
already lives in the repo (here it didn't — costs.md placeholders only).

### 3. When stacking sub-questions, prefer plain-language summary over multi-choice

Mid-session Tom pushed back on a 3-option `AskUserQuestion` block with
*"I don't quite understand all of this. dumb it down slightly. there's
a lot going on here."* Format guidance: when the strategic context is
dense, lead with a 2-3 sentence plain-language framing and ask 1-2
direct questions, instead of multi-select option grids. Save the option
grids for genuine A/B/C choices with clear tradeoffs.

### 4. Surface my own framing errors openly

During the in-box card reversal, I had to acknowledge that my initial
recommendation was wrong because the margin assumption was wrong. Doing
so openly (instead of quietly updating the recommendation) gave Tom the
context to weigh whether the *new* recommendation was also wrong for
similar reasons. Worth modeling: when a key input changes a previously-
stated recommendation, name the framing error explicitly.

## Related artifacts

Committed during this session window:

- **`fb685a0`** Bundle strategy: evaluate the 360 W1 §2 ladder,
  decline, redirect to retention
- **`6c93743`** COGS: confirm per-unit costs for M1 / M4 (≈91% gross
  margin)
- **`0db05c6`** In-box card: evaluated, declined on brand-posture
  grounds

Spec docs:

- [[../bundle-strategy]]
- [[../in-box-card-strategy]]
- [[../../ops/domains/costs]]

Scripts:

- `scripts/bundle-strategy-analysis.ts`
- `scripts/in-box-card-analysis.ts`

Strategy framework (durable layer that this session updated):

- [[../360-campaign]] — Workstreams 1 §2, 1 §4, and 5 edited
- [[../personas]] — Distribution section is the load-bearing input
- [[../funnel]] / [[../retention-loop]] / [[../hypotheses]] — unaffected

Work plans referenced:

- [[../../work-plans/todo/klaviyo-integration]] — Phase 4 ready to
  start
- [[../../work-plans/completed/utm-linking-gap]] — Greg's queue #1
- [[../../work-plans/todo/posthog-integration]] — theme redeploy
  pending Greg
- [[../creator-program]] — engineering compress ~2026-06-21
