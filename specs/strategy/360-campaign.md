# Fitwell Buckle Co — Integrated 360 Campaign
### Marketing plan + engineering scope · v3.1 (2026-05-26)

> **Status: current marketing iteration.** This is the active 360
> campaign — the *next* iteration of our marketing program, not the
> forever plan. Future iterations (v4, v5…) will replace or restructure
> this doc as the program evolves. The supporting strategy docs in
> `specs/strategy/` (personas, funnel, retention-loop, etc.) are the
> *durable framework* that every iteration of the 360 consumes and
> updates — they outlive any single campaign cycle. Originally drafted
> 2026-05-25 as v3; refreshed 2026-05-26 with the persona deep-dive,
> channel-first funnel framework, retention-loop split, hypotheses
> register, and data findings from the first cohort analyses.

---

## Strategy framework alignment

This 360 plan is the operational layer for the *current* iteration;
the strategy docs in `specs/strategy/` are the durable conceptual
framework it consumes. Future iterations of the 360 will consume
the same framework docs — those docs evolve incrementally as data
lands, while the 360 cycles iterate as campaign plans:

- **[[personas]]** — five consumer personas (P1a/P1b/P2/P3/P4/P5)
  + six B2B personas (B1–B6) + the data-validated Distribution
  section that quantifies segments and channel LTV. *Workstreams
  consume:* offer stack (P2 anchor), creator briefs (persona-
  matched), landing page variants (one persona per page), email
  segmentation (D14 reply ladders the customer).
- **[[funnel]]** — D2C acquisition funnel (six stages) +
  channel-first entry points (`paid_meta_cold`, `creator_partnerships`,
  `email_klaviyo_welcome_flow`, etc.) + per-persona expected paths
  + the Targeting Discipline (broad-net within watch/strap/EDC,
  narrow on data). *Workstreams consume:* paid budget split,
  audience configuration, attribution wiring.
- **[[b2b-pipeline]]** — sales pipeline for B1–B6 (prospect →
  partnership). *Not in this campaign's scope* — B2B has its own
  motion. Trade-show afterglow content sits at the seam.
- **[[retention-loop]]** — post-purchase outfitting and advocacy
  (first_buyer → outfitter → advocate). *Workstreams consume:*
  Workstream 5 post-purchase Klaviyo series, in-box card, creator
  program advocate tier.
- **[[hypotheses]]** — H1–H13. *Workstreams consume:* every A/B
  test variant declares which hypothesis it tests; landing page
  variants A/B/C map to H1 (awareness game), H4 (branded-search
  shortcuts to checkout), and H5 (problem-framing for unaware
  traffic).
- **[[vocabulary-map]]** — distinctive language per persona from
  the review corpus. *Workstreams consume:* ad copy, landing page
  hero copy, creator brief wording.
- **[[landing-page-goals]]** — every marketing page declares its
  target persona + funnel stage + hypothesis. *Workstreams
  consume:* Workstream 3 destination pages register here when
  published.
- **[[creator-program]]** — creator-management system work plan
  (schema, outreach pipeline, sample tracking, post detection).
  *Workstream 2 depends on Phases 1+2+4+5 of this plan.*
- **[[creator-scoring]]** — scoring methodology (watch_score,
  fit_score, cross_platform_fit). Used by the creator import
  script and stats refresh cron.

When the 360 plan changes course, the affected strategy docs get
updated in the same change. When new persona / funnel / hypothesis
data lands, the 360 plan absorbs the implication in the next
refresh.

---

## Context

Two problems, not one:

1. **Volume.** We're acquiring 5–8 customers/day. We need 30–40 to hit the business plan. That's a 4–6× lift in raw acquisition — not something offer-stack work alone can deliver. Top-of-funnel volume has to grow through cold paid acquisition, organic creator reach, and SEO-relevant landing pages.
2. **Quality.** Of those we do acquire, too many are trial buyers and not enough become collectors — CVR is climbing, AOV is falling, repeat rate is half what it should be.

This campaign attacks both. The offer stack, landing page variants, and email segmentation push trial buyers into collectors (quality). The creator pipeline + paid acquisition + new landing pages push the funnel wider (volume). Either lever alone is insufficient.

**Roles:**
- **Tom + Oliver** — co-owners. Strategic and financial
  decision-makers. Tom runs marketing day-to-day; Oliver is CEO.
- **Greg** — engineering consultant. Owns the admin/analytics repo,
  integrations, infrastructure, attribution. Implements per Tom's
  direction; does not own product/marketing strategy.
- **Melanie** — customer service, orders, fulfillment ops.
- **Claude Code** — force multiplier on both sides; goal is to
  maximize the work it does so neither Tom nor Greg becomes a
  bottleneck.

**Single organizing idea:**
> "One buckle changes how one watch fits. Fitwell changes how your whole collection fits."

Every page, ad, email, and offer ladders to this. First purchase is the entry point. The collection is the destination.

---

## Operating model — what "360" actually means

This is not a phased waterfall. The numbering below is for organization, not sequence. The whole point of a 360 campaign is that **every workstream launches concurrently in week 1** and the channels feed each other in continuous loops. A 30–40 orders/day outcome can't be reached by any single channel — it requires all of them firing at once, with shared offer copy, shared creative pool, and shared attribution.

**The integration loops (this is the 360):**

- **Offer Stack → everything.** Guarantee, bundles, anchor, and in-box card copy live on the product page, all landing page variants, every Klaviyo email, every Meta and Google ad, every creator outreach brief. Lock the offer first; every other workstream consumes it.
- **Creator Program ↔ Paid Channels.** Creator UGC (paid_30d rights) becomes Meta retargeting creative within 7–14 days of posting. Top-performing paid creative tells us which creator angles to brief next.
- **Destination Pages ↔ Paid Channels ↔ Creator Program.** Paid ads, creator post bio links, and email CTAs all point at the same 3–4 destinations. UTMs + landing_site capture attribute by variant. Winning variants get more traffic.
- **Email ↔ everything else.** The D14 "how many watches do you own?" segmentation in Klaviyo influences which creator angles get prioritized (more watch-roll creators if the list skews 6+), which bundle gets promoted, and which landing page variant gets the email send.
- **Attribution wiring ↔ everything.** UTM variant capture + per-creator discount code attribution + cohort comparison in the admin dashboard is the only thing that lets us see which workstream is moving the volume needle and which is moving the quality needle.

**Why this matters for sequencing:** if creator program ships in month 2 instead of week 1, paid retargeting runs out of fresh creative by week 5, paid spend gets capped, and the volume goal slips by a quarter. If landing pages aren't live when ads launch, we burn cold traffic against the current page. If the offer isn't locked, every workstream ships inconsistent copy. **The launch is concurrent or it isn't 360.**

---

## Decisions

These are the open calls. Tom decides; Greg implements per direction.

1. **Anchor framing.** Recommendation: *"$300–500 to swap your
   bracelet vs. $40 to keep the strap you love."* Reframes against
   the cost of bracelet replacement, not a hypothetical $300
   deployant clasp that doesn't really exist on the market (cheapest
   aftermarket micro-adjust deployants are ~$85). **Evidence from
   the segment analysis:** the single 2-star "Overpriced" review in
   the Judge.me corpus came from a Curator-segment buyer
   (justinbradfield@me.com) who anchored against a $5 OEM tang
   buckle — confirming that *some* mental anchor will form, and if
   we don't supply one, the buyer's default ($5 tang buckle) is
   ruinous. The bracelet-swap anchor is concrete and aspirational;
   the deployant anchor is fuzzy. **Lock the bracelet-swap anchor;
   leave deployant as a secondary copy point** ([[personas]]
   Pricing-by-Anchor table aligns).
2. **Budget split at launch.** Volume goal (5–8/day → 30–40/day)
   means retargeting can't dominate — at current site visitor
   volume, the retargeting pool is too small to absorb a 70% share
   without saturation. Updated recommendation: **50% awareness /
   30% retargeting / 20% consideration** at launch. Retargeting
   ships first (cheapest creative validation); its share grows as
   the visitor pool grows. Awareness audiences configured **broad-
   net within the watch/strap/EDC envelope** per [[funnel]]
   Targeting Discipline — H13 in [[hypotheses]] specifically tests
   whether EDC delivers comparable LTV to watches.
3. **Landing page variants — pick 2 of 3** (see Workstream 3 below).
   Existing landing page stays as the control.
4. **~~One artifact or two?~~** **Resolved 2026-05-26.** This doc
   lives in `specs/strategy/` as the integrated master plan;
   engineering scope stays bundled here. Splitting into a separate
   `shopify-content-publishing` work plan can happen later if the
   engineering surface area grows large enough to warrant it.
5. **Klaviyo + Google Ads — light or heavy automation?** See
   "Engineering scope" below. Light is the recommendation for v1;
   heavy is justifiable once Workstream 5's post-purchase series is
   live and we want to iterate it from this repo.
6. **Collector's Promise loyalty app.** Recommendation: **cut**.
   Adds a vendor (~$50–200/mo), an attribution surface the admin
   pipeline doesn't ingest, and complexity. In-box card already
   covers the "reason to come back" job.
7. **Creator program sequencing — high priority.** The 360 launch
   requires the creator pipeline kicking off in week 1, not month 2.
   The detailed build is in [`creator-program.md`](./creator-program.md)
   (6 phases). Choice: **compress** Phases 1+2+4+5 of that plan
   into ~3 weeks to launch alongside the rest, or **run on existing
   cadence** and let the campaign use manual creator tracking
   (spreadsheets) until the system catches up — but this delays
   paid retargeting saturation by weeks. **Recommendation:
   compress.** Highest-leverage engineering investment in the
   plan; Tom's call, Greg's execution.

---

## Pre-launch — Baselines (~1 day, blocks the week-1 kickoff)

`specs/ops/SCORECARD.md` is mostly placeholders. We can't validate "+20–30% CVR" claims against a baseline that doesn't exist. Before any of the workstreams ship changes:

- [ ] Pull last 90 days from Shopify into SCORECARD: CVR, AOV, return rate, 30-day repeat rate, monthly orders, monthly new customers, current daily order baseline (the 5–8 number)
- [ ] Pull last 30 days from GA4: sessions, paid vs organic split, bounce rate, top landing pages by entrances and conversions
- [ ] Document current Klaviyo flow performance: open rate, click rate, attributed revenue for the welcome flow (only confirmed flow running; per Tom 2026-05-26 no post-purchase flows or campaigns are active)
- [ ] Identify which existing landing page is the highest-converting and tag it as the A/B control

**Already-quantified baselines (as of 2026-05-26 analyses; see
[[personas]] Distribution + the `scripts/` outputs):**

- D2C window: Nov 2025 – May 2026 (entire D2C history).
- Customers: 824 paying / 996 orders / $61,307 revenue.
- Overall LTV/customer: $74.
- Mature-cohort LTV (Nov 2025 only, fully matured 6mo): $76.50 → **working CAC ceiling baseline.**
- Behavioral-segment distribution: 5.7% Outfitter ($242 LTV / 6.3 units; 18.7% of revenue) → 16.6% Curator ($95 LTV / 2.1 units) → 8.4% Bulk Single → 3.4% Single Repeat → **65.9% Single Buyer** ($47 LTV / 1.2 units).
- Klaviyo channel: **89.7% acquisition (welcome flow), 10.3% retention. +27.6% LTV lift** for welcome-flow-acquired customers ($92.06 vs $72.12 baseline). Lift comes from order size, not repeat frequency.
- Review behavior: Outfitters review at **19.1%** vs 3.7% for Single Buyers (5× rate).
- Top acquisition channels by LTV: Klaviyo welcome flow $96/cust → direct $76 → Meta paid $85 → IG organic $68 → search referrer $66.

Without these numbers, none of the tests below are falsifiable. With these numbers, several of the workstream success criteria can be sharpened — e.g., the "AOV back to $75+" target now has the $74 base + $92 welcome-flow lift as bookends.

---

## Workstream 1 — Offer Stack (foundation; locks in week 1)

The offer must be locked first because every other workstream consumes it. Copy from here lands on product pages, landing pages, emails, ads, creator briefs.

### 1. 60-Day Keep-It Guarantee
Wear it 60 days. Full refund if not satisfied. Keep the buckle.

Highest-leverage single move. Eliminates purchase risk for trial buyers. A $40 buckle with a keep-it guarantee is an impulse buy; without it, it's a considered purchase.

Execution:
- Add guarantee badge near add-to-cart on all product pages
- Add to checkout page
- Add to welcome series email 1
- Add to all ad creative once shot

Test: 30 days. Expected outcome: CVR +20–30%, return rate stays in single digits.

### 2. Bundle Ladder
Restructure pricing to make multi-unit obvious.
- 1 buckle: $40 (anchor)
- 3-pack: $92 (save $28 — "one for every daily wear")
- 5-pack: $134 (save $66 — "outfit the collection")

Execution: bundle products in Shopify, bundle selector on product pages, post-purchase email references bundle pricing.

### 3. Reframed Anchor (vs. premium aftermarket bracelets)
Stop comparing to deployant clasps. Compare to the cost of swapping your bracelet to one with built-in micro-adjust.

Copy direction: *"$300–500 to swap your bracelet for one with micro-adjust. $40 to keep the strap you already love. Same fit precision either way."*

Execution: product page headline + first paragraph, ad copy, welcome email 3, anchor comparison video, creator brief.

### 4. In-Box Card
Physical card in every order. "$29 for your next buckle. 30-day expiry." Unique discount code.

Execution: Canva design → Moo.com print → Klaviyo day 7 reminder + day 25 last call. Target redemption: 25%+.

### 5. Collector's Promise — **cut from this plan** (see Decisions #6)

---

## Workstream 2 — Creator Program (volume + UGC engine; kicks off week 1)

Creators are a major top-of-funnel + UGC channel for this campaign. **This workstream launches in week 1 alongside everything else.** It is not a later phase. Without it, paid retargeting starves on creative within ~30 days and the volume goal slips by a quarter.

The infrastructure for managing creators is its own engineering work plan: see [`specs/strategy/creator-program.md`](./creator-program.md). That plan covers schema, outreach pipeline, sample shipment tracking, per-creator discount codes, post detection, asset capture, and stats refresh.

This campaign needs the creator program for three things:

1. **UGC at scale** for ad creative rotation (especially Meta retargeting) — Tom's solo shoots are foundational; creator deliverables are the volume layer. The campaign cannot rely on Tom-only content beyond week 4.
2. **Top-of-funnel awareness** via creator-posted organic content — independent of paid Meta. Doesn't require buying impressions and is one of the primary levers on the volume goal.
3. **Per-creator attribution** via Shopify discount codes — closes the loop from creator post → site visit → order, in the same attribution surface as landing page variants and paid channels.

### What this campaign needs from the creator work plan

| Creator work plan phase | Required for this campaign? | When |
|---|---|---|
| Phase 1 — Schema & data import (735-creator CSV → DB) | **Required** | Week 1 |
| Phase 2 — Admin UI read views | **Required** | Week 2 |
| Phase 3 — Outreach pipeline (status, followups, burned list) | Helpful, not blocking | Week 4+ |
| Phase 4 — Shopify sample integration + discount code generation | **Required** for attribution | Week 3 |
| Phase 5 — Post detection (YT polling + IG via Apify) | **Required** for measurement | Week 4 |
| Phase 6 — Asset capture, stats refresh, polish | Helpful, not blocking | Month 2+ |

If Decision #7 = compress, these required phases ship in 3 weeks. If Decision #7 = existing cadence, the campaign uses manual creator tracking (the existing CSV in a spreadsheet) for the first 6–8 weeks and paid retargeting hits creative fatigue.

### Campaign-side outreach plan (Tom-driven, regardless of Decision #7)

- **Note — outfitter-reviewers belong to a separate motion, not the
  creator program.** The ~8 named customers in [[personas]]
  "Outfitter-reviewers" table (e.g., markus.dinkel@liveramp.com,
  $443 / 12 units / 5★) are existing buyers who already review
  organically. They feed a *customer advocate / testimonial /
  referral motion* (lives in [[retention-loop]] `advocate` stage)
  — distinct from creator outreach, which targets people with
  audiences. Don't seed Wave 1 outreach with this list.
- **Wave 1 (week 1):** top 50 creators by cross_platform_fit_score, prioritizing IG+YT multi-platform (104 candidates in the existing dataset)
- **Sample bundle:** product + auto-generated 15% discount code (single-use-per-customer) + in-box card
- **Brief:** "Fix the fit on the watch you've been talking about." One piece of content (Reel/Short or feed post). Fitwell handle in mention + code in caption. **Rights tier: paid_30d** so we can repurpose in Meta retargeting.
- **Cadence:** 10 outreach DMs/emails per week, Tom-managed (the system logs responses; sends from Tom's accounts in v1)
- **Burn rule** from the underlying work plan applies (12-month exclusion after ghost or decline)
- **First UGC expected by week 3**, ready for retargeting creative rotation by week 4

### Creator program ↔ rest of campaign

- **→ Paid retargeting:** detected creator posts with `rights_tier ∈ (paid_30d, paid_90d, perpetual)` become eligible Meta creative assets; top performers extend rights
- **→ Email:** creator posts feed social-proof modules in the welcome series and abandoned cart emails
- **→ Landing pages:** top creator quotes/clips embed on landing page variants as proof points
- **→ Attribution:** per-creator discount codes attribute revenue directly via `discount_code.attributed_revenue_cents` — no UTM dependency
- **← Email D14 reply segmentation:** if customer list skews 6+ watches, prioritize watch-roll creators in next outreach wave

### Out-of-scope for this campaign (handled by creator work plan if/when shipped)

- AI-generated outreach copy (manual Tom-written DMs in v1)
- Sending DMs/emails from inside the app (log responses only in v1)
- Asset rights enforcement beyond display warnings
- TikTok auto-detection (manual entry only in v1)
- Carrier delivery confirmation (manual "mark delivered" toggle)

---

## Workstream 3 — Destination Pages (where all traffic lands; ships week 1–2)

### The model

Every Fitwell-controlled destination is a Shopify Page (or product) authored from this repo and published via the Shopify Admin API. Each page adds the same SKU to cart. UTMs encode the variant ID. The existing `landing_site` capture on every order means we get variant-level attribution back through the admin dashboard with no new vendor.

Three destinations live in this campaign:
- **Existing product page** — keep, becomes a universal-updates control
- **Existing landing page** (where most conversion currently happens) — keep, becomes the second control
- **1–2 new landing page variants** — net new, A/B tested against the controls

### Universal updates (apply to existing pages, not A/B tested)

- Guarantee badge near add-to-cart
- Reframed anchor in first paragraph
- Bundle selector
- Size finder CTA above the fold

### Variant proposals — Greg picks 2 of 3 in the meeting

**Variant A — "The Watch Wearer's $40 Fix" (Hormozy-style direct response)**
- **Primary persona:** P2 Engaged Curator (per [[personas]])
- **Target funnel stage:** `solution_aware` → `considering` (per [[funnel]])
- **Tests hypothesis:** H1 (awareness game) + H5 (problem-framing wins for problem-aware traffic), and indirectly H8 (P2 multi-touch — does Variant A close cold visits or do they need to come back?)
- Hero: *"Your $5,000 watch fits like a $50 watch. Here's the $40 fix."*
- Long-form. Problem agitation → mechanism demo → anchor comparison → 60-day guarantee → value stack (free shipping, in-box card, fits any strap, size finder) → testimonials → FAQ → urgency on the in-box reorder card.
- **Audience:** Meta cold awareness traffic + creator post bio links from large-follower creators.
- **Hypothesis:** maximizing perceived value relative to risk and effort produces the highest CVR on cold traffic.

**Variant B — "For Collectors Who Notice" (Godin-style identity)**
- **Primary persona:** P1b Deep Collector (with P1a Watch Advocate as secondary)
- **Target funnel stage:** `brand_aware` → `considering`
- **Tests hypothesis:** H2 (collectors over-index on revenue) + H4 (warm traffic shortcut)
- Hero: *"Most people don't notice their watch fits wrong. The people who notice tend to own more than one."*
- Short. Story-led. Sets up a tribe — invites the right people in, doesn't push.
- No price battle, no value stack. Product positioned as a signal of collector identity.
- **Audience:** Meta retargeting + lookalikes of existing customers + creator post bio links from niche-watch creators.
- **Hypothesis:** identity framing produces higher AOV and 90-day repeat rate, even if first-touch CVR is lower.

**Variant C — "There's a Hole Between Too Tight and Too Loose" (problem-first minimalist)**
- **Primary persona:** P5 Comfort Buyer
- **Target funnel stage:** `problem_aware` → `solution_aware` → `considering` (short urgent path per [[funnel]] P5 expected path)
- **Tests hypothesis:** H5 (problem-framing wins for problem-aware traffic)
- Hero: the literal sentence. Single image: wrist with strap on too-tight hole, then too-loose hole.
- One promise, one mechanism, one CTA.
- **Audience:** people who clicked the "too tight / too loose" awareness ad — already problem-aware. Add: organic problem-search traffic ("watch strap too tight", "wrist swells watch") per [[funnel]] `problem_search_organic` channel — currently weakly served and a real opportunity for cheap entry.
- **Hypothesis:** for problem-aware traffic, less copy converts better.

**Recommendation:** Variants A + B. They bookend two opposing conversion philosophies (direct response vs. identity), and they target the **two largest persona pools** in [[personas]] Distribution (P2 Curator = 16.6% / largest *repeat-capable*; P1 Outfitter+Curator combined drive ~40% of revenue). Variant C is cheaper but P5 is a smaller segment with shorter LTV ($47/cust per Single Buyer baseline); defer unless paid problem-search is added to the channel mix.

Every published variant must also have a registry entry in [[landing-page-goals]] with its `page_goal_stage` and `page_target_persona` PostHog properties matching the declaration above.

### A/B test discipline

- **Serial, not parallel.** Two-arm tests need ~30–50 conversions per arm to detect a 20% lift. At current order volume that's weeks per test. Running multiple tests in parallel will leave us underpowered everywhere.
- **90-day LTV is the win condition**, not first-touch CVR.

---

## Workstream 4 — Content Sprint (Tom solo; seeds creative pool weeks 1–4)

Tom's solo content is the foundational creative pool. Creator UGC (Workstream 2) supplies the volume layer from week 4 onward.

### Session 1: Problem + Mechanism (2 hours, solo, week 1)
Phone on tripod, macro, window light, clean surface.

1. **Problem video** — wrist, standard buckle, too tight → too loose → "There's a fix." → cut to Fitwell. 15 seconds. Cold awareness engine.
2. **On-wrist adjustment closeup** — one-handed micro-adjust loop. 10 seconds.
3. **Multi-strap compatibility montage** — 5 strap types. 15 seconds. Kills "will it fit my strap" objection.
4. **Large wrist demo** — strap maxed → M4 installed → room to breathe. 15 seconds. M4 awareness.

### Session 2: Lifestyle (2 hours, solo, week 3)
Real environments, phone stabilizer.

1. **Car version** — driver's seat, glance, adjust, out.
2. **Meeting version** — outside a door, adjust, walk in.
3. **Watch roll version** — multiple watches, picking one, adjusting buckle to fit. Speaks to the collector.

### Session 3: Direct to Camera (1 hour, solo, week 4)
Clean background, eye level.

1. **Talking head FAQ** — 3 objections, 30 seconds: "Does it fit any strap?" / "How hard to install?" / "What size do I need?"
2. **Anchor comparison** — "A premium aftermarket bracelet with micro-adjust runs $300–500. This does the same thing for $40 on the strap you already own." 20 seconds.
3. **Guarantee ad** — "Wear it 60 days. If it's not the best $40 you've spent on your watch, I'll refund every penny and you keep the buckle." 15 seconds. Standalone conversion ad.

### M4-specific angles (existing footage + 1 new shoot)

1. **Deployment clasp loyalist** — "Love your clasp. Hate the fit. The M4 adds micro-adjust to the hardware you already have."
2. **Buckle loyalist** — "Keep the buckle you love. Fix the fit."
3. **Large wrist** — "Run out of strap?"

---

## Workstream 4.5 — Organic Social (Fitwell brand accounts; daily aspiration, compass not contract)

Brand-owned organic posting on Fitwell's IG, TikTok, and YouTube.
All three accounts exist with Tom-access as of 2026-06-03; posting
cadence is thin. This workstream brings them into the 360 because
(a) the W4 / W2 production pipelines are already producing
footage and UGC at marginal-zero cost to re-cut, and (b) Tom's
validated workflow is **organic-first, then promote winners as
paid creative** — so the brand feed sits structurally upstream of
paid Meta creative selection.

**Operating philosophy:** the doc is a guiding light, not a quota.
Daily posting is the *aspiration*. A sustainable cadence Tom can
hold in a bad week is the *floor*. Ship the floor; everything
above is bonus. A 3-day-on / 4-day-silent rhythm in a busy week
beats a 7-day burst followed by 3 silent weeks. If the
shipping rate slips below the floor for 2+ weeks, debrief and
restart at floor — don't sprint to catch up.

### What's worked organically (validated 2026-06-03) — and what to test alongside it

Three Tom-shot organic pieces have performed well enough to be
promoted to paid creative. They share a common format — captured
below as **one validated baseline, not the format every new piece
must match.** "Tom hasn't tried it yet" is not evidence that
something won't work; the strategy backlog ([[personas]] copy
overlays, [[hypotheses]] H1–H13, [[vocabulary-map]] persona
clusters, the bracelet-envy hook, P5 comfort-pain content, anchor
reframes, founder-bio framing, founder-told-stories) is full of
untested angles that should get cheap organic experiments. Bias
the calendar toward a mix: ~60% in the proven format, ~40%
deliberate deviations to surface new patterns. Revisit the mix as
deviations win or lose.

1. **Coffee + wrist.** Tom seated with coffee; shakes wrist
   (loose), adjusts (tight), cutaway to tabletop mechanism
   demonstration, back to settled wrist. On-screen arc: *"Watch
   straps don't actually fit"* → *"Micro adjust on or off the
   wrist, no tools"* → *"Comfort without compromise"* → Fitwell
   logo.
2. **Wrist swells during the day.** Tom at a desk; pulls away from
   typing to adjust, returns to keyboard, mechanism closeup, back
   to keyboard. On-screen arc: *"Your wrist size changes throughout
   the day"* → *"Straps don't"* → *"One hole is too tight, the next
   is too loose. Not any more"* → Fitwell logo. Often pairs with a
   tail card on the M4 mechanism closeup: *"Micro adjust, no tools,
   half hole precision"* → Fitwell logo.
3. **Founder talking head.** Tom direct to camera, ~40s. Names the
   problem ("one hole too tight, the next too loose, wrist changes
   through the day"), names the false choice ("live with the
   compromise, or punch a new hole where it was never meant to
   be"), introduces Fitwell as the resolution; mechanism cutaway
   mid-monologue. Closes: *"Once you wear it, you stop thinking
   about how it fits. That's kind of the point."*

**Pattern that runs through the three winners (worth keeping as
the baseline; deviate consciously):**

- **Tom is in the post.** Either on-camera or, at minimum, the
  wrist is his — not stock, not a generic hand.
- **Live demonstration of the problem before the solution.** Open
  on the discomfort or the moment of adjustment, not on the
  product.
- **Mechanism cutaway mid-piece.** 2–4s closeup of the micro-adjust
  in operation. The proof beat.
- **On-screen text arc, not VO-heavy.** Three or four overlay
  beats: name the problem → name the constraint → name the
  resolution → Fitwell logo. Spoken VO is optional and Tom-only
  when present.
- **Fitwell logo closes every piece.**
- **Repeated vernacular:** *"micro adjust"*, *"no tools"*, *"half
  hole precision"*, *"comfort without compromise"*, *"one hole too
  tight, the next too loose"*.

**What the winners haven't tested (so any of these could be the
next win — deliberately put some of each in the rotation):**

- **Price-naming in organic.** $40, bundles, anchor reframes
  ($300–500 bracelet swap, $80–200 deployant). Conventional wisdom
  says cold organic shouldn't sell — but our wisdom is one shop's
  experience. Worth one test post per anchor.
- **CTAs and discount codes.** "Link in bio", limited-window
  offers, in-box card reminders.
- **Founder bio framing.** *"I'm Tom — I make Fitwell"*-style
  opens. Different from Tom-as-presence; explicitly states the
  relationship.
- **Customer-told stories instead of Tom-told.** A post that's
  *about* a specific customer (with permission) — vintage-watch
  restorer, OCD-about-fit collector, comfort-pain sufferer.
- **Static photo carousels** (no Tom video) on IG feed — different
  format entirely, different algorithm. Untested.
- **Comparison/listicle formats** ("3 watches that need a Fitwell"
  / "before and after"). Untested.
- **Reaction / commentary posts** to watch-content current events
  (new releases, comparisons by other creators).
- **Long-caption posts** with no video at all — text-led brand
  storytelling.

The cleanest mental model: **organic posts are short stories.**
That's the baseline. But some stories sell, some stories pitch,
some stories explain. Try multiple shapes; the audience tells you
which ones work for Fitwell.

When a post earns strong organic engagement (whether it follows
the baseline pattern or deviates from it), the variant becomes the
next paid creative test (per the Sourcing Loop below).

### Content pillars

The menu, not a schedule. Pick what's ready to shoot/write that
day. Each post declares primary persona + funnel stage (per
[[event-taxonomy]]). Aim to touch each pillar at least once a
fortnight; don't grade yourself on it.

| # | Pillar | Persona × Stage | Source |
|---|---|---|---|
| 1 | Problem-naming | P4/P5 × `unaware`→`problem_aware` | [[vocabulary-map]] P5 cluster; *"between holes"* hook |
| 2 | Mechanism demo | All × `problem_aware`→`solution_aware` | W4 Session 1 footage re-cut |
| 3 | Anchor reframes | P2 × `solution_aware`→`brand_aware` | Decision #1 bracelet-swap anchor; deployant secondary |
| 4 | Bracelet-envy | Cross-persona overlay × `solution_aware`+ | Verbatim *"Micro adjust on bracelets... should exist on straps"* — highest-leverage untested hook per [[personas]] |
| 5 | Collector identity / outfitting | P1/P2 × `brand_aware`→`considering` | The 360 organising idea; watch-roll content; named-watch use cases |
| 6 | Social proof / advocate cuts | All × `considering` | [[personas]] Outfitter-reviewers table; Judge.me reviews |
| 7 | Founder voice | P1a/P1b × trust-building | Tom on-camera: workshop, shoot day, decisions, brand history |

### Sourcing loop

- **W4 footage → organic feed first, paid second.** Session 1/2/3
  cuts vertical for IG / TikTok / YT Shorts *before* any paid
  promotion. The organic-winners-become-paid pipeline depends on
  this sequencing.
- **W2 creator UGC** (`rights_tier ∈ paid_30d`+) **→ reposted with
  permission** on the Fitwell feed. Adds brand social proof and
  rewards the creator with brand-account exposure.
- **Judge.me reviews → static / voiceover posts.** Pillar 6 source,
  drawn from the existing `review` table (W9 Phase 5 — already
  shipped). The 8 named outfitter-reviewers in [[personas]] are
  the warm seed.
- **Organic winners → W6 paid creative.** Top-decile save/share in
  the trailing 30d becomes a paid creative test within 7–14 days.
  This loop closing is the workstream's main justification — it
  means the paid pool is pre-validated for free.

### Cadence

**Floor (don't drop below; this is the contract):** 3 posts/week
IG, 3 posts/week TikTok, 1 YT Short/week.

**Aspiration:** ~daily IG (Reels-leaning), cross-cut to TikTok;
1 YT Short/week; 1 YT long-form/month starting month 2.

Tom decides per week which mode he's in. No retro-grading. No
sprint-to-catch-up after a slow week.

### Measurement

Per-platform engagement matters as a leading indicator;
**the real grading rubric remains 90-day LTV by
`referrer_source=social` cohort** (consistent with the rest of
the 360). Several metrics depend on PostHog client-side
instrumentation (W6 in PRIORITIES) — until that lands, run on
platform-native analytics and accept the attribution gap.

| Metric | Frequency | Target |
|---|---|---|
| Posts shipped vs 3/3/1 floor | Weekly | Meet the floor |
| Save rate per post (IG/TikTok) | Per post | >2% benchmark; track top decile |
| Organic-winner → paid promotion | Monthly | 50%+ of organic winners tested as paid |
| `referrer_source=social` sessions | Weekly | Trend positive — gated on PostHog install |
| 90-day LTV, social-sourced cohort | Monthly | Compare to $76 baseline ([[personas]] Distribution) — gated on PostHog install + cohort maturity |

### Engineering scope

Minimal. Most lift is on Tom.

- Channel entries added to [[funnel]] (`organic_tiktok`,
  `organic_youtube_shorts`, `organic_youtube_longform`;
  `organic_meta` clarified as IG) — done in this change.
- **Future:** split `referrer_source` enum into
  `instagram` / `tiktok` / `youtube` for cleaner per-channel
  cohorting. Today the property is a single `social` value (per
  [[event-taxonomy]]). Defer until volume justifies.
- **Future:** small admin view surfacing the 8 outfitter-reviewer
  rows for Pillar 6 picking. No new schema — reads from the
  existing `review` table joined to `customer`.

### Sustainability rules (the actual contract)

1. **Floor is the contract; ceiling is the aspiration.** Bad-week
   floor protects the brand from burst-and-silent.
2. **One pillar per post.** Don't try to serve P2 collectors and P5
   comfort buyers in the same artifact (per [[funnel]] anti-pattern).
3. **Every post tagged persona + stage.** Even internal-note level.
   Untagged posts pollute analytics later.
4. **Organic-first, paid-second on creative.** No paid creative
   test until a similar hook has run organically and either won
   (promote) or signalled cleanly (iterate).
5. **Repurpose freely.** Same hook across IG Reel / TikTok / YT
   Short, same or staggered day. Don't insist on platform-native
   production beyond what the algorithm actually rewards.
6. **If posting dies 2+ weeks, debrief — don't sprint to catch up.**
   Restart at floor.

---

## Workstream 5 — Email (Klaviyo; rewrites + new flows ship week 1–3)

Klaviyo is live. The **welcome flow is the only confirmed running
flow** (Tom 2026-05-26) and it's doing real acquisition work —
**+27.6% LTV lift over baseline** ($92.06 vs $72.12) per the
`scripts/klaviyo-acquisition-vs-retention.ts` analysis. The
abandoned-cart rewrite below assumes a 1-email cart flow exists
(unverified — confirm in pre-launch audit; build from scratch if
not).

**Post-purchase flows are NOT currently running.** The measured
post-purchase Klaviyo retention contribution is **$551 across 5
orders in the entire Nov 2025–May 2026 window** — i.e., effectively
zero. This is the highest-leverage gap in the entire 360 plan: we
have an email list and the welcome flow proves the list converts,
but the post-purchase nurture motion that the [[retention-loop]]
doc describes is unbuilt. Workstream 5 should be sequenced
accordingly: **post-purchase series is top priority within this
workstream**, ahead of rewrites.

### Rewrite — Welcome Series
- E1 (immediate): 15% code + guarantee reassurance. Subject: *"Your 15% off — and a promise."*
- E2 (day 2): Mechanism + size finder. Subject: *"30 seconds to find your size."*
- E3 (day 5): Social proof (creator quotes from Workstream 2) + reframed anchor. Subject: *"Keep your strap. Get the fit."*
- E4 (day 8): Bundle offer. Subject: *"Most collectors buy 3."*

### Rewrite — Abandoned Cart (expand from 1 to 3 emails)
- E1 (1 hour): reminder, no discount.
- E2 (24 hours): size objection + size finder.
- E3 (48 hours): guarantee offer.

### New — Post-Purchase Series
- D1: install guide + tips
- D7: in-box card reminder
- D14: "How many watches do you own?" — reply segments the customer (segmentation feeds back into creator outreach prioritization)
- D21: Judge.me review request
- D25: last call on in-box card discount
- D30: collection upsell (segmented from D14 reply: 1–2 watches → single reorder, 3–5 → 3-pack, 6+ → 5-pack)

### New — Win-Back (60–90 days post-purchase, no second order)
- D60: "Still only have one?" — collection angle
- D75: new finish / limited edition if available
- D90: best offer

### New — M4 Cross-Sell (for M1 buyers, day 45)
- "You fixed one strap. What about the one with a deployment clasp?"

---

## Workstream 6 — Paid Channels (Meta + Google; launches week 3)

Meta token and Google Ads API access are both approved as of this meeting. Paid channels launch in week 3 — not as the final phase, but as the volume amplifier that runs the rest of the campaign through. By week 3, the offer is locked (W1), creator outreach is in flight (W2), landing pages are live (W3), and creative is ready (W4).

> **Greg to update `specs/ops/PRIORITIES.md`** — both items still show as pending under "Analytics Extraction Pipeline." Mark Meta token approved and Google Ads API approved when you take ownership of this plan.

### Meta — three campaigns

**Retargeting (30% of Meta budget at launch — Decision #2)**
- Audience: site visitors 30 days, video viewers 50%+, page engagers. Suppress existing customers.
- Objective: Conversions.
- Creative rotation: guarantee ad, bundle offer, size finder CTA for product-page visitors, **creator UGC** (rights_tier ∈ paid_30d/paid_90d/perpetual — sourced from Workstream 2).
- KPI: 3:1+ ROAS.
- **Creative volume strategy:** Tom's solo shoots (Workstream 4) seed the first 2 weeks. Creator UGC takes over as primary volume from week 4 onward — without it, retargeting will hit creative fatigue inside 30 days.

**Awareness (50% of Meta budget at launch — Decision #2)**
- Audience: broad interest — watches, luxury accessories, EDC, whiskey, cars, high-end leather. 30–50, HHI $100K+, US.
- Objective: Reach / Video Views.
- Creative rotation: problem video, anchor comparison, compatibility montage, lifestyle.
- KPI: CPM under $12, video view rate above 30%. **Do not measure ROAS here.**
- **Primary lever on the volume goal.** This is what gets us from 5–8 to 30–40 daily orders.

**Consideration (20% of Meta budget at launch — Decision #2)**
- Audience: lookalike 1–3% from customer list + email list.
- Objective: Traffic / Landing Page Views.
- Creative rotation: guarantee ad, talking head FAQ.
- KPI: CPC, LP view-to-add-to-cart rate.

**Budget rebalance rule:** as the site visitor pool grows (driven by awareness + creator organic), retargeting share grows with it. Re-evaluate split monthly.

### Google — Brand Search + PMax

- **Brand Search** — already running, keep it.
- **PMax** — site visitors (90d), customer list, email list as signals. Assets: headlines/descriptions anchored against bracelet swap cost; images of product on wrist, mechanism, lifestyle; videos of problem video, mechanism loop, guarantee ad. Budget equal to Meta retargeting at start.
- **PMax discipline:** needs 30+ conversions to exit learning. Do not touch for the first 3–4 weeks.

---

## Engineering scope (Claude Code + Greg)

Marketing depends on this work landing. Some of it is mandatory; some is Greg's call. All of it ships concurrently with the marketing workstreams in weeks 1–3.

### Mandatory engineering (ships weeks 1–2)

1. **UTM / variant attribution wiring.** Extend the existing `landing_site` capture to parse variant ID, ad creative ID, landing page ID, creator code. Surface in the admin dashboard's Campaigns and Funnel pages so each variant's cohort can be compared on CVR, AOV, 90-day repeat rate, LTV. Without this, the A/B tests are unmeasurable and the 360 attribution story falls apart.
2. **Shopify Pages write client.** Admin API GraphQL client that creates and updates Shopify Pages from this repo. Idempotent on a `repo_page_id` metafield, draft vs. published state, dry-run mode, no destructive writes. Lets Claude Code author and version landing pages here, push to Shopify on merge.
3. **Admin dashboard cohort comparison view.** New view (or extension to Campaigns page) that compares variant cohorts side-by-side on the metrics that matter (CVR, AOV, 30-day repeat, 90-day LTV). Closes the loop from publication → traffic → conversion → repeat purchase. Surfaces creator-attributed revenue as a top-level cohort.

### Referenced work plan — creator-management-system.md

Workstream 2 (Creator Program) depends on a separate engineering work plan: `specs/strategy/creator-program.md`. For this campaign, Phases 1+2+4+5 of that plan are required (schema + import + read views + Shopify samples + discount codes + post detection). See Decision #7 for whether Greg compresses that work or runs it on the existing cadence — compression is the recommendation because creator program is on the critical path for the 360 launch, not an afterthought.

**Greg-decision dependencies from the creator work plan that this campaign forces a decision on:**
- Shopify Admin **write** scope (currently read-only) — required for auto-generating per-creator discount codes
- Apify account for IG stats refresh + post polling (~$1–2/month at expected volume)
- YouTube API key rotation (current key exposed in research transcripts)

### Greg's call — Decision #5

**Light (recommended for v1):** Claude Code drafts Klaviyo flow JSON, email copy, Google Ads RSAs, keyword/audience definitions. Tom or Greg pastes into the platform UIs. Ships fast (~2–3 weeks total for the whole campaign). Future automation is additive.

**Heavy:** Claude Code uses Klaviyo and Google Ads APIs to deploy flows and campaigns directly from this repo. No pasting. Pays off forever, but adds ~4–6 weeks of engineering before the campaign ships (Klaviyo write client, Google Ads write client, dry-run + safety guards, integration with the variant attribution code).

**The mandatory work above is the same either way.** The question is whether to build Klaviyo + Google Ads write clients now or later.

---

## Measurement framework

| Metric | Frequency | Target | Owner |
|---|---|---|---|
| Meta retargeting ROAS | Weekly | 3:1+ | Tom |
| Meta awareness CPM | Weekly | Under $12 | Tom |
| Blended ROAS | Monthly | 2.5:1+ moving to 3:1 | Tom |
| Site sessions | Weekly | 45K+/month by month 3 (to support 30–40 orders/day at 2%+ CVR) | Tom |
| Email list growth | Weekly | +300/month | Tom |
| CVR (by landing page variant) | Weekly | 2%+ by month 2 | Tom |
| AOV (by landing page variant) | Monthly | Back to $75+ | Tom |
| 30-day repeat rate (by acquisition variant) | Monthly | 30%+ by month 3 | Tom |
| 90-day LTV (by acquisition variant) | Monthly | Baseline → grow | Tom |
| **Daily orders** | Weekly | **5–8 (baseline) → 30–40 by month 3** | Tom |
| **Daily new customers** | Weekly | Same trajectory as above | Tom |
| Creator outreach sent | Weekly | 10/week sustained | Tom |
| Creator posts detected | Weekly | 5+/week by week 4 | Tom |
| Creator-attributed revenue | Monthly | Establish baseline → grow | Tom |
| Code redemption rate (per creator) | Monthly | Target 5%+ of post reach | Tom |
| Shopify Pages publishing health | Continuous | 0 failed writes | Greg |
| UTM capture coverage | Weekly | >98% of orders | Greg |

**The 90-day LTV cohort comparison is the campaign's grading rubric, not first-touch CVR.**

---

## Calendar (concurrent execution across all workstreams)

### Week 1 — all workstreams kick off
- [ ] **Pre-launch:** baselines into SCORECARD (Tom + Claude Code)
- [ ] **W1 Offer:** guarantee copy, anchor copy, bundle copy (Claude Code drafts → Tom approves)
- [ ] **W1 Offer:** bundle products in Shopify (Tom or Greg)
- [ ] **W1 Offer:** in-box card designed, ordered from Moo.com (Tom)
- [ ] **W2 Creator:** creator-management-system Phase 1 — schema + 735-creator CSV import (Greg + Claude Code, if Decision #7 = compress)
- [ ] **W2 Creator:** Wave 1 outreach drafted — top 50 creators by fit_score (Tom + Claude Code)
- [ ] **W3 Pages:** landing page variant copy drafted (Claude Code → Tom approves)
- [ ] **W4 Content:** Session 1 shoot — problem + mechanism + compatibility + large wrist (Tom)
- [ ] **W5 Email:** welcome + abandoned cart rewrites drafted (Claude Code) — paste pending Decision #5
- [ ] **Engineering:** UTM/attribution + Shopify Pages write client kickoff (Greg + Claude Code)

### Week 2
- [ ] **W2 Creator:** creator-management-system Phase 2 — admin UI read views live (`/admin/creators`)
- [ ] **W2 Creator:** Wave 1 outreach sent (10 DMs/emails); first samples shipped
- [ ] **W3 Pages:** landing page variants A + B (or whichever 2 selected) published as drafts via Shopify Pages write client
- [ ] **W5 Email:** Klaviyo welcome + abandoned cart live (paste or deploy depending on Decision #5)
- [ ] **W6 Paid:** customer list uploaded to Meta + Google
- [ ] **Engineering:** UTM/attribution wiring complete, Shopify Pages client complete

### Week 3 — paid channels go live
- [ ] **W6 Paid:** Meta retargeting launches (30% budget per Decision #2)
- [ ] **W6 Paid:** Meta awareness launches (50% budget — primary volume lever)
- [ ] **W6 Paid:** Meta consideration launches (20% budget)
- [ ] **W6 Paid:** Google PMax launches (frozen 3–4 weeks)
- [ ] **W4 Content:** Session 2 shoot — lifestyle
- [ ] **W5 Email:** post-purchase Klaviyo flow live
- [ ] **W2 Creator:** creator-management-system Phase 4 — Shopify sample + discount code generation live
- [ ] **W2 Creator:** first posts expected (samples delivered week 2 → 7–14 day turnaround)
- [ ] **W2 Creator:** Wave 2 outreach sent

### Week 4 — feedback loops engage
- [ ] **W4 Content:** Session 3 shoot — direct to camera
- [ ] **W6 Paid:** first retargeting ROAS read; rebalance budget if needed
- [ ] **W3 Pages:** first A/B variant decision (running serially)
- [ ] **W2 Creator:** creator-management-system Phase 5 — post detection live (YT polling + IG via Apify)
- [ ] **W2 → W6:** creator UGC rotated into Meta retargeting creative (first paid_30d assets)
- [ ] **Engineering:** admin dashboard cohort comparison view complete

### Month 2
- [ ] Win-back Klaviyo flow live
- [ ] M4 cross-sell Klaviyo flow live
- [ ] PMax evaluation at 30+ conversions
- [ ] Second A/B test live
- [ ] Creator Wave 3 + 4 outreach (target 40 creators with detected posts by end of month)
- [ ] Budget rebalance toward channels showing best volume × ROAS combination

### Month 3
- [ ] First 90-day LTV cohort analysis by acquisition channel + landing page variant + creator
- [ ] Scale Meta budget if blended ROAS healthy + daily orders trending toward 30–40
- [ ] Decide on Klaviyo / Google Ads heavy automation if light is the bottleneck
- [ ] Decide whether to spin out engineering scope into its own work plan (Decision #4 deferred until we see how the boundary feels in practice)

---

## Repo housekeeping

Mostly Greg's surface area (he owns the repo's engineering / docs
hygiene), but Tom can drive — Greg implements.

- [x] ~~Port the agreed version of this doc into `specs/work-plans/todo/`~~
  — instead, lives at `specs/strategy/360-campaign.md` as the
  master plan (Decision #4 resolved 2026-05-26).
- [x] ~~Promote creator-management-system to active~~ — moved to
  `specs/strategy/creator-program.md`.
- [ ] Update `specs/ops/PRIORITIES.md`: mark Meta token approved +
  Google Ads API approved under Analytics Extraction Pipeline. Add
  this 360 campaign and the creator-program work as active
  workstreams.
- [ ] If Decision #7 = compress, update `creator-program.md` to
  reflect the 3-week timeline for Phases 1+2+4+5.
- [ ] Add the variant attribution schema changes to
  `specs/current/schema.md` once the engineering design is finalized.
- [ ] If Shopify Pages write client lands, document the new
  integration in `specs/current/integrations.md`.
- [ ] Once Workstream 5 post-purchase series ships, update
  [[retention-loop]] `klaviyo_post_purchase` channel entry: status
  flips from "active operationally; weakly measured" to "active
  measured"; add the per-email UTM pattern.
- [ ] Once Wave 0 (outfitter-reviewer warm seed) closes its first
  conversations, capture learnings in [[creator-program]] and
  refresh [[personas]] "Outfitter-reviewers" table with outcomes.

---

## North Star

This is a 360 launch. Every workstream fires in week 1 and the channels feed each other through shared offer copy, shared creative pool, shared destinations, and shared attribution. No workstream is the "main one" and no workstream is a follow-up phase. The system either runs as a whole or it doesn't move the needle on either goal.

Two parallel goals:

1. **5–8 daily orders → 30–40 daily orders.** Volume. Cold paid acquisition, creator-driven organic reach, and new landing pages widen the funnel. Without this, no amount of LTV optimization gets us to the business plan.
2. **Trial buyer → collector.** Quality. Every trial buyer who becomes a collector is worth $200–400 over their lifetime versus $40 for a one-and-done. The offer stack, landing page variants, and email segmentation are what turn the volume into compounding revenue rather than one-and-dones.

The guarantee removes the risk of trying. The bundle makes collecting obvious. The in-box card creates the habit of coming back. The landing page variants test which pitch turns trial buyers into collectors fastest. The creator pipeline supplies UGC volume and per-creator-attributed top-of-funnel reach that no solo content plan can match — and is the only workstream that grows volume and quality at the same time. The email segmentation makes every message relevant to where someone is in their collection journey. The attribution wiring makes all of it measurable — by channel, by variant, by creator, by cohort.

Tom runs marketing with Claude Code handling copy, creative briefs, email drafts, page authoring, outreach drafts, and analysis. Greg builds the integrations that let Claude Code write directly to Shopify (pages + discount codes + samples) and — if Decision #5 lands heavy — to Klaviyo and Google Ads. The constraint is not headcount; it's coordination. Lock the offer. Launch everything in week 1. Let the feedback loops compound.
