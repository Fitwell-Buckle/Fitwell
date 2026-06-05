# Funnel — D2C Acquisition

Last updated: 2026-05-26

> **Status: working draft, post-interrogation.** Restructured from the
> earlier 7-stage linear sketch to reflect (a) channel-first entry
> points as first-class objects, (b) compound-journey roles per
> channel, (c) per-persona expected paths, and (d) a cleaner scope:
> this doc covers D2C acquisition only. Sister docs: [[b2b-pipeline]]
> and [[retention-loop]]. Refine continuously as PostHog cohort data
> contradicts the path assumptions here.

## Scope

This funnel covers **D2C acquisition** — from first awareness through
first purchase. Three related but distinct flows live in their own
docs:

- **B2B sales pipeline** (B1–B6 personas, sample-to-partnership
  motion) → [[b2b-pipeline]]
- **Post-purchase retention / outfitting** (first-buyer →
  outfitter → advocate) → [[retention-loop]]
- **Multi-touch attribution math** (how credit is divided across
  touches in compound journeys) → [[../invariants/attribution]]

The three docs share vocabulary at the boundaries — `unaware` /
`aware` at the top, the first-purchase transition between funnel and
retention loop, and the persona enums everywhere.

## Purpose

The funnel is the framework against which we:

1. **Brief creative for ads** — every ad declares a target stage and
   persona; creative is built to advance the visitor by exactly one
   stage.
2. **Design landing pages** — every page in [[landing-page-goals]]
   declares its target stage and persona.
3. **Instrument PostHog events** — stage transitions in
   [[event-taxonomy]] are derived from these stages.
4. **Detect leaks** — once instrumented, "which stage-to-stage
   transition has the lowest conversion?" becomes the spend-priority
   question.
5. **Decide channel mix** — the Channel Entry Points section below
   classifies each channel by what it produces; budget decisions
   follow.
6. **Inform retention sequences** — the funnel ends at first
   purchase; the [[retention-loop]] picks up from there.

Team alignment / shared vocabulary is a byproduct of getting the
above right, not the primary goal.

## How to Use This Doc

- Every page, ad, PostHog event, and channel declares its target
  funnel stage and target persona.
- "Channel Entry Points" is the canonical list of how people enter.
  When a new channel is added (a new creator, a new ad format, a new
  partnership), add it here with its properties first.
- "Persona Paths" describe the expected progressions per persona.
  Use them to choose channels and shape creative — if you can't
  point to a path entry that explains why this artifact is in this
  persona's journey, the artifact doesn't have a job.
- When PostHog cohort data contradicts a path assumption, update
  this doc in the same change as the analysis.

## Targeting Discipline

**Broad-net first; narrow only when conversion data justifies it.**

Most "persona affinity" claims in the Channel Entry Points below are
working hypotheses, not validated facts. Two channels currently have
real evidence — `strap_maker_partnership` → P3 (Delugs proven) and
`branded_search_organic` → anyone with prior awareness (structurally
true). Everything else is informed guess until cohort data confirms
it. Treat each channel entry's `evidence` field accordingly:

- `evidence: confirmed` — multiple cohorts of data back the claim
- `evidence: observed` — early signal in the data, not yet
  statistically robust
- `evidence: hypothesis` — believed but not yet measured

**The "broad" envelope is the watch + strap + EDC ecosystem.**

Within that envelope, default to algorithmic-broad audience targeting,
broad keyword sets, and creator/content exploration in adjacent niches.
Outside that envelope (general menswear, fashion, beauty, lifestyle
broadly), exclude — those audiences are not our addressable market.

Practical rules:

- **Paid Meta cold:** broad interest stacks across watches, watch
  enthusiasts, watch creators' lookalike audiences, strap-content
  engagers, EDC communities. Don't pre-narrow to "watch enthusiast
  35–55." Let the algorithm learn from converters.
- **Search:** broad keyword sets including problem-search terms even
  when we *think* they're P5 — they might surface P2 in disguise.
  Negative-keyword over time, don't pre-restrict.
- **Creators:** test in adjacent niches (strap-content,
  microbrand-review, value-watch, EDC-watch) — not just dead-center
  watch-collector creators. The unexpected wins teach us the most.
- **Landing pages:** designed for a primary persona but defensively
  for off-target arrivals. See [[landing-page-goals]] design
  principles.
- **Tag everything with UTMs.** The whole point of casting broad
  nets is post-hoc cohort analysis — that requires clean attribution
  data on every touch.

A `persona affinity` claim in this doc is a working hypothesis until
at least one full cohort cycle confirms it. Until then, audience
configuration should remain broad enough within the watch/strap/EDC
envelope to surface unexpected segments.

## The Stages (D2C, six stages)

`outfitting` from the prior draft has been moved to
[[retention-loop]] — it is a retention behavior, not a funnel stage.
Six acquisition stages remain.

### `unaware`
**Mental state:** Doesn't know they have a problem. Their watch fits
"well enough." Has never thought about clasp design as a variable.

**Page goal:** Name the problem. *"Your watch fits one way at 9am
and another at 3pm — here's why, and why it's fixable."*

**Signal of progression to `problem_aware`:** dwell on the
problem-explanation section, video play, scroll past the fold.

---

### `problem_aware`
**Mental state:** Realizes the comfort issue has a name. Doesn't yet
know solutions exist or are worth pursuing.

**Page goal:** Introduce the existence of a solution category
(micro-adjust buckles). Explain why off-the-shelf options are
inadequate.

**Signal of progression to `solution_aware`:** scroll to "how it
works" section, watch demo video, click into product detail,
return visit.

---

### `solution_aware`
**Mental state:** Knows micro-adjust buckles exist. May or may not
know about Fitwell specifically. Comparing options or considering
whether to act.

**Page goal:** Position Fitwell as the answer. Differentiate from
alternatives. Provide evidence (reviews, specs, demonstrations).

**Signal of progression to `brand_aware`:** product page visit,
specs/compatibility section dwell, navigation to about/story.

---

### `brand_aware`
**Mental state:** Knows Fitwell exists and what we make. Forming an
opinion about whether we're the right choice.

**Page goal:** Build trust. Story, materials, manufacturing,
warranty, founder voice. Answer *"why should I trust you with $XXX
for a buckle?"*

**Signal of progression to `considering`:** add to cart, save for
later, navigate to checkout, compatibility checker use, return visit
with intent signals.

---

### `considering`
**Mental state:** Actively evaluating purchase. Has questions about
compatibility, fit, shipping, returns, gifting.

**Page goal:** Remove friction. Answer the last objections. Make
checkout obvious.

**Signal of progression to `converting`:** checkout start, payment
method selected, address entered.

---

### `converting`
**Mental state:** Has committed; just needs to complete the
transaction.

**Page goal:** Don't break the conversion. Checkout integrity, no
surprises, fast.

**Exit from funnel:** Order completed. Customer hands off to
[[retention-loop]] as `first_buyer`.

---

## Channel Entry Points

Each channel is a **first-class object** with its own properties.
Every ad, partnership, content type, and organic touch type belongs
to exactly one channel below. When you add a new one, add the entry
*before* spending against it.

### Channel entry template

```
### <channel_id>
**Typical entry stage(s):** <stage(s) — where people land when arriving here>
**Hypothesized persona affinity:** <which personas we think this reaches; see Targeting Discipline>
**Evidence:** confirmed | observed | hypothesis
**Journey role:** introducer | accelerator | closer | all-purpose
**Measurement:** <how we see touches from this channel>
**Cost shape:** <paid spend / partnership / organic / unmeasured>
**Status:** active | paused | experimental | aspirational
**Notes:** <free text, including any compound-path observations>
```

**Note on the persona affinity field.** Per Targeting Discipline above,
the `Hypothesized persona affinity` field is the persona we *expect*
the channel to reach disproportionately — but most are hypotheses, not
facts. Don't use these as exclusion criteria for audience targeting.
Use them as cohort-analysis prompts ("did this channel actually deliver
P2 as we expected?") and as creative-direction hints ("if we think P2,
test P2-targeted creative — but in a broad-net audience configuration,
not a narrowed one").

**Evidence-field convention.** If `Evidence:` is not specified in a
channel entry below, treat it as `hypothesis`. Only two channels
currently warrant `confirmed`; everything else is awaiting cohort data.

### Journey-role definitions

These are the four roles a channel can play in a compound journey:

- **Introducer** — typically a visitor's *first* exposure. Cold paid
  social, broad creator content, trade shows, in-the-wild sightings.
  Job: take someone from `unaware`/`problem_aware` to at least
  `problem_aware`/`solution_aware`.
- **Accelerator** — typically a *middle* touch in a multi-touch
  journey. Educational content, podcast mentions, comparison
  content. Job: move someone deeper without expecting them to
  convert from this touch alone.
- **Closer** — typically the *last* touch before conversion. Branded
  search, retargeting, abandoned-cart email. Job: convert someone
  who has already accumulated upstream awareness.
- **All-purpose** — works at any stage. Homepage, PDP, hero brand
  content.

A channel can play multiple roles for different audiences. Note them
in the channel's entry.

### Push channels — we (or partners) create the touch

#### `paid_meta_cold`
**Typical entry stage(s):** `unaware` → `problem_aware`
**Hypothesized persona affinity:** P4 dominant; some P2
**Journey role:** introducer
**Measurement:** Meta Ads Manager + UTM (`utm_source=meta`); PostHog
`referrer_source=meta_ads`
**Cost shape:** paid spend
**Status:** active
**Notes:** Largest top-of-funnel lever today. Creative must do the
problem-naming work — `unaware` audiences need to see the problem
before they can want a solution.

#### `paid_meta_retargeting`
**Typical entry stage(s):** `considering`
**Hypothesized persona affinity:** any prior site visitor
**Journey role:** closer
**Measurement:** Meta retargeting audience + UTM
**Cost shape:** paid spend
**Status:** active
**Notes:** Almost certainly part of the post-Black-Friday daily-sales
floor mechanism (see [[hypotheses]] open question on the floor).

#### `paid_search_branded`
**Typical entry stage(s):** `brand_aware` → `converting`
**Hypothesized persona affinity:** any persona with prior awareness
**Journey role:** closer
**Measurement:** Google Ads brand campaigns; UTM
**Cost shape:** paid spend (small; brand-only)
**Status:** active
**Notes:** Catches branded intent that would otherwise go to organic.
See [[hypotheses]] H4 — these visitors are high-intent; landing
should shortcut to PDP/checkout, not story.

#### `paid_search_category`
**Typical entry stage(s):** `solution_aware`
**Hypothesized persona affinity:** P2, P3, P5
**Journey role:** accelerator (rarely closer)
**Measurement:** Google Ads category campaigns; UTM
**Cost shape:** paid spend
**Status:** active (modest)
**Notes:** Smaller volume than expected — see [[hypotheses]] H1: the
category may be too niche for category-keyword spend to scale.

#### `paid_search_problem`
**Typical entry stage(s):** `problem_aware`
**Hypothesized persona affinity:** P5 dominant
**Journey role:** introducer
**Measurement:** Google Ads problem-keyword campaigns
**Cost shape:** paid spend
**Status:** experimental / untested
**Notes:** "watch strap between holes", "wrist swells watch strap".
P5 Comfort entry. Worth testing as cheap discovery; volume unknown.

#### `organic_meta`
**Typical entry stage(s):** `unaware` → `problem_aware`
**Hypothesized persona affinity:** P4 dominant
**Journey role:** introducer
**Measurement:** Meta insights; PostHog `referrer_source=social`
**Cost shape:** organic / content
**Status:** active — thin cadence per [[360-campaign]] Workstream 4.5
**Notes:** In practice this is IG Feed + Reels — FB organic isn't a
real volume lever for us. TikTok and YouTube each have their own
entries below; treat them as distinct channels with distinct
audiences and algorithms. Compounds with paid via look-alike
audiences. The operational layer driving cadence across all four
organic-social entries lives in [[360-campaign]] W4.5.

#### `organic_tiktok`
**Typical entry stage(s):** `unaware` → `problem_aware`
**Hypothesized persona affinity:** P4 dominant; some P5 via comfort-pain content
**Journey role:** introducer
**Measurement:** TikTok analytics + PostHog `referrer_source=social`;
link-in-bio UTM (`utm_source=tiktok&utm_medium=organic`)
**Cost shape:** organic / content
**Status:** active — thin cadence per [[360-campaign]] W4.5
**Notes:** Distinct from Meta because the algorithm favours raw /
native content over polished. Problem-pain hooks (P5 *"between
holes"* vocabulary from [[vocabulary-map]]) have outsized reach
potential at low production cost. Organic winners feed the paid
creative pool — see [[360-campaign]] W4.5 organic-winners loop.

#### `organic_youtube_shorts`
**Typical entry stage(s):** `unaware` → `problem_aware` → `solution_aware`
**Hypothesized persona affinity:** P2, P4
**Journey role:** introducer
**Measurement:** YouTube Studio + PostHog `referrer_source=social`;
description-link UTM
**Cost shape:** organic / content
**Status:** active — thin cadence per [[360-campaign]] W4.5
**Notes:** Vertical-video re-cut from the IG Reels / TikTok shoot
pipeline; marginal production cost ~zero. Audience skews more
Tier-2 "regular content" per [[personas]] consumption tiers —
closer to P2 than TikTok's algo-fed P4 base.

#### `organic_youtube_longform`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** P1a, P1b, P2 (Tier-1 / Tier-2 content tiers)
**Journey role:** accelerator + trust-builder
**Measurement:** YouTube Studio + PostHog `referrer_source=social`;
description-link UTM; subscribers as a leading indicator
**Cost shape:** organic / content (higher per piece than Shorts)
**Status:** aspirational — month 2+ in [[360-campaign]] W4.5
**Notes:** Mechanism deep-dives, comparison content ("Fitwell vs
Pelagos clasp"), watch-roll outfitting, founder pieces. Higher
trust transfer; not a daily-cadence channel — one piece per month
is plenty.

#### `creator_partnerships`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** depends on creator audience; P1, P2 most
common
**Journey role:** introducer for cold audiences, closer for warm
ones — the creator-vs-closer question in [[hypotheses]] open
questions
**Measurement:** creator-specific UTM codes; promo codes; ideally
PostHog cohort matching by post date
**Cost shape:** paid spend + gifted product
**Status:** active
**Notes:** Bridge channel — high trust transferred from creator,
often compresses the funnel. P3 Strap Hobbyist creators (strap
content) drive different audience than P2 watch-collector creators.

#### `trade_shows`
**Typical entry stage(s):** `solution_aware` → `brand_aware` →
`converting` (often single-session)
**Hypothesized persona affinity:** P1a, P1b, P2 (consumer side); B1–B6
(B2B side — see [[b2b-pipeline]])
**Journey role:** introducer + closer in one touch
**Measurement:** badge scans; show-specific promo codes; geo-fenced
retargeting in the 2-week afterglow window
**Cost shape:** event spend (booth, travel)
**Status:** active
**Notes:** WindUp, microbrand consumer shows. The post-show "afterglow
ROI with geo-targeted retargeting" open question in [[personas]]
applies to this channel specifically.

#### `email_klaviyo_welcome_flow`
**Typical entry stage(s):** `considering` → `converting` (the
welcome-flow discount code triggers first purchase)
**Hypothesized persona affinity:** anyone willing to give email
before buying; current data suggests this cohort skews higher-LTV
than the base, possibly because email signup is a high-intent
self-selection signal
**Evidence:** observed → confirmed — 64 welcome-flow-acquired
customers in the Nov 2025–May 2026 window driving $4,798 (89.7% of
all Klaviyo revenue), with **+27.6% LTV lift over baseline** ($92.06
vs $72.12 — the lift comes from order size, not repeat frequency).
See `scripts/klaviyo-acquisition-vs-retention.ts` and [[personas]]
Distribution channel-LTV section.
**Journey role:** closer (the welcome-flow discount code closes the
first purchase) — and arguably also an accelerator for the upstream
signup decision, since the offer of "10% off" or similar is itself
a touch
**Measurement:** Klaviyo signups + Klaviyo UTM on welcome-flow
emails; Shopify discount-code attribution
**Cost shape:** Klaviyo platform cost + discount margin foregone
**Status:** active — confirmed first-purchase driver
**Notes:** This was previously mis-categorized as "retention" in the
analysis because Klaviyo-tagged orders looked like outfitting-shape.
Reality: many Klaviyo-tagged *first orders* come from welcome-flow
discount redemption (acquisition), and Klaviyo-tagged *repeat
orders* come from post-purchase flows (retention) — these are
separate jobs sharing infrastructure. The post-purchase Klaviyo
work lives in [[retention-loop]] `klaviyo_post_purchase`. The
welcome-flow signup itself happens via on-site forms / pop-ups
upstream of this channel.

#### `strap_maker_partnership`
**Typical entry stage(s):** `solution_aware` (they're already buying
strap-related items)
**Hypothesized persona affinity:** P3 dominant
**Evidence:** confirmed — Delugs co-purchase volume is meaningful
([[personas]] Distribution / qualitative section)
**Journey role:** introducer + closer (co-purchase at strap-maker
checkout)
**Measurement:** partnership-specific SKU / promo code; partner
analytics
**Cost shape:** revenue share / wholesale margin
**Status:** active (Delugs); experimental (WIS onboarding)
**Notes:** Compresses the path dramatically — the customer is mid-
strap-purchase, so the buckle adds to an in-flight decision. The
only proven case where a single channel handles introducer through
converting.

#### `brand_partnership_oem_facing`
**Typical entry stage(s):** **post-funnel** — they receive a Fitwell
*as part of* a watch they bought
**Hypothesized persona affinity:** depends on which brand
**Journey role:** introducer-to-brand at the *retention-loop* entry
point (customer arrives at `first_buyer` having never been through
the acquisition funnel)
**Measurement:** partnership channel reporting; if recipient buys
again on D2C, we identify on email match
**Cost shape:** wholesale margin
**Status:** aspirational
**Notes:** Structurally different from every other channel here — it
inserts customers directly into [[retention-loop]] without funnel
contact. Should appear in retention-loop's entry section too.

#### `press_editorial`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** P1, P2 (watch-content readers)
**Journey role:** introducer (first mention) or accelerator (depth
coverage)
**Measurement:** referrer URL; ideally outlet-specific UTM
**Cost shape:** PR effort (no spend) or sponsored placement
**Status:** opportunistic / aspirational
**Notes:** Hodinkee, Worn & Wound, Time+Tide, Monochrome, Fratello
(already a visible UTM source — `fratello` shows up in the order
data). Outsized trust transfer when it happens.

#### `podcast_mentions`
**Typical entry stage(s):** `problem_aware` → `solution_aware`
**Hypothesized persona affinity:** P1, P2
**Journey role:** accelerator
**Measurement:** podcast-specific promo codes; hard to track without
them
**Cost shape:** sponsorship or organic mention
**Status:** aspirational
**Notes:** 40+ Watches, Wristcheck Watch Talk, and similar. Audience
is highly self-selected.

#### `retailer_walkin`
**Typical entry stage(s):** `solution_aware` → `converting` (single
session, hands-on)
**Hypothesized persona affinity:** P5 + general public (the boutique customer who
hits a fitting problem at the counter)
**Journey role:** introducer + closer
**Measurement:** retailer-specific SKU sales reporting
**Cost shape:** wholesale margin
**Status:** experimental (depends on B2 partnerships — see
[[b2b-pipeline]])
**Notes:** B2 Watch Retailer is the inbound side; this channel is the
*consumer experience* of that partnership.

#### `tradeshow_afterglow_content`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** P1, P2
**Journey role:** accelerator
**Measurement:** post-show traffic spikes; creator-tagged content
attribution
**Cost shape:** content effort
**Status:** experimental
**Notes:** Creators who attend trade shows make follow-up content.
Different from `creator_partnerships` — we don't pay for it directly,
but it amplifies the show investment.

### Pull channels — they discover us through their own behavior

#### `branded_search_organic`
**Typical entry stage(s):** `brand_aware` → `converting`
**Hypothesized persona affinity:** any persona with prior awareness
**Evidence:** confirmed — structurally true (brand search requires
prior brand exposure); volume visible in PostHog and Shopify
referrer data
**Journey role:** closer
**Measurement:** Google organic search; PostHog
`referrer_source=organic` + query
**Cost shape:** free
**Status:** active (always-on)
**Notes:** The conversion endpoint of many compound paths — the user
saw an ad / heard a podcast / saw a creator, then searched. See
[[hypotheses]] open question: "what % of fitwell searchers had a
prior touch on Meta or a creator in the past N days?"

#### `category_search_organic`
**Typical entry stage(s):** `solution_aware`
**Hypothesized persona affinity:** P1, P2, P3
**Journey role:** introducer (no prior brand exposure) or accelerator
(some prior exposure)
**Measurement:** organic search referrer + query (where available)
**Cost shape:** SEO effort
**Status:** weak (limited SEO investment)
**Notes:** "micro adjust buckle", "best watch clasp", "adjustable
watch buckle". Real opportunity for content investment.

#### `problem_search_organic`
**Typical entry stage(s):** `problem_aware`
**Hypothesized persona affinity:** P5 dominant
**Journey role:** introducer
**Measurement:** organic search referrer + query
**Cost shape:** SEO effort
**Status:** weak
**Notes:** "watch strap too tight", "wrist swells watch", "watch
strap between holes". Cheap, high-intent organic opportunity if we
build content for it.

#### `specific_watch_search_organic`
**Typical entry stage(s):** `solution_aware`
**Hypothesized persona affinity:** P2
**Journey role:** introducer (we appear in their solution exploration)
**Measurement:** organic search referrer + query
**Cost shape:** SEO effort
**Status:** weak / aspirational
**Notes:** "Tudor BB58 strap upgrade", "Omega Seamaster comfort
strap". The "compatibility/<watch-brand>" page concept in
[[landing-page-goals]] backlog targets exactly this.

#### `forum_reddit_organic`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** P1a, P1b, P2 (forum-active personas)
**Journey role:** closer (peer trust transfer)
**Measurement:** referrer URL; promo code if monitored
**Cost shape:** organic (no direct spend; advocate-driven)
**Status:** structural — driven by [[retention-loop]] advocate stage
**Notes:** WatchUSeek, Reddit r/Watches, r/WatchStraps, watch
Discord servers. We don't control timing; we control the volume by
producing more advocates.

#### `ai_search_recommendation`
**Typical entry stage(s):** `solution_aware`
**Hypothesized persona affinity:** any; trending up
**Journey role:** introducer / accelerator
**Measurement:** mostly unmeasured today; "ChatGPT" or similar
referrer occasionally visible
**Cost shape:** free
**Status:** unmeasured; growing
**Notes:** "what's the best watch buckle for fit problems"-class
queries to ChatGPT / Claude / Perplexity. Hypothesis register
should add a question about LLM-recommendation share of solution-
aware entries.

#### `in_person_sighting`
**Typical entry stage(s):** `solution_aware` (visual proof of
concept) → `brand_aware` (if conversation happens)
**Hypothesized persona affinity:** any; especially P1, P2, P3
**Journey role:** introducer with very high trust
**Measurement:** unmeasured directly; observable only when the
sighter later branded-searches
**Cost shape:** structural (driven by [[retention-loop]] outfitter
density)
**Status:** structural
**Notes:** A watch person seeing Fitwell on someone's wrist at a
meetup, GTG, or out at dinner. Very high conversion-quality touch.

#### `comparison_listicle_content`
**Typical entry stage(s):** `solution_aware` → `brand_aware`
**Hypothesized persona affinity:** P2
**Journey role:** accelerator
**Measurement:** referrer URL
**Cost shape:** opportunistic / SEO pitch effort
**Status:** opportunistic
**Notes:** "Best watch buckles 2026" type content. We don't control
who writes these.

#### `post_creator_branded_search`
**Typical entry stage(s):** `brand_aware` → `converting`
**Hypothesized persona affinity:** whichever persona the creator addresses
**Journey role:** closer (for the creator touch)
**Measurement:** difficult — requires matching branded-search
timestamps to creator-post dates; partially handled in
[[../invariants/attribution]]
**Cost shape:** N/A (downstream of creator partnership)
**Status:** structural — exists whenever creator content exists
**Notes:** This is a *compound-path artifact*, not a standalone
channel. Flagged so we don't double-credit it: the creator gets
the introducer credit, this is the closing leg.

### Gift-context entry

#### `gift_recipient`
**Typical entry stage(s):** **post-funnel** — they own a Fitwell
they didn't buy
**Hypothesized persona affinity:** any; gift-receivers often skew P2 / P4
archetypes
**Journey role:** introducer-to-brand at the retention-loop entry —
just like `brand_partnership_oem_facing`
**Measurement:** currently under-detected; requires (a) gift-card
SKU surfaced in [[personas]] Gift Buyer overlay, and (b) a way to
capture recipient email at unboxing or on a "register your buckle"
page
**Cost shape:** structural (driven by Gift Buyer overlay activity)
**Status:** under-served
**Notes:** Gift Buyer overlay in [[personas]] notes "$40 is a real
seasonal channel" but underperforms without gift-card SKU. The
recipient is a brand-new customer entering at the retention-loop
entry, not the acquisition funnel.

## Persona Paths

Expected progressions per consumer persona. Use these to choose
channels and shape creative — if you can't point to a path entry
that explains why your artifact is in this persona's journey, the
artifact doesn't have a job.

**These paths are working hypotheses.** They're anchored in current
segment data ([[personas]] Distribution section) plus
[[event-taxonomy]] stage-transition heuristics, but the
*channel-to-persona* mapping inside each path is mostly unvalidated.
Per the Targeting Discipline section above, use these to *prompt*
creative variations and cohort questions — not to pre-narrow audience
targeting at the channel level. When PostHog cohort data shows that a
channel delivers a different persona than predicted here, update the
path entry in the same change as the analysis.

### P1a Watch Advocate

**Typical entry channels:** `trade_shows`, `creator_partnerships`,
direct outreach, peer referral within watch community.
**Likely path:** `solution_aware` → `brand_aware` (compressed via
peer/founder trust) → `converting`. Often 1–3 touches total.
**Why short:** Self-selecting expert audience; minimal funnel
friction; price near-irrelevant; trust transfers from the
introducer rather than being built incrementally on-site.
**Where they leak:** Almost never — but when they do, it's at
`considering` if a technical detail is wrong or compatibility is
unclear.
**Implication for creative:** Lead with technical credibility and
founder accessibility, not lifestyle.

### P1b Deep Collector

**Typical entry channels:** `creator_partnerships`, `forum_reddit_organic`,
`trade_shows`, `press_editorial`.
**Likely path:** `solution_aware` → `brand_aware` → `considering`
→ `converting`. 2–4 touches; quiet evaluation phase.
**Compound pattern:** Often introducer = creator/forum, closer =
branded search after extended consideration.
**Where they leak:** `considering` if specs or compatibility for
their specific watches aren't documented.
**Implication for creative:** Quality, finish, materials, manufacturing
detail. Don't lead with price.

### P2 Engaged Curator

**Typical entry channels:** `paid_meta_cold`, `creator_partnerships`,
`organic_meta`, `podcast_mentions`, `specific_watch_search_organic`.
**Likely path:** `problem_aware` → `solution_aware` → `brand_aware`
→ `considering` → `converting`. **4–6 touches typical, weeks-long
deliberation.**
**Compound pattern (the canonical multi-touch story):**
`paid_meta_cold` (introducer) → educational content or podcast
(accelerator) → `branded_search_organic` or
`paid_search_branded` (closer) → often `paid_meta_retargeting`
between any of these.
**Where they leak:** Multiple places — the gap between
`solution_aware` and `brand_aware` (Fitwell-specific trust) and
the gap between `considering` and `converting` (last-objection
removal) are both high-loss zones.
**This is the persona where the funnel doc matters most.** Largest
*reachable* segment per [[personas]]; multi-touch dependence means
the compound-path framing applies most here; biggest leverage from
landing-page and creative variation testing.
**Implication for creative:** Named-watch use cases ("works great
on my Seamaster"), demonstration video, social proof. Anchor price
against deployant clasps ($80–200+), not against tang buckles —
see [[personas]] Pricing-by-Anchor and the Curator "Overpriced"
review finding.

### P3 Strap Hobbyist

**Typical entry channels:** `strap_maker_partnership` (compresses
the entire funnel into one co-purchase), `creator_partnerships`
within strap-content niche, `category_search_organic` for strap-
related terms.
**Likely path via partnership:** `solution_aware` → `converting`
in a single session at strap-maker checkout.
**Likely path via direct:** `solution_aware` → `brand_aware` →
`considering` → `converting`. 2–4 touches.
**Where they leak:** Direct path leaks at `brand_aware` if our
strap-context vocabulary (Baranil, sailcloth, tropic) doesn't
appear; they expect strap-craft language.
**Implication for creative:** Strap-quality vocabulary, finish
talk, slim profile vs. deployant. Do not under-invest in direct
channels just because partnerships exist (per [[personas]] P3
note).

### P4 Algo-Discovered

**Typical entry channels:** `paid_meta_cold`, `organic_meta`, IG/TikTok
algorithmic feeds.
**Likely path:** `problem_aware` (via ad) → `solution_aware` →
`considering` → `converting`. **2–4 touches; mostly within paid+
retargeting orbit.**
**Compound pattern:** `paid_meta_cold` (introducer) →
`paid_meta_retargeting` (closer) is the dominant compound. Some
also pass through `branded_search_organic` between, suggesting an
identity-formation step ("let me look this up myself").
**Where they leak:** Heavy leak at `solution_aware → brand_aware`
because they don't have a prior brand frame; need strong
demonstration-video and social-proof concentration in retargeting
creative.
**Implication for creative:** Strong demonstration video, simple
value framing, social proof, low-friction trust signals.

### P5 Comfort Buyer

**Typical entry channels:** `problem_search_organic`,
`paid_search_problem`, comfort-framed `paid_meta_cold`.
**Likely path:** `unaware` → `problem_aware` (often the same
hour, not the same day) → `solution_aware` → `converting`.
**Often a short, urgent path — sometimes single-session.**
**Compound pattern:** Often a single channel handles the whole
flow; the urgency of pain shortcuts deliberation.
**Where they leak:** Almost not at all once they reach
`solution_aware` — but they leak at the entry if our problem-
search and problem-framed-ad presence is weak.
**Implication for creative:** Pain-relief framing. Demonstration
that this solves the *physical* problem, not a horological
precision problem. Anchor price against "the cost of not solving"
(the watch they stopped wearing), not against other buckles.

### Cross-persona overlays

These apply *on top of* a persona path, not instead of:

- **Bracelet-Wearer-With-Strap-Watches:** primed buyer; entry
  stage is `solution_aware` immediately because they already
  experience micro-adjust on their bracelet. Highest-leverage
  untested copy angle per [[personas]].
- **Gift Buyer:** the *buyer* travels through a normal D2C path;
  the *recipient* lands at retention-loop entry as a brand-new
  customer. Both flows need attention.

## Anti-Patterns

- **Building one page or one ad that targets all stages.** Repeated
  from the prior draft because it remains the most common failure
  mode. Pick one stage.
- **Crediting last touch only.** Most paths are compound. Last-touch
  attribution under-invests in introducer channels (creators, paid
  Meta cold, podcasts) and over-invests in closers (branded search,
  retargeting). See [[../invariants/attribution]].
- **Modeling outfitting as part of acquisition.** It's a retention
  behavior. Mixing them obscures the leak diagnosis: a low
  conversion rate is a different problem from a low repeat rate.
- **Treating `gift_recipient` and `brand_partnership_oem_facing` as
  funnel entries.** They bypass the funnel and land in the
  retention loop as first-time owners. Different motion.
- **Adding a channel without a funnel-doc entry first.** Channels
  that don't have a declared entry stage, persona affinity, and
  journey role produce un-categorizable touches that pollute the
  analytics.

## Open Questions

| Question | Why it matters | Owner | Status |
|---|---|---|---|
| What share of `branded_search_organic` is `post_creator_branded_search` in disguise? | Determines how much to credit creator channels | Tom | Partial answer 2026-06-05: Grapevine survey on 178 orders shows Meta-family is 65%+ of self-reported introducer; Google branded is ~5%. See `/attribution/survey` admin view + delta sidebar. Strong evidence that converting Google traffic is mostly the closer leg of a Meta-introduced compound path. Sample is small for the UTM-cross-checked delta (~9 orders) until [[../work-plans/todo/utm-linking-gap]] is fixed. |
| Is `paid_search_problem` real? Does search volume on comfort-pain terms support a budget? | Tests whether P5 search funnel is worth pursuing | Tom | Needs keyword research + pilot spend |
| Where does the daily-sales floor (6–9/day post-Black-Friday) come from? Is it `paid_meta_retargeting`, `branded_search_organic`, repeat customers from [[retention-loop]], or interaction? | Tells us whether the floor is a feature or a ceiling | Tom | Open; instrumentation required |
| What's the typical multi-touch journey length for P2 — 4 touches? 6? 10? | Determines retargeting frequency caps and email cadence | Tom | Open |
| Should `ai_search_recommendation` get its own measurement plan? | Channel is growing fast and currently invisible | Tom | New — promote to [[hypotheses]] |
| Is `tradeshow_afterglow_content` measurable separately from `creator_partnerships`, or do we treat it as a sub-mode? | Affects how we attribute trade-show ROI | Tom | After next trade show |

## Related

- [[personas]] — persona definitions referenced throughout, plus
  the Distribution section with current segment data.
- [[b2b-pipeline]] — sister flow for B1–B6 sales motion.
- [[retention-loop]] — sister flow for post-purchase outfitting
  and advocacy.
- [[event-taxonomy]] — stage enums and progression-trigger event
  mappings.
- [[hypotheses]] — open questions and beliefs about stage and
  channel dynamics live here.
- [[landing-page-goals]] — every page declares a target stage from
  this doc.
- [[../invariants/attribution]] — multi-touch attribution math.
