# Personas

Last updated: 2026-05-26

> **Status: refined draft.** Reflects the Tom/Claude persona deep-dive on
> 2026-05-26, grounded in 110+ Judge.me reviews, trade-show observation,
> and current partnership economics. Still pre-instrumentation —
> persona distribution and LTV claims are hypotheses until PostHog
> cohort data and 12+ months of repeat-purchase data land. Refine
> against real traffic continuously.

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

## Vocabulary Map (first pass)

Distinctive language per persona, drawn from the 110+ Judge.me review
corpus. *Not perfectly exclusive* — "between holes" appears in both P2
and P5 reviews; vocabulary overlaps in practice. These highlight what
is most *characteristic* of each persona.

- **P1a/P1b Outfitter:** *"I own X already"*, *"ordering more"*, *"for
  all of my straps"*, *"just bought my 5th"*, *"outfitting"*.
- **P2 Curator:** brand-and-model specificity — *"my Omega Seamaster"*,
  *"my Sinn EZM2"*, *"my Citizen Mandalorian"*, *"favorite watch"*,
  *"comfort"*.
- **P3 Strap Hobbyist:** strap construction terms — Baranil, sailcloth,
  tropic, NATO, perlon; strap brand names; *"stack"*; finish-talk.
- **P4 Algo-Discovered:** *"saw an ad"*, *"social media ad"*, *"found
  Fitwell through..."*, *"scrolling"*.
- **P5 Comfort:** *"wrist swelling"*, *"weather"*, *"varies through
  the day"*, *"uncomfortable"*, *"warmer days"*.
- **Bracelet-Wearer overlay:** *"Glidelock"*, *"like my bracelet
  has"*, *"Pelagos clasp"*, *"T-fit"*.
- **OCD-About-Fit overlay:** *"OCD"*, *"particular"*, *"just so"*,
  *"perfect fit"*.

**Next step:** systematic frequency + exclusivity scoring across the
review corpus. Approximately a half-day task; outputs should feed
directly into ad creative briefs and landing-page copy.

## Distribution

We don't have validated traffic-or-revenue distribution data yet. The
prior gut-estimate table has been dropped because it was likely
misleading. **Replace with PostHog cohort data + Shopify customer
cohorting tagged by acquisition source once those are instrumented.**

What we *can* observe today, qualitatively:

- **24% month-over-month repeat purchase rate**, growing. Some
  exchange noise but most is real outfitting behavior. Strongly
  validates P1b Deep Collector outfitting LTV.
- **Delugs co-purchase volume is meaningful.** P3 Strap Hobbyist via
  partnership channel is proven, not theoretical.
- **Geography:** US largest, UK/EU/Canada strong, UAE producing
  wholesale orders, Korea/Singapore/Taiwan organic but small.
  NA + EU is the strategic focus.

## Open Questions

| Question | Why it matters | Owner | Target date |
|---|---|---|---|
| What does the 6-month LTV cohort look like by buyer cluster? | Validates whether top-20% outfitters dominate revenue and sets CAC ceiling | Greg | TBD |
| How does persona shift after first purchase? Do P2 Curators become P1 Outfitters? | Drives retention/email strategy and lifetime value model | Greg | TBD |
| What signals separate Tier-1 vs. Tier-2 vs. Tier-3 content consumers in PostHog? | Operationalizes the content-tier axis for targeting | Tom/Greg | TBD |
| Is "Watch-curious newcomer" a meaningfully distinct persona, or is it just early P2? | Affects whether we add a 7th consumer persona | Tom | TBD |
| What's driving the Korean and Singapore beachheads? | Could be a low-cost market template if traced | Parked — not a near-term focus | — |
| What's the trade-show afterglow ROI with geo-targeted retargeting? | Validates the post-show 2-week local-ad investment | Greg | After next trade show |
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
