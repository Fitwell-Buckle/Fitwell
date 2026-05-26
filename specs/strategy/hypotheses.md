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

### H8 — P2 Curator follows a long multi-touch journey
**Claim:** P2 Curator buyers typically have 4–6 touches across 2+
channels over weeks before converting. The most common compound
pattern is `paid_meta_cold` (introducer) → educational content or
podcast (accelerator) → `branded_search_organic` (closer), often
with `paid_meta_retargeting` between any of these.

**Confidence:** medium

**Why we believe it:** Standard B2C accessory consideration
dynamics; the [[personas]] Distribution data showing P2 Curator is
the largest *repeat-capable* segment with comparative behavior;
the [[funnel]] persona path for P2.

**What would validate:** PostHog session-count distribution for
converted Curator-segment customers shows median ≥ 3, mode in the
4–6 range. First-touch `paid_meta_cold` + last-touch
`branded_search_organic` appears in > 40% of P2 conversions.

**What would invalidate:** Curator-segment customers convert
predominantly in 1–2 sessions; first/last touch is dispersed
across many low-volume channels with no dominant compound pattern.

**Estimated test cost:** Low — analytics query once multi-touch
PostHog instrumentation lands.

**Test approach:** PostHog cohort analysis of Curator-segment
conversions; touch-count distribution; channel-pair frequency.

**Status:** open (gated on multi-touch attribution instrumentation)

**Related:** [[funnel]] P2 Engaged Curator path, [[personas]] P2
Curator segment, H4 (interaction — branded-search-as-closer).

---

### H9 — `paid_meta_cold` delivers P4 Algo-Discovered disproportionately
**Claim:** Cold paid Meta produces a customer cohort that skews
heavily to P4 Algo-Discovered behavior (single buyer, lower repeat
rate, demonstration-video responsive) compared to the overall
customer base.

**Confidence:** low (informed guess, untested)

**Why we believe it:** P4 is defined as Tier 3 algo-fed content
consumers; cold Meta is exactly that algorithmic delivery; the
[[personas]] Distribution Single Buyer segment dominance (65.9%)
aligns with what we'd expect if paid Meta is delivering P4.

**What would validate:** `paid_meta_cold`-tagged cohort skews to
Single Buyer segment at a meaningfully higher rate than the
overall base; lower 6-month outfitting rate; demonstration-video
creative outperforms specs-heavy creative on this audience.

**What would invalidate:** `paid_meta_cold` cohort behaves
indistinguishably from the overall base, suggesting Meta is
delivering a mixed-persona slice; or, the cohort skews to a
different persona than expected (e.g., P2 Curator).

**Estimated test cost:** Low — cohort query against existing UTM
data once persona-segment classification is in place.

**Test approach:** PostHog cohort analysis of
`paid_meta_cold`-tagged conversions, segmented by 6-month
behavioral segment classification.

**Status:** open

**Related:** [[funnel]] `paid_meta_cold` channel, [[personas]] P4
Algo-Discovered.

---

### H10 — AI search recommendation is a meaningful and growing channel
**Claim:** LLM-driven recommendations (ChatGPT, Claude,
Perplexity) deliver a non-trivial and growing share of
solution-aware visitors. By end of 2026, LLM-referrer share
should be comparable to or exceeding small dedicated organic
channels.

**Confidence:** low (no data; structural / category-trend argument)

**Why we believe it:** LLM-mediated search is growing rapidly in
general; product-recommendation queries are a common LLM use case;
existing referrer data already shows occasional
ChatGPT/Perplexity-class referrers at noise levels.

**What would validate:** Visible LLM-referrer share growing
month-over-month; share reaches ≥ 1% of total acquisition by Q4
2026; brand presence visible in manual LLM probe responses for
relevant queries.

**What would invalidate:** LLM-referrer share stays at noise level
(< 0.5%) over 6 months despite category growth in LLM usage; LLM
probes consistently fail to surface Fitwell for relevant queries.

**Estimated test cost:** Low — referrer parsing + instrumentation;
periodic manual LLM probes.

**Test approach:** Instrument PostHog/GA4 to capture LLM-referrer
sources cleanly; track over time; quarterly manual probes of
ChatGPT/Claude/Perplexity for category and adjacent queries.

**Status:** open (flagged from [[funnel]]
`ai_search_recommendation` channel entry)

**Related:** [[funnel]] `ai_search_recommendation` channel.

---

### H11 — Creator partnerships act primarily as introducers, not closers
**Claim:** For most creator partnerships, the creator post is the
customer's *first* exposure (introducer role), with the actual
conversion happening days/weeks later via a different channel
(typically branded search or retargeting). The exception is
creators with very high audience-trust who can close in a single
touch.

**Confidence:** low (was an open question; promoting to testable
hypothesis)

**Why we believe it:** Standard creator-marketing dynamics for
considered purchases; consistent with the H8 P2 multi-touch
pattern; H4 implies branded-search-as-closer behavior.

**What would validate:** Of conversions attributable in part to a
creator touch, > 60% have at least one intervening touch (Meta,
branded search, retargeting) between the creator touch and the
conversion; time-from-creator-touch-to-conversion distribution
has a meaningful tail (days/weeks, not just same-session).

**What would invalidate:** Creator touch is consistently the
immediately-preceding touch before conversion; same-session
conversion rate post-creator-touch is at or above site baseline,
suggesting closer role.

**Estimated test cost:** Medium — requires multi-touch attribution
instrumentation that PostHog plus UTM hygiene can probably
deliver.

**Test approach:** Cohort analysis of creator-attributed
conversions; time-from-first-creator-touch-to-conversion
distribution; intervening-touch-count distribution.

**Status:** open (gated on multi-touch instrumentation; promoted
from earlier "Creator and influencer attribution" open questions
section)

**Related:** [[funnel]] `creator_partnerships` channel,
`post_creator_branded_search` channel, [[personas]] P1, P2.

---

### H12 — Klaviyo is doing retention work, not acquisition work
**Claim:** Klaviyo email as a UTM source primarily re-engages
existing customers for outfitting purchases, not first-purchase
acquisition. The high $96/customer LTV observed for Klaviyo-
attributed orders is a retention signal, not an acquisition
signal.

**Confidence:** high (largely supported by current data)

**Why we believe it:** [[personas]] Distribution shows Klaviyo as
the highest-LTV channel ($96/cust, 2.44 units), but Klaviyo
audiences are by construction post-signup — most signups happen
post-purchase. The behavior is consistent with re-engagement, not
cold acquisition.

**What would validate:** Continued — Klaviyo-attributed orders
remain dominantly from customers with prior purchase OR
post-purchase email signup; first-purchase-attributable Klaviyo
share stays < 10% of total Klaviyo revenue.

**What would invalidate:** Klaviyo starts producing meaningful
first-purchase attribution (> 20% of Klaviyo revenue from
never-purchased emails), suggesting pre-purchase lead capture
is becoming the dominant motion.

**Estimated test cost:** Low — Shopify + Klaviyo cohort query.

**Test approach:** Segment Klaviyo-attributed orders by customer
purchase history (had-prior-order vs. first-order); track the
first-purchase-Klaviyo share over time.

**Status:** validated (operationally) — documenting for
completeness so the channel categorization in
[[funnel]] `email_klaviyo_acquisition` and
[[retention-loop]] `klaviyo_post_purchase` is grounded.

**Related:** [[funnel]] `email_klaviyo_acquisition`,
[[retention-loop]] `klaviyo_post_purchase`, [[personas]]
Distribution channel-LTV table.

---

### H13 — EDC audiences convert at comparable LTV to watch-enthusiast audiences
**Claim:** Audiences from the EDC (everyday-carry) community —
knife/wallet/pen/flashlight enthusiasts who overlap with watches —
convert at LTV comparable to dedicated watch audiences and
represent a meaningful expansion of the addressable market within
the watch/strap/EDC broad-net envelope ([[funnel]] Targeting
Discipline).

**Confidence:** low (untested expansion premise)

**Why we believe it:** EDC community has high overlap with watch
interest; aesthetic appreciation, attention to functional detail,
and willingness-to-spend-on-quality-accessories all align with our
P2 Curator / P1b Deep Collector personas; EDC is explicitly in the
broad-net envelope.

**What would validate:** Paid Meta cohorts targeting EDC-adjacent
interests deliver 6-month LTV ≥ 75% of pure-watch-targeted
cohorts at comparable or lower CAC; behavioral-segment mix is
broadly similar to watch cohorts.

**What would invalidate:** EDC-targeted cohorts deliver
substantially lower LTV (< 50% of watch cohorts), or skew heavily
to Single Buyer segment with no outfitting conversion, suggesting
poor product-market fit for the broader EDC audience.

**Estimated test cost:** Medium — separate Meta campaign cell
required; ~6–8 weeks of cohort accumulation for meaningful read.

**Test approach:** Parallel Meta campaigns with watch-interest
vs. EDC-adjacent-interest audiences using identical creative;
track 90-day cohort behavior including segment distribution.

**Status:** open

**Related:** [[funnel]] `paid_meta_cold` channel, [[funnel]]
Targeting Discipline section, [[personas]] P2, P1b.

---

## Open Questions Not Yet Hypotheses

These are unknowns that haven't been sharpened into testable claims
yet. Living catalog — add freely; promote to a numbered hypothesis
once the question is sharp enough to design a test for.

### Channel mix and audience
- What's the optimal mix of channels (Meta, Google, organic, email,
  influencer) for each persona? *(Partially addressed by H8, H9, H11,
  H13 once those resolve.)*
- Does educational content (blog, YouTube) drive eventual conversion,
  or only top-of-funnel awareness?
- Is there a price point above which P2 Curators drop off sharply
  that doesn't exist for P1 Collectors?
- How long is the typical consideration window — days, weeks,
  months? *(Addressed by H8 for P2.)*
- Do gift-buyers behave more like P1 or P2? *(See [[funnel]]
  `gift_recipient` channel and [[retention-loop]] gift-recipient
  entry — these arrive at retention-loop entry, not acquisition
  funnel entry.)*

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
- ~~When a creator posts and sales spike, what % of those buyers were
  already ad-exposed beforehand? Is the creator a *closer* (final
  confidence push) or an *introducer* (first awareness touch)?~~
  *Promoted to H11.*
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
