# Fitwell Buckle Co — Integrated 360 Campaign
### Marketing plan + engineering scope · v2 (for Greg review, 2026-05-25)

---

## Context

Two problems, not one:

1. **Volume.** We're acquiring 5–8 customers/day. We need 30–40 to hit the business plan. That's a 4–6× lift in raw acquisition — not something offer-stack work alone can deliver. Top-of-funnel volume has to grow through cold paid acquisition, organic creator reach, and SEO-relevant landing pages.
2. **Quality.** Of those we do acquire, too many are trial buyers and not enough become collectors — CVR is climbing, AOV is falling, repeat rate is half what it should be.

This campaign attacks both. The offer stack, landing page variants, and email segmentation push trial buyers into collectors (quality). The creator pipeline + paid acquisition + new landing pages push the funnel wider (volume). Either lever alone is insufficient.

**Roles:**
- **Tom** — marketing (strategy, creative, channels, brand)
- **Greg** — builder (admin/analytics repo, integrations, infra)
- **Claude Code** — force multiplier on both sides; goal is to maximize the work it does so neither Tom nor Greg becomes a bottleneck

**Single organizing idea:**
> "One buckle changes how one watch fits. Fitwell changes how your whole collection fits."

Every page, ad, email, and offer ladders to this. First purchase is the entry point. The collection is the destination.

---

## Decisions for the meeting

These are the things to settle in the room. Everything downstream depends on them.

1. **Anchor framing.** Recommendation: "$300–500 to swap your bracelet vs. $40 to keep the strap you love." (Reframes against the *cost of bracelet replacement*, not against a hypothetical $300 deployant clasp that doesn't really exist on the market. The cheapest aftermarket micro-adjust deployants are ~$85; the "$300–500" anchor only holds for premium aftermarket bracelet upgrades, which is what we should name explicitly in copy.)
2. **Budget split at launch.** Given the volume goal (5–8/day → 30–40/day), retargeting can't dominate — at current site visitor volume, the retargeting pool is too small to absorb a 70% share without saturation. The earlier "70% retargeting / 30% awareness" recommendation only fits if quality were the only goal. With volume on the table too, the split needs to weight cold acquisition. Updated recommendation: **50% awareness / 30% retargeting / 20% consideration** at launch. Retargeting still ships first (cheapest creative validation), but its share grows as the visitor pool grows, not the other way around.
3. **Landing page variants — pick 2 of 3** (see "Landing page architecture" below). Existing landing page stays as the control.
4. **One artifact or two?** This doc currently bundles marketing strategy + engineering scope. Greg's call whether to keep it as one work plan in `specs/work-plans/todo/` or split into a marketing plan + a separate `shopify-content-publishing` engineering work plan.
5. **Klaviyo + Google Ads — light or heavy automation?** Greg's call (see "Engineering scope" below).
6. **Collector's Promise loyalty app.** Recommendation: **cut**. Adds a vendor (~$50–200/mo), an attribution surface the admin pipeline doesn't ingest, and complexity. In-box card already covers the "reason to come back" job.
7. **Creator program sequencing.** The campaign depends on the creator pipeline being usable in week 3–4 (UGC for retargeting creative, organic top-of-funnel reach, per-creator attribution). The detailed build is in `specs/work-plans/todo/creator-management-system.md` (6 phases). Greg's call: **compress** Phases 1+2+4 of that plan into ~3 weeks to unblock this campaign, or **run on existing cadence** and let the campaign use manual creator tracking (spreadsheets) until the system catches up.

---

## Phase 0 — Baselines (before anything else, ~1 day)

`specs/ops/SCORECARD.md` is mostly placeholders. We can't validate "+20–30% CVR" claims against a baseline that doesn't exist. Before shipping any offer changes:

- [ ] Pull last 90 days from Shopify into SCORECARD: CVR, AOV, return rate, 30-day repeat rate, monthly orders, monthly new customers
- [ ] Pull last 30 days from GA4: sessions, paid vs organic split, bounce rate, top landing pages by entrances and conversions
- [ ] Document current Klaviyo flow performance: open rate, click rate, attributed revenue for the 2 existing flows
- [ ] Identify which existing landing page is the highest-converting and tag it as the A/B control

Without these numbers, none of the tests below are falsifiable.

---

## Phase 1 — Offer stack (ship before any new ad spend, ~1 week)

These moves change the math on every dollar of traffic. Do them first.

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

Execution: product page headline + first paragraph, ad copy, welcome email 3, anchor comparison video.

### 4. In-Box Card
Physical card in every order. "$29 for your next buckle. 30-day expiry." Unique discount code.

Execution: Canva design → Moo.com print → Klaviyo day 7 reminder + day 25 last call. Target redemption: 25%+.

### 5. Collector's Promise — **cut from this plan** (see Decisions #6)

---

## Phase 2 — Landing page + product page architecture (~1 week, requires engineering)

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
- Hero: *"Your $5,000 watch fits like a $50 watch. Here's the $40 fix."*
- Long-form. Problem agitation → mechanism demo → anchor comparison → 60-day guarantee → value stack (free shipping, in-box card, fits any strap, size finder) → testimonials → FAQ → urgency on the in-box reorder card.
- **Audience:** Meta cold awareness traffic.
- **Hypothesis:** maximizing perceived value relative to risk and effort produces the highest CVR on cold traffic.

**Variant B — "For Collectors Who Notice" (Godin-style identity)**
- Hero: *"Most people don't notice their watch fits wrong. The people who notice tend to own more than one."*
- Short. Story-led. Sets up a tribe — invites the right people in, doesn't push.
- No price battle, no value stack. Product positioned as a signal of collector identity.
- **Audience:** Meta retargeting + lookalikes of existing customers.
- **Hypothesis:** identity framing produces higher AOV and 90-day repeat rate, even if first-touch CVR is lower.

**Variant C — "There's a Hole Between Too Tight and Too Loose" (problem-first minimalist)**
- Hero: the literal sentence. Single image: wrist with strap on too-tight hole, then too-loose hole.
- One promise, one mechanism, one CTA.
- **Audience:** people who clicked the "too tight / too loose" awareness ad — already problem-aware.
- **Hypothesis:** for problem-aware traffic, less copy converts better.

**Recommendation:** Variants A + B. They bookend two opposing conversion philosophies (direct response vs. identity), which makes the result decisive rather than incremental.

### A/B test discipline

- **Serial, not parallel.** Two-arm tests need ~30–50 conversions per arm to detect a 20% lift. At current order volume that's weeks per test. Running multiple tests in parallel will leave us underpowered everywhere.
- **90-day LTV is the win condition**, not first-touch CVR.

---

## Phase 3 — Creator program (parallel to Phases 1–2)

Creators are a major top-of-funnel + UGC channel for this campaign. The infrastructure for managing them is its own engineering work plan: see [`specs/work-plans/todo/creator-management-system.md`](./creator-management-system.md). That plan covers schema, outreach pipeline, sample shipment tracking, per-creator discount codes, post detection, asset capture, and stats refresh.

This campaign needs the creator program for three things:

1. **UGC at scale** for ad creative rotation (especially Meta retargeting) — Tom's solo shoots are foundational; creator deliverables are the volume layer. The campaign cannot rely on Tom-only content beyond the first 4 weeks.
2. **Top-of-funnel awareness** via creator-posted organic content — independent of paid Meta. Doesn't require buying impressions.
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

If Decision #7 = compress, these required phases ship in 3 weeks. If Decision #7 = existing cadence, the campaign uses manual creator tracking (the existing CSV in a spreadsheet) for the first 6–8 weeks.

### Campaign-side outreach plan (Tom-driven, regardless of Decision #7)

- **Wave 1 (week 1):** top 50 creators by cross_platform_fit_score, prioritizing IG+YT multi-platform (104 candidates in the existing dataset)
- **Sample bundle:** product + auto-generated 15% discount code (single-use-per-customer) + in-box card
- **Brief:** "Fix the fit on the watch you've been talking about." One piece of content (Reel/Short or feed post). Fitwell handle in mention + code in caption. **Rights tier: paid_30d** so we can repurpose in Meta retargeting.
- **Cadence:** 10 outreach DMs/emails per week, Tom-managed (the system logs responses; sends from Tom's accounts in v1)
- **Burn rule** from the underlying work plan applies (12-month exclusion after ghost or decline)
- **First UGC expected by week 3**, ready for retargeting creative rotation by week 4

### Creator program → ads loop

- Detected creator posts feed `creator_post` table
- Posts with `rights_tier ∈ (paid_30d, paid_90d, perpetual)` become eligible Meta retargeting assets
- Per-creator discount codes attribute revenue back through `discount_code.attributed_revenue_cents` (no UTM dependency — direct attribution surface)
- Top-performing creators by attributed revenue → larger samples + extended rights renegotiation

### Out-of-scope for this campaign (handled by the creator work plan if/when shipped)

- AI-generated outreach copy (manual Tom-written DMs in v1)
- Sending DMs/emails from inside the app (log responses only in v1)
- Asset rights enforcement beyond display warnings
- TikTok auto-detection (manual entry only in v1)
- Carrier delivery confirmation (manual "mark delivered" toggle)

---

## Phase 4 — Content sprint (2–3 shooting sessions, solo, ~5 hours total)

### Session 1: Problem + Mechanism (2 hours, solo)
Phone on tripod, macro, window light, clean surface.

1. **Problem video** — wrist, standard buckle, too tight → too loose → "There's a fix." → cut to Fitwell. 15 seconds. Cold awareness engine.
2. **On-wrist adjustment closeup** — one-handed micro-adjust loop. 10 seconds.
3. **Multi-strap compatibility montage** — 5 strap types. 15 seconds. Kills "will it fit my strap" objection.
4. **Large wrist demo** — strap maxed → M4 installed → room to breathe. 15 seconds. M4 awareness.

### Session 2: Lifestyle (2 hours, solo)
Real environments, phone stabilizer.

1. **Car version** — driver's seat, glance, adjust, out.
2. **Meeting version** — outside a door, adjust, walk in.
3. **Watch roll version** — multiple watches, picking one, adjusting buckle to fit. Speaks to the collector.

### Session 3: Direct to camera (1 hour, solo)
Clean background, eye level.

1. **Talking head FAQ** — 3 objections, 30 seconds: "Does it fit any strap?" / "How hard to install?" / "What size do I need?"
2. **Anchor comparison** — "A premium aftermarket bracelet with micro-adjust runs $300–500. This does the same thing for $40 on the strap you already own." 20 seconds.
3. **Guarantee ad** — "Wear it 60 days. If it's not the best $40 you've spent on your watch, I'll refund every penny and you keep the buckle." 15 seconds. Standalone conversion ad.

### M4-specific angles (existing footage + 1 new shoot)

1. **Deployment clasp loyalist** — "Love your clasp. Hate the fit. The M4 adds micro-adjust to the hardware you already have."
2. **Buckle loyalist** — "Keep the buckle you love. Fix the fit."
3. **Large wrist** — "Run out of strap?"

---

## Phase 5 — Klaviyo flows (~1 week, light automation)

Klaviyo is live. Two flows already exist; the work below is 2 rewrites + 3 new flows.

### Rewrite — Welcome Series
- E1 (immediate): 15% code + guarantee reassurance. Subject: *"Your 15% off — and a promise."*
- E2 (day 2): Mechanism + size finder. Subject: *"30 seconds to find your size."*
- E3 (day 5): Social proof + reframed anchor. Subject: *"Keep your strap. Get the fit."*
- E4 (day 8): Bundle offer. Subject: *"Most collectors buy 3."*

### Rewrite — Abandoned Cart (expand from 1 to 3 emails)
- E1 (1 hour): reminder, no discount.
- E2 (24 hours): size objection + size finder.
- E3 (48 hours): guarantee offer.

### New — Post-Purchase Series
- D1: install guide + tips
- D7: in-box card reminder
- D14: "How many watches do you own?" — reply segments the customer
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

## Phase 6 — Meta + Google campaign architecture (Month 1–2)

Meta token and Google Ads API access are both approved as of this meeting. Phase 6 can launch alongside Phase 1, not after.

> **Greg to update `specs/ops/PRIORITIES.md`** — both items still show as pending under "Analytics Extraction Pipeline." Mark Meta token approved and Google Ads API approved when you take ownership of this plan.

### Meta — three campaigns

**Retargeting (70% of Meta budget at launch)**
- Audience: site visitors 30 days, video viewers 50%+, page engagers. Suppress existing customers.
- Objective: Conversions.
- Creative rotation: guarantee ad, bundle offer, size finder CTA for product-page visitors, **creator UGC** (rights_tier ∈ paid_30d/paid_90d/perpetual — sourced from Phase 3).
- KPI: 3:1+ ROAS.
- **Creative volume strategy:** Tom's solo shoots seed the first 2 weeks. Creator UGC takes over as primary volume from week 4 onward — without it, retargeting will hit creative fatigue inside 30 days.

**Awareness (30% of Meta budget at launch)**
- Audience: broad interest — watches, luxury accessories, EDC, whiskey, cars, high-end leather. 30–50, HHI $100K+, US.
- Objective: Reach / Video Views.
- Creative rotation: problem video, anchor comparison, compatibility montage, lifestyle.
- KPI: CPM under $12, video view rate above 30%. **Do not measure ROAS here.**

**Consideration (introduced after retargeting ROAS proves out, ~week 4)**
- Audience: lookalike 1–3% from customer list + email list.
- Objective: Traffic / Landing Page Views.
- Creative rotation: guarantee ad, talking head FAQ.
- KPI: CPC, LP view-to-add-to-cart rate.

**Budget flip rule:** once retargeting hits 3:1 ROAS for two consecutive weeks, increase awareness budget toward a 40/40/20 split.

### Google — Brand Search + PMax

- **Brand Search** — already running, keep it.
- **PMax** — site visitors (90d), customer list, email list as signals. Assets: headlines/descriptions anchored against bracelet swap cost; images of product on wrist, mechanism, lifestyle; videos of problem video, mechanism loop, guarantee ad. Budget equal to Meta retargeting at start.
- **PMax discipline:** needs 30+ conversions to exit learning. Do not touch for the first 3–4 weeks.

---

## Engineering scope (Claude Code + Greg)

Marketing depends on this work landing. Some of it is mandatory; some is Greg's call.

### Mandatory — Phase 1 (~1 week)

1. **UTM / variant attribution wiring.** Extend the existing `landing_site` capture to parse variant ID, ad creative ID, landing page ID. Surface in the admin dashboard's Campaigns and Funnel pages so each variant's cohort can be compared on CVR, AOV, 90-day repeat rate, LTV. Without this, the A/B tests are unmeasurable.
2. **Shopify Pages write client.** Admin API GraphQL client that creates and updates Shopify Pages from this repo. Idempotent on a `repo_page_id` metafield, draft vs. published state, dry-run mode, no destructive writes. Lets Claude Code author and version landing pages here, push to Shopify on merge.
3. **Admin dashboard cohort comparison view.** New view (or extension to Campaigns page) that compares variant cohorts side-by-side on the metrics that matter (CVR, AOV, 30-day repeat, 90-day LTV). Closes the loop from publication → traffic → conversion → repeat purchase.

### Referenced work plan — creator-management-system.md

The creator program (Phase 3) depends on a separate engineering work plan: `specs/work-plans/todo/creator-management-system.md`. For this campaign, Phases 1+2+4+5 of that plan are required (schema + import + read views + Shopify samples + discount codes + post detection). See Decision #7 for whether Greg compresses that work or runs it on the existing cadence.

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

## Calendar

### Week 1
- [ ] Phase 0 baselines into SCORECARD (Tom + Claude Code)
- [ ] Write guarantee copy, anchor copy, bundle copy (Claude Code drafts → Tom approves)
- [ ] Bundle products in Shopify (Tom or Greg)
- [ ] In-box card designed, ordered from Moo.com (Tom)
- [ ] Engineering Phase 1 kickoff: UTM/attribution + Shopify Pages write client (Greg + Claude Code)
- [ ] Welcome + abandoned cart rewrites drafted (Claude Code) — paste pending light/heavy decision
- [ ] **Creator: Phase 1 schema + 735-creator CSV import (Greg + Claude Code, if Decision #7 = compress)**
- [ ] **Creator: Wave 1 outreach drafted — top 50 creators by fit_score (Tom + Claude Code)**

### Week 2
- [ ] Content session 1: problem + mechanism + compatibility + large wrist (Tom)
- [ ] Engineering: UTM/attribution wiring complete, Shopify Pages client complete
- [ ] Landing page variants A + B (or whichever 2 selected) published as drafts
- [ ] Klaviyo welcome + abandoned cart live (paste or deploy depending on Decision #5)
- [ ] Customer list uploaded to Meta + Google
- [ ] **Creator: Phase 2 read views live in admin (`/admin/creators`)**
- [ ] **Creator: Wave 1 outreach sent (10 DMs/emails); first samples shipped**

### Week 3
- [ ] Meta retargeting launches
- [ ] Meta awareness launches
- [ ] Google PMax launches (frozen 3–4 weeks)
- [ ] Content session 2: lifestyle
- [ ] Post-purchase Klaviyo flow live
- [ ] **Creator: Phase 4 Shopify sample + discount code generation live**
- [ ] **Creator: First posts expected (samples delivered week 2 → 7–14 day turnaround)**
- [ ] **Creator: Wave 2 outreach sent**

### Week 4
- [ ] Content session 3: direct to camera
- [ ] First retargeting ROAS read; if 3:1+ two weeks running, shift more budget toward awareness
- [ ] Admin dashboard cohort comparison view complete
- [ ] First A/B variant decision (running serially — pick winner, retire loser, start next test)
- [ ] **Creator: Phase 5 post detection live (YT polling + IG via Apify)**
- [ ] **Creator UGC rotated into Meta retargeting creative (first paid_30d assets)**

### Month 2
- [ ] Consideration campaign introduced (if retargeting healthy)
- [ ] Win-back Klaviyo flow live
- [ ] M4 cross-sell Klaviyo flow live
- [ ] PMax evaluation at 30+ conversions
- [ ] Second A/B test live

### Month 3
- [ ] First 90-day LTV cohort analysis
- [ ] Scale Meta budget if blended ROAS healthy
- [ ] Decide on Klaviyo / Google Ads heavy automation if light is the bottleneck
- [ ] Decide whether to spin out engineering scope into its own work plan (Decision #4 deferred until we see how the boundary feels in practice)

---

## Repo housekeeping (Greg, post-meeting)

These touch checked-in project state. Tom should not do these himself — Greg owns the repo and the priorities/work-plan structure.

- [ ] Update `specs/ops/PRIORITIES.md`: mark Meta token approved + Google Ads API approved under Analytics Extraction Pipeline
- [ ] Port the agreed version of this doc into `specs/work-plans/todo/fitwell-360-campaign.md` (or split per Decision #4)
- [ ] Add the variant attribution schema changes to `specs/current/schema.md` once the engineering Phase 1 design is finalized
- [ ] If new Shopify Pages write client lands, document the new integration in `specs/current/integrations.md`

---

## North Star

Two parallel goals:

1. **5–8 daily orders → 30–40 daily orders.** Volume. Cold paid acquisition, creator-driven organic reach, and new landing pages widen the funnel. Without this, no amount of LTV optimization gets us to the business plan.
2. **Trial buyer → collector.** Quality. Every trial buyer who becomes a collector is worth $200–400 over their lifetime versus $40 for a one-and-done. The offer stack, landing page variants, and email segmentation are what turn the volume into compounding revenue rather than one-and-dones.

The guarantee removes the risk of trying. The bundle makes collecting obvious. The in-box card creates the habit of coming back. The landing page variants test which pitch turns trial buyers into collectors fastest. The creator pipeline supplies UGC volume and per-creator-attributed top-of-funnel reach that no solo content plan can match. The email segmentation makes every message relevant to where someone is in their collection journey. The attribution wiring makes all of it measurable — by channel, by variant, by creator, by cohort.

Tom can run this with Claude Code handling copy, creative briefs, email drafts, page authoring, outreach drafts, and analysis. Greg builds the integrations that let Claude Code write directly to Shopify (pages + discount codes + samples) and — if Decision #5 lands heavy — to Klaviyo and Google Ads. The constraint is not headcount; it's sequencing. Baselines, then offer stack + pages + Klaviyo + creator program kickoff, then paid ads. In that order.
