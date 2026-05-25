# Hypotheses Register

Last updated: 2026-05-25

> **Status: starter draft.** Captures the implicit beliefs surfacing
> in the strategy conversation. Each is a testable claim, not a
> validated fact. Promote/demote as evidence accumulates.

## Purpose

Turn marketing intuition into traceable, testable claims. Each entry
states what we believe, how confident we are, what would
validate/invalidate it, the cost to test, and which artifact (if any)
is currently testing it.

This lets us:
- Decide where variation testing is worth the spend.
- Avoid re-litigating settled questions.
- See which assumptions are load-bearing before we double down on them.
- Distinguish "we know this" from "we think this."

## Entry Format

```
### H<N> — <short name>
**Claim:** <one-sentence belief>
**Confidence:** low | medium | high
**Why we believe it:** <reasoning or source>
**What would validate:** <specific observable outcome>
**What would invalidate:** <specific counter-outcome>
**Estimated test cost:** $ / time / effort
**Test approach:** <campaign, page variant, analytics query, customer interview, etc.>
**Status:** open | testing | validated | invalidated | parked
**Related:** [[landing-page-goals]] page X, campaign Y, [[personas]] P1
```

## Rules

- Promote a hypothesis to "validated" only with explicit evidence,
  not vibes. Cite the data.
- If a hypothesis is foundational to a planned campaign, test it
  before spending heavily on the campaign.
- When two hypotheses contradict, surface the conflict explicitly.
- Don't delete invalidated hypotheses — they're valuable record of
  what didn't work and why.

---

## Current Hypotheses

### H1 — Watch buckles are primarily an awareness game
**Claim:** Most of our addressable market is `unaware` or
`problem_aware`. Growth comes from expanding awareness, not from
out-competing other micro-adjust products in search.

**Confidence:** medium

**Why we believe it:** Micro-adjust buckles are a niche product
category. Search volume for category terms is small relative to
the population of watch owners who would benefit. Conversation with
Greg/Tom/Oliver framed this explicitly as the working hypothesis.

**What would validate:** Awareness-stage ads (problem-naming
creative) produce meaningfully better cost-per-acquisition than
intent-stage ads (solution/brand search) at scale.

**What would invalidate:** Search-driven traffic (already
`solution_aware`) consistently outperforms awareness traffic on
both cost-per-conversion and LTV.

**Estimated test cost:** Significant — requires running both
awareness-focused and intent-focused campaigns long enough for
statistical significance. Budget is the binding constraint.

**Test approach:** Parallel campaigns; PostHog cohort comparison
by entry funnel stage; LTV tracking by acquisition channel.

**Status:** open

**Related:** [[personas]] P2, all awareness-stage landing pages.

---

### H2 — Collectors are a minority of traffic but majority of revenue
**Claim:** P1 Collectors represent ~10–20% of inbound traffic but
~40–60% of revenue, primarily through outfitting behavior
(multiple buckles per customer).

**Confidence:** low (estimate only; no validation)

**Why we believe it:** Anecdotal — Greg's framing of "true
enthusiasts spend a ton and don't care about price." Standard
enthusiast-category dynamics.

**What would validate:** Shopify customer segmentation shows
multi-buckle orders concentrated in customers identifiable as P1
via traffic source, session behavior, or post-purchase signals;
revenue-per-customer skewed to top decile.

**What would invalidate:** Revenue is roughly proportional to
traffic share across personas, or P2 outperforms P1 on LTV
through long-tail repeat purchases.

**Estimated test cost:** Low — analytics query against existing
data once persona identification is in place.

**Test approach:** Cohort analysis post-PostHog instrumentation.

**Status:** open (gated on persona identification logic)

**Related:** [[personas]] P1.

---

### H3 — Multi-watch owners outfit their collection
**Claim:** A meaningful share of first-time buyers return to buy
additional buckles within N months as they realize the value and
apply it to other watches in their collection.

**Confidence:** low

**Why we believe it:** Logical from the product — if Fitwell
solves the comfort problem on one watch, the same person likely
wants it on their other watches.

**What would validate:** Repeat purchase rate within 90/180/365
days is meaningfully above industry baseline for accessories;
average orders per customer trends upward over time.

**What would invalidate:** Customers buy once and don't return,
or repeat purchases are dominated by replacement rather than
collection expansion.

**Estimated test cost:** Low — existing Shopify data analysis,
plus minor PostHog event tagging for return visits.

**Test approach:** Cohort retention analysis from Shopify order
data.

**Status:** open

**Related:** [[funnel]] `outfitting` stage, [[personas]] P1.

---

### H4 — Direct-search traffic should shortcut to checkout
**Claim:** Visitors who arrive via brand search (e.g., "fitwell
buckle") are far enough down the funnel that the optimal landing
experience is product/checkout, not story/education.

**Confidence:** medium

**Why we believe it:** Standard funnel logic — search-driven
brand traffic has high intent. Greg flagged this explicitly:
"you want to put them straight to checkout if you can't farther
down the funnel."

**What would validate:** Branded-search landing variants that
go directly to product/cart convert at meaningfully higher rates
than variants that route through the homepage or story.

**What would invalidate:** Branded-search visitors who see the
homepage/story first convert at equivalent or higher rates,
suggesting the story still adds trust.

**Estimated test cost:** Medium — requires running landing
variants long enough for significance. Branded search volume is
the limiting factor.

**Test approach:** Google Ads landing page variants for branded
keywords; PostHog funnel comparison.

**Status:** open

**Related:** [[funnel]] `brand_aware`/`considering`,
[[landing-page-goals]] homepage and PDP variants.

---

### H5 — Awareness pages outperform comparison pages for problem-unaware traffic
**Claim:** When the audience is `unaware` or `problem_aware`,
landing pages that frame the problem outperform pages that
compare Fitwell against alternatives.

**Confidence:** medium

**Why we believe it:** Comparing alternatives is only valuable
when the visitor is already shopping. Problem-unaware visitors
don't know there's anything to compare yet.

**What would validate:** A/B test of problem-framing vs.
comparison-framing landing pages, segmented by traffic source,
shows higher engagement and progression for problem-framing
among `unaware`/`problem_aware` sources.

**What would invalidate:** Comparison pages perform equivalently
or better across all traffic sources, suggesting visitors are
further down funnel than we assume.

**Estimated test cost:** Medium — requires two well-designed
landing pages plus enough cold ad traffic to compare.

**Test approach:** Paid social or top-of-funnel display, A/B
landing variants, PostHog session analysis.

**Status:** open

**Related:** [[funnel]] `unaware` and `problem_aware` stages.

---

### H6 — Video/demo dwell predicts intent
**Claim:** Time spent watching the how-it-works demonstration is
a leading indicator of purchase intent — a stronger signal than
generic page dwell.

**Confidence:** low (intuition only)

**Why we believe it:** A buckle is a physical product whose value
becomes obvious when seen working. Visitors who watch the
demonstration have crossed an understanding threshold.

**What would validate:** Cohort analysis shows visitors who
watched ≥X seconds of the demo convert at rates substantially
above the site average.

**What would invalidate:** Video dwell correlates weakly or
not at all with conversion, or correlates only because all
engagement metrics correlate.

**Estimated test cost:** Low — PostHog event instrumentation
plus cohort query.

**Test approach:** Tag video play/pause/completion events; run
funnel from video engagement to purchase.

**Status:** open (gated on video event instrumentation)

**Related:** [[event-taxonomy]] video events,
[[landing-page-goals]] pages with embedded demo.

---

### H7 — Budget is currently the binding constraint on test variation
**Claim:** Our ability to run statistically meaningful A/B tests
is currently limited by ad spend, not by our ability to generate
creative or pages.

**Confidence:** high

**Why we believe it:** Stated explicitly by Greg. Statistical
significance on landing-page conversion tests requires substantial
traffic, which requires substantial spend.

**Implication:** Prioritize tests against load-bearing assumptions
(H1, H4) over peripheral tweaks. Don't fragment a small budget
across too many variants.

**Status:** validated (operationally — this is a constraint, not
a question)

**Related:** all hypotheses requiring paid traffic to test.

---

## Open Questions Not Yet Hypotheses

These are unknowns that haven't been sharpened into testable claims
yet. Living catalog — add freely; promote to a numbered hypothesis
once the question is sharp enough to design a test for.

### Channel mix and audience
- What's the optimal mix of channels (Meta, Google, organic, email,
  influencer) for each persona?
- Does educational content (blog, YouTube) drive eventual conversion,
  or only top-of-funnel awareness?
- Is there a price point above which P2 Casual Owners drop off
  sharply that doesn't exist for P1 Collectors?
- How long is the typical consideration window — days, weeks,
  months?
- Do gift-buyers behave more like P1 or P2?

### Ad performance and saturation
- How many of our impressions are landing on people who've already
  seen the ad N times? What's the optimal frequency cap?
- Are we currently saturating any audience to the point of negative
  return (ad fatigue)?
- Which Meta creative formats convert (video vs. static vs. carousel),
  and does the answer differ by persona?
- What's the right balance between awareness-stage creative and
  conversion-stage creative in our active ad mix?

### Content type and confidence
- Which content formats (installation/how-to, comparison, lifestyle,
  testimonial) most move visitors from `solution_aware` to
  `considering`?
- Does an installation video on the PDP measurably reduce
  cart-to-checkout drop-off?
- Do reviews/testimonials carry more weight than product specs for
  P2, and the reverse for P1?

### Creator and influencer attribution
- What's the correlation between creator post metrics (engagement
  rate, follower count, niche fit) and resulting sales lift?
- When a creator posts and sales spike, what % of those buyers were
  already ad-exposed beforehand? Is the creator a *closer* (final
  confidence push) or an *introducer* (first awareness touch)?
- Is there a measurable sales-lift half-life after a creator post?
  Days? Weeks?
- Are there creator characteristics that predict lift better than
  raw follower count?

### Traffic source mechanics
- How is Google traffic actually finding us? Branded search post-ad
  exposure, organic discovery, referral from forums, post-creator-
  content branded search?
- Of users who search "fitwell" on Google, what % had a prior touch
  on Meta, a creator, or organic content within the past N days?
- Can we instrument cross-channel attribution well enough to credit
  upstream touches that drive downstream branded search?

### Funnel mechanics and the algorithmic floor
- Where exactly does the 1.5% conversion break — at top, middle, or
  checkout?
- Why does daily sales never go to zero post-Black-Friday? The 6–9
  floor looks algorithmic — what mechanism produces it? (Always-on
  retargeting? Branded search? Repeat customers? Some interaction?)
- Is the floor a feature (consistent retargeting working) or a
  ceiling (we're capped at what retargeting alone can produce)?
- What would it take to lift the floor — more upstream awareness, or
  better mid-funnel conversion?

## Related

- [[personas]] — beliefs about specific personas live here.
- [[funnel]] — beliefs about stage transitions live here.
- [[event-taxonomy]] — events instrumented to test these
  hypotheses.
- [[landing-page-goals]] — pages currently testing specific
  hypotheses are linked from this file.
