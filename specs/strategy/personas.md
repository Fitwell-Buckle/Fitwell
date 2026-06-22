# Personas

Last updated: 2026-05-26

> **Status: data-validated draft.** Reflects the Tom/Claude persona
> deep-dive on 2026-05-26, grounded in 80 published Judge.me reviews,
> trade-show observation, current partnership economics, AND the
> Nov 2025 – May 2026 D2C cohort (824 paying customers, $61K revenue)
> joined to Judge.me reviewer emails on 2026-05-26. Persona
> distribution and segment behavior are now quantified, not gut-
> estimated. Mature-cohort LTV (Nov 2025) is one data point; refine as
> 2026 cohorts mature. PostHog content-tier signals still pending.

## Why Personas Matter Here

Personas are the rails on which everything else sits — product design,
landing page copy, ad creative, site architecture, partnership
strategy, PostHog event tagging. When personas are aligned, every
artifact targets a known audience at a known stage. When they're
vague, copy gets generic, ads spray, and analytics produce mush.

We use personas to answer "who is this for?" before "what does it say?"

## How to Use This Doc

- Every marketing artifact (page, ad, email, campaign) should name its
  target persona. If you can't pick one, the artifact is too generic.
- Personas evolve. The current set is grounded in what we've observed
  but not yet validated against cohort data. Real traffic, PostHog
  cohorts, and customer interviews refine it.
- When you add or change a persona, update this file in the same
  commit as the work that prompted the change.
- B2B and consumer personas live in this same doc because the same
  customer behavior (strap-tribe consumer becomes strap-maker partner
  becomes microbrand) keeps repeating across segments.

## Watch-Content Consumption Tiers

Content consumption is the most useful axis for separating consumer
personas. Four tiers:

- **Tier 1 — Deep.** Subscribes to 10–30+ channels. Watch content is a
  dominant hobby. Posts on Reddit / WatchUSeek / IG. Splits into:
  - **1a Active poster** (influence multiplier, advocate-class)
  - **1b Deep consumer** (watches everything, doesn't post)
- **Tier 2 — Regular.** Subscribes to some channels. Watch content is
  one hobby among many. Gets fed watch content via algorithm because
  they engage with it.
- **Tier 3 — Algo-fed.** No active subscriptions. Engages enough with
  watch content for social platforms to push more. Reachable purely
  through performance social.
- **Tier 0 — Non-content.** Search-led only. Lands on us via "watch
  strap between holes" or similar. Smaller volume, lower LTV per head.

Volume isn't the only dimension. **Content type** matters as much:
status-tribe content (Rolex / AP / Patek auction coverage) does not
indicate a buyer. Craft-tribe content (microbrand reviews, strap
content, value-watch reviews) does. A Tier 2 craft consumer is closer
to ideal than a Tier 1 status consumer.

## Consumer Personas

### P1a — The Watch Advocate
**Who:** Tier 1 content, active poster. Watches everything, talks
about everything. Has a public watch identity — Reddit handle, IG
account, maybe small-creator status.

**Pain:** Lived with mediocre clasps for years. Has tried multiple
solutions. Knows the off-the-shelf options are mediocre.

**How they find us:** Content creators they follow, forum discussion,
trade shows, peer recommendation, our outreach.

**What converts them:** Technical credibility, founder accessibility,
evidence we know the space. Price is a near non-issue.

**Outfitting behavior:** High — outfits a collection AND advocates to
others.

**Funnel entry:** Solution-aware. Short path to purchase.

**Why they matter beyond revenue:** Influence multiplier. Each
advocate-class buyer compounds into multiple P2/P4 conversions
downstream. Primary target of [[creator-program]].

---

### P1b — The Deep Collector
**Who:** Tier 1 content, deep consumer, quiet. Owns 6+ watches,
several on straps. May own a microbrand or vintage piece. Doesn't
post; lurks.

**Pain:** Has lived with the problem long enough to want better. Knows
what micro-adjust is.

**How they find us:** Content creators, blog mentions, forum lurking,
trade shows.

**What converts them:** Quality, finish, technical detail, founder
credibility. Price is not the issue.

**Outfitting behavior:** Highest LTV by units. Bulk-buys to outfit a
collection systematically — *"I own nearly a dozen"*, *"Just bought my
5th"*, *"will be getting these for all of my straps"* (all real
review quotes).

**Funnel entry:** Solution-aware. Short path.

---

### P2 — The Engaged Curator
**Who:** Tier 2 content. Owns 3–5 watches — a daily plus a rotation.
Bought their first nicer watch in the last 2–5 years. Mix of brands:
maybe a Tudor, an Omega, a microbrand, possibly an Apple Watch.

**Pain:** Notices comfort and precision issues. Particularly on the
specific watches they like but can't get to fit *just so*.

**How they find us:** Performance social (IG, FB, TikTok), YouTube
watch creators, podcast sponsorships, mid-tier creator partnerships.

**What converts them:** Clear value proposition, demonstration video,
social proof, named-watch use cases ("works great on my Seamaster").

**Outfitting behavior:** Moderate — may outfit 2–3 of their watches
over 6–12 months. Repeat-purchase candidate but not bulk.

**Funnel entry:** Problem-aware → solution-aware via discovery.

**Volume:** The largest reachable segment.

---

### P3 — The Strap Hobbyist
**Who:** Any content tier. *Strap* is the hobby; watches are vehicles.
Owns 1–3 watches but 10+ straps. Active in /r/Watchstraps, strap-maker
IG, Delugs / BluShark / Watchgecko / Crown & Buckle ecosystems.

**Pain:** Daily strap-switching surfaces fit inconsistencies. Stack
thickness of deployants annoys. Cares about strap leather, hardware,
aesthetics.

**How they find us:** Strap-maker partnerships (Delugs proven, WIS in
flight), strap-content social, ads targeting strap-hobby keywords.

**What converts them:** Strap-quality vocabulary (Baranil, sailcloth,
tropic), integration with premium straps, finish, slim profile vs.
deployant alternative.

**Outfitting behavior:** High — outfits straps rather than watches.

**Funnel entry:** Solution-aware.

**Reachable via:** Both direct social marketing AND partnership
channels. Do not under-invest in direct here just because partnerships
exist.

---

### P4 — The Algo-Discovered Buyer
**Who:** Tier 3 content — algo-fed, no active subscriptions. Owns 2–4
watches. Engages with watch content enough for the algorithm to push
more but not enough to call it a hobby.

**Pain:** Problem-aware, often not solution-aware until they see the
ad. Has a watch that doesn't fit right and has been tolerating it.

**How they find us:** Performance social ads (IG, FB, TikTok).

**What converts them:** Strong demonstration video, simple value
framing, social proof, low-friction trust signals.

**Outfitting behavior:** Lower than P1/P2 — typically start with one
fix. May convert to P2 behavior over time.

**Funnel entry:** Problem-aware. Long path; needs trust-building.

**Common entry mode:** Single-Watch-Fixer (see Funnel-Entry Modes).

---

### P5 — The Comfort Buyer
**Who:** Function-led. May or may not consume watch content. Chronic
comfort pain — wrist swelling from heat, edema, daily fluctuation;
between-hole sizing problems; sport-induced swelling.

**Pain:** Acute, physical, recurring. Has tried hole-punching, switching
straps, living with it.

**How they find us:** Search ("watch strap between holes", "watch
strap too tight", "wrist swells watch strap"), social ads framed
around comfort.

**What converts them:** Pain-relief framing. Demonstration that this
solves the *physical* problem, not a horological precision problem.

**Outfitting behavior:** Low — usually one or two units to fix specific
watches.

**Funnel entry:** Often unaware → problem-aware → solution-aware via
search or ad.

**Note:** Comfort-Pain-Triggered can be a *trigger* for P1–P4 as well.

## B2B Personas

### B1 — Strap Maker / Reseller
**Examples:** Delugs (proven partner), WIS (onboarding), UAE leather
buyer (250-unit order). Targets: JPM Straps, BluShark, Crown & Buckle,
Watchgecko, Veblenist, Hodinkee Shop, Aaron Bespoke.

**Decision-maker:** founder / owner.

**Sales motion:** outreach → sample → small wholesale order → scale.

**Cycle:** weeks.

**Volume:** 100s–1000s/yr per partner.

**Economics:** ~$15–16/unit wholesale, $40 retail. Partner margin
healthy enough to motivate.

**Pitch:** premium add-on that lifts their AOV with no SKU overlap
risk to their core strap business.

**Trade show:** WindUp and consumer-facing strap shows.

**Adoption is the constraint, not pricing or terms.**

---

### B2 — Watch Retailer
**Examples:** independent watch boutiques, multi-brand stores with
walk-in customer service.

**Decision-maker:** store owner.

**Sales motion:** *"You already have a hole punch — we're the elegant
version of that."* Display unit + walk-in fitting-room conversions.

**Cycle:** days to weeks (small test orders).

**Volume:** 10s–100s per store.

**Pitch:** fitting-room problem-solver, point-of-sale upsell, retail
margin, customer-experience upgrade.

**Trade show:** regional retail-side of consumer shows.

**Why this is real:** every retailer faces the between-holes problem
during fittings and currently solves it with a hole punch. The market
has already accepted that this problem needs a solution; we're just
the better tool.

---

### B3 — Microbrand Watch Brand
**Examples:** Christopher Ward, Formex, Sinn, Halios, Lorier, Baltic.

**Decision-maker:** founder / product lead.

**Sales motion:** trade-show meet → sample → custom-branded option or
default upgrade on strap-equipped models.

**Cycle:** months.

**Volume:** 1000s.

**Pitch:** strap-watch differentiator. Co-brandable. Available as
upgrade option or shipped-as-default on premium SKUs.

**Trade show:** WindUp and microbrand-friendly consumer shows.

---

### B4 — Established Watch Brand
**Examples:** Tudor, Omega, Tag Heuer, mid-major Swiss / Japanese
brands (aspirational).

**Decision-maker:** product / sourcing director.

**Sales motion:** extended pitch, quality validation, may route via
OEM channel rather than direct.

**Cycle:** quarters to year+.

**Volume:** 1000s–10,000s.

**Pitch:** premium strap upgrade option across their strap SKUs.

**Trade show:** Watches & Wonders.

---

### B5 — OEM Strap Manufacturer
**Examples:** Jean Rousseau and similar OEM strap-makers who supply
brands rather than selling D2C.

**Decision-maker:** business development / OEM sales lead.

**Sales motion:** integration as a default or optional buckle they
offer to their brand customers.

**Cycle:** months.

**Volume:** 1000s–10,000s.

**Pitch:** "your brand customers can spec this as the upgraded clasp"
— effectively a force-multiplier into B3/B4 personas via their
existing channel.

**Trade show:** EPHJ, Watches & Wonders B2B side.

---

### B6 — OEM Watch Manufacturer
**Examples:** full-service contract assemblers who build complete
watches for smaller brands.

**Decision-maker:** sourcing / product.

**Sales motion:** integrate as default or upcharge option in their
parts catalog.

**Cycle:** months to year+.

**Volume:** highly variable; potentially very large per win.

**Pitch:** differentiated component in their parts catalog; "every
strap watch built here can ship with this."

**Trade show:** EPHJ, Hong Kong Watch & Clock Fair.

## Copy/Positioning Overlays

Cross-cutting traits that drive copy variants but aren't standalone
personas. Apply across multiple personas.

### Bracelet-Wearer-With-Strap-Watches
A primed buyer who already owns a bracelet with micro-adjust
(Glidelock, Pelagos clasp, Tudor T-fit) and feels the absence when
they wear a strap watch. Doesn't need education on the value
proposition — they live with it on their bracelet daily.

**Copy hook:** *"Micro-adjust, for the rest of your watches."*

**Why this overlay matters:** Highest-leverage untested copy angle.
Currently absent from site and ad copy. Should be the headline of a
landing page A/B test.

### OCD-About-Fit
The fit-obsessive personality. Cuts across all personas. Recurring
review vocabulary: *"OCD about strap fit"*, *"like watches to fit just
so"*, *"particular with the fit"*.

**Copy hook:** precision and "just so" framing. *"Stop tolerating
not-quite-right."*

### Vintage-Watch Wearer
Owns 1950s–90s pieces on straps. Original clasps often worn, mediocre,
or already replaced. High craft sensitivity. Sub-segment of P1b/P2
with distinct content needs (vintage Hodinkee, Eric Wind, vintage
forum culture).

**Copy hook:** restoration and respect-the-original framing.

### Gift Buyer
Partner / parent / friend buying for someone in P1–P5. At $40 this is
a real seasonal channel. Currently underperforms because the gift
buyer doesn't know the recipient's strap width.

**Copy hook:** "the upgrade your watch person didn't know to ask for."

**Required infrastructure:** gift-card SKU. Without it, gift channel
will continue to underperform regardless of copy.

## Funnel-Entry Modes

How a persona arrives, not what they are. Any persona can enter via
multiple modes.

- **Single-Watch-Fixer.** Has one specific watch with a fit problem
  right now. Most common entry for P2/P4/P5. May expand to outfitting
  behavior later.
- **New-Watch-Just-Bought.** Recently bought a watch and is upgrading
  the strap experience. Entry for P1/P2.
- **New-Strap-Just-Bought.** Natural co-purchase moment. Strongest
  entry for P3; primary partnership-channel mode (Delugs co-purchase).
- **Comfort-Pain-Triggered.** Physical pain reached threshold. Primary
  entry for P5; cross-cutting for others.
- **Bracelet-Envy.** Owns a bracelet with micro-adjust and wants the
  same on their straps. Cross-cuts all personas; primed buyer.
- **Trade-Show-Discovered.** In-person demo converts on the spot, or
  captures intent for follow-up. Primary entry for some P1/P2.

## Pricing-by-Anchor Framing

Same product, $40 retail. **Different reference anchors per
persona/channel.** The framing lever, not the price lever.

| Persona / Context | Reference anchor | Copy direction |
|---|---|---|
| **P5 Comfort** | The cost of *not* solving the problem | *"$40 to make the watch you stopped wearing wearable again"* — anchor against the wasted watch, not other buckles |
| **P4 Algo-Discovered** | Don't anchor against price at all | Lead with demonstration. Price is incidental to value once they believe it works |
| **P2 Curator** | Deployant clasps ($80–200+) | *"Cheaper than a deployant, slimmer on the wrist"* |
| **P3 Strap Hobbyist** | Premium strap context ($150–300 strap) | $40 framed as a finishing upgrade to the strap they already bought |
| **P1a/P1b Outfitter** | Quality, finish, materials — not price | Don't lead with price. They're not comparing |
| **Any persona, defensive** | Avoid letting them compare to OEM tang buckles | Preempt by setting "the only micro-adjust solution for watch straps" |

Setting the comparison frame is the highest-leverage copy decision per
audience. The moment a buyer's mental anchor becomes a $5 OEM tang
buckle, the sale is lost regardless of product quality.

## Vocabulary Map

A systematic extraction of customer language by persona, with
frequency counts, exemplar quotes, and copy directions, lives in
[[vocabulary-map]]. That doc is the source of truth for persona-matched
copy — lift verbatim phrases from it when writing ads, landing pages,
or product descriptions.

Quick reference (full detail in [[vocabulary-map]]):

- **P1a/P1b Outfitter:** *"I own X already"*, *"ordering more"*, *"for
  all of my straps"*, *"just bought my 5th"*. ~9 reviews use outfitter
  signals.
- **P2 Curator:** brand-and-model specificity — *"my Omega Seamaster"*,
  *"my Sinn EZM2"*, *"my Citizen Mandalorian"*. *"Favorite watch"*
  appears in 6 reviews.
- **P3 Strap Hobbyist:** strap construction terms — Baranil, sailcloth,
  tropic, NATO; strap brand names; *"stack"*; deployant references
  (6 mentions).
- **P4 Algo-Discovered:** *"saw an ad"*, *"social media ad"*, *"found
  Fitwell through..."*.
- **P5 Comfort:** *"between holes / between sizes"* (7+ reviews, the
  dominant pain phrase); *"wrist expands and contracts"*; *"warmer
  days"*; *"smaller wrist"* / *"thick wrists"*.
- **Bracelet-Wearer overlay:** *"Micro adjust on bracelets... should
  exist on straps"* (verbatim customer quote — highest-leverage copy
  source).
- **OCD-About-Fit overlay:** *"OCD"*, *"particular"*, *"just so"*,
  *"precise fit requirements"*.

**Notable signal:** Rolex mentioned zero times in the corpus —
confirms the persona exclusion thesis.

## Distribution — D2C cohort, Nov 2025 → May 2026

D2C launched November 2025 (with preorders in Nov/Dec); the channel
ramped in earnest in January 2026. The window below covers the
entire D2C history to date.

**Data source:** Shopify "Orders over time" export joined to Judge.me
published-reviews export, both pulled 2026-05-26. N = 824 unique
paying customers, 996 orders, $61,307 in revenue. Wholesale and
non-D2C orders are excluded by the Shopify report. Methodology in
`scripts/persona-segments.ts` and `scripts/persona-reviews-join.ts`;
intermediate datasets in `data/customer-segments.json` and
`data/customers-with-reviews.json` (gitignored, contains PII).

### Behavioral segments — observed share of customers and revenue

Segments are defined by observable order behavior in the D2C window
(orders, units, AOV). They are proxies for the persona framework,
not the personas themselves — a P5 Comfort buyer and a P4
Algo-Discovered buyer both land in "Single Buyer" until further
signals separate them.

| Segment (rule) | Customers | % | Avg spend | % of revenue | Avg units | Persona mapping |
|---|---:|---:|---:|---:|---:|---|
| **Outfitter** — 3+ orders OR 5+ units | 47 | 5.7% | $242 | 18.7% | 6.3 | P1a Watch Advocate / P1b Deep Collector |
| **Curator** — multi-unit, $80+ AOV | 137 | 16.6% | $95 | 21.4% | 2.1 | P2 Engaged Curator |
| **Bulk Single** — 1 order, 3–4 units | 69 | 8.4% | $126 | 14.3% | 3.3 | P1 emerging, Gift Buyer overlay |
| **Single Repeat** — 2 orders, ≤2 units | 28 | 3.4% | $80 | 3.7% | 2.0 | P2 emerging / P4→P1 transition |
| **Single Buyer** — 1 order, 1 unit | 543 | 65.9% | $47 | 41.9% | 1.2 | P4 Algo-Discovered, P5 Comfort, Gift recipient |
| **Total** | **824** | 100% | $74 | 100% | 1.7 | |

**The Pareto is real and steeper than the framework anticipated.**
The top 30.7% of customers (Outfitter + Curator + Bulk Single) drive
**54.4% of revenue**. Outfitters alone — 5.7% of customers — drive
18.7% at $242/head and an average of 6.3 units each. P1b's "highest
LTV by units" claim from the original framework is now quantified.

**Single Buyer is larger than the framework anticipated.** At 65.9%
of customers, the one-buckle / one-order archetype is the volume
base. P2 Curator is the largest *repeat-capable* segment (16.6%), not
the largest segment overall. This re-frames where to invest: P2 is
the segment with the most room to grow LTV; Single Buyer is the
segment with the most room to grow volume.

### 6-month LTV — Nov 2025 cohort (only fully matured cohort)

| Cohort | Customers | Status | Avg LTV | Repeat rate | Units/cust |
|---|---:|---|---:|---:|---:|
| Nov 2025 | 20 | matured | $76.50 | 15.0% | 1.15 |
| Dec 2025 | 29 | near-matured | $97.60 | 17.2% | 1.24 |
| Jan 2026 | 107 | partial (5mo) | $91.87 | 16.8% | 1.24 |

**Working LTV baseline = $76 per acquired D2C customer at 6 months.**
Use this as the CAC ceiling for cold-acquisition channels until
2026-spring cohorts mature. Dec/Jan cohorts are trending higher
($90+), which suggests acquisition quality improved as the channel
matured, but those cohorts haven't completed their 6-month windows.

### Review behavior by segment — quantifies the advocate hypothesis

| Segment | Reviewer rate | Avg rating |
|---|---:|---:|
| **Outfitter** | **19.1%** (9 / 47) | 4.90 |
| Single Repeat | 14.3% (4 / 28) | 5.00 |
| Bulk Single | 4.3% (3 / 69) | 5.00 |
| Single Buyer | 3.7% (20 / 543) | 4.38 |
| Curator | 3.6% (5 / 137) | 4.40 |

**Outfitters review at 5× the rate of Single Buyers.** This is the
quantitative basis for the P1a Watch Advocate framing: they are
disproportionately the source of social proof. The review pipeline
is dominated by the heaviest 5–10% of buyers, so any motion that
converts P_curator → P1_outfitter compounds into more reviews → more
social proof → more conversions.

Note that **Curators have the *lowest* review rate (3.6%)**. They
buy, but they don't advocate — consistent with their behavior of
comparing and evaluating rather than identifying with the brand.

### Vocabulary distinctive to each segment (Judge.me corpus)

Lift over corpus baseline; minimum 2 mentions in segment.

- **Outfitter:** *"always", "comfort", "link", "quick", "clever"* —
  pragmatic, technical, about fit and convenience. Not status-talk.
- **Curator:** *"hits/spot", "adjustable", "overpriced"* + Italian/
  German tokens — actively *evaluating* value against alternatives.
  Multi-lingual cluster suggests EU concentration in this segment.
- **Bulk Single:** *"outstanding", "construction", "service",
  "customer", "company", "truly"* — vocabulary about the *company*
  and *founder touch*, not just the product. They're being converted
  by human-touch sales, not the product alone.
- **Single Repeat:** *"play", "steel", "stainless", "works",
  "comfortable"* — engineering-functional vocabulary.
- **Single Buyer:** *"try", "smaller", "tension", "hold", "specific"*
  — exploratory, problem-solving language. Matches P5 Comfort framing.

### Three concrete findings that change positioning

1. **The "Overpriced" 2-star review is a Curator.** The single
   negative review in the published corpus came from a P2-class buyer
   who anchored against a $5 OEM tang buckle rather than against the
   $80–200 deployant alternative the [pricing-by-anchor framing](#pricing-by-anchor-framing)
   prescribes. Direct evidence that the deployant-anchor framing must
   be deployed before more Curators see the price-only view.

2. **Bulk Single buyers' vocabulary suggests founder-touch sales are
   creating advocates.** They use "outstanding", "service", "company",
   "truly" — language about the *people*, not the product. The
   high-touch sales motion is generating disproportionate LTV
   ($126/customer at 8.4% of the base = 14.3% of revenue). Worth
   thinking about whether this is repeatable at scale.

3. **EU buyers cluster in Curator + Outfitter segments.** Italian
   and German vocabulary appear almost exclusively in the higher-end
   segments. Confirms "NA + EU is the strategic focus" — EU skews
   higher-value, comparative buyers.

### Acquisition channel by post-purchase LTV

First-order UTM source / referrer / campaign, paid customers only.
Top channels by total revenue:

| Channel | Customers | $/cust | Units/cust | Read |
|---|---:|---:|---:|---|
| Direct / unattributed | 305 | $76 | 1.90 | Mix of brand search, word of mouth, untagged Meta. Largest segment. |
| Search referrer | 264 | $66 | 1.64 | Organic search. Lower LTV — consistent with P5 Comfort search pattern. |
| Meta (paid) | 57 | $85 | 1.96 | Solid mid-LTV; this is the working acquisition lever. |
| Klaviyo (email) | 41 | $96 | 2.44 | **Highest LTV.** Welcome-flow acquisitions — these are people who gave us their email (most via on-site signup), received the welcome-flow discount code, and converted on their *first* order. Post-purchase Klaviyo flows then drive additional outfitting on top. |
| IG organic | 34 | $68 | 1.53 | P4 Algo-Discovered pattern. |

**Klaviyo is dominantly an acquisition channel — the welcome flow is
the engine.** A follow-up analysis (`scripts/klaviyo-acquisition-vs-
retention.ts`) split Klaviyo-touched orders by customer
order-sequence position:

- **Acquisition (welcome flow):** 64 orders / 64 customers /
  **$4,798 revenue = 89.7% of Klaviyo revenue.** Welcome-flow
  customers average **$92.06 total LTV vs $72.12 baseline = +27.6%
  lift.** The lift comes from order *size* (2.41 units/customer vs
  1.78 baseline), not from coming back more often (repeat rate is
  10.9% vs 10.0% baseline — essentially the same).
- **Retention (post-purchase flows):** 5 orders / 5 customers /
  $551 = only 10.3% of Klaviyo revenue. All are 2nd orders; no
  3rd+ orders attributed to Klaviyo. Post-purchase Klaviyo's
  measured contribution is small — either the post-purchase email
  program isn't doing much, or the second-and-beyond purchases ARE
  happening but customers are returning via direct/branded search
  rather than Klaviyo links. Worth investigating.

### Outfitter-reviewers — customer advocate / testimonial / referral candidates

Named *customers* who appear in both the top-spend cohort AND the
Judge.me review-leaver cohort. **These are not creators** — they
have no required reach, audience, or content motion. They're
existing happy buyers who already advocate organically through
reviews. Highest-likelihood targets for **customer testimonials,
case studies, referral-program seeding, and longitudinal customer
relationships** — distinct from the [[creator-program]] outreach,
which targets people with audiences.

| Spent | Orders / units | Email | Review |
|---:|---:|---|---|
| $443 | 2 / 12 | markus.dinkel@liveramp.com | 5★ "Clever and impressive" (came via Klaviyo + judgeme) |
| $315 | 2 / 8 | michael.mckelligan@gmail.com | 5★ "16 and 18mm Stainless Buckles" |
| $242 | 2 / 6 | pascal.glagla@icloud.com | 5★ "Amazing" |
| $240 | 5 / 6 | andrewdgreer@att.net | 5★ |
| $230 | 2 / 5 | alanpichardo@gmail.com | 5★ |
| $176 | 1 / 5 | pete@siggers.co.uk | 5★ "Does exactly what it says!!" |
| $176 | 1 / 5 | madelong@gmail.com | 4★ "Clever :)" |
| $121 | 3 / 3 | horloge@collector.org | 5★ "Happy customer" |

These are the natural targets for [[creator-program]] outreach.

### What remains qualitative

- **Delugs co-purchase volume is meaningful.** P3 Strap Hobbyist via
  partnership channel is proven, but not separately measurable in
  the D2C Shopify cohort (partnership orders route through Delugs).
- **Geography:** US largest, UK/EU/Canada strong, UAE producing
  wholesale orders (excluded from D2C data above),
  Korea/Singapore/Taiwan small. NA + EU is the strategic focus.

## Open Questions

| Question | Why it matters | Owner | Status |
|---|---|---|---|
| ~~What does the 6-month LTV cohort look like by buyer cluster?~~ | ~~Validates whether top-20% outfitters dominate revenue and sets CAC ceiling~~ | — | **Resolved 2026-05-26.** Working baseline: $76 LTV at 6 months for the Nov 2025 cohort. Outfitters (5.7% of customers) drive 18.7% of revenue at $242/head. See Distribution section. |
| How does persona shift after first purchase? Do P2 Curators become P1 Outfitters? | Drives retention/email strategy and lifetime value model | Tom | Partial — 28 customers visible in "Single Repeat" segment are the leading edge of this transition. Needs more time. |
| What signals separate Tier-1 vs. Tier-2 vs. Tier-3 content consumers in PostHog? | Operationalizes the content-tier axis for targeting | Tom | TBD — requires PostHog cohort instrumentation. |
| Is "Watch-curious newcomer" a meaningfully distinct persona, or is it just early P2? | Affects whether we add a 7th consumer persona | Tom | TBD |
| Can we surface the 36 reviewers whose emails didn't match a customer record? | Recovers ~45% more outfitter-class advocate candidates | Tom | TBD — needs fuzzy email/name match or older Shopify pre-D2C export. |
| What's driving the Korean and Singapore beachheads? | Could be a low-cost market template if traced | Parked — not a near-term focus | — |
| What's the trade-show afterglow ROI with geo-targeted retargeting? | Validates the post-show 2-week local-ad investment | Tom | After next trade show |
| What does B3/B4 conversion actually look like at trade shows? Where do deals stall? | Sharpens the B2B sales playbook | Tom | Ongoing |

## Related

- [[funnel]] — funnel stages, used alongside personas to target every
  artifact.
- [[hypotheses]] — beliefs about persona behavior worth validating.
- [[event-taxonomy]] — how persona is captured in PostHog events.
- [[landing-page-goals]] — every landing page declares its target
  persona.
- [[creator-program]] — tiered creator/ambassador program structure
  (lives in its own doc).
