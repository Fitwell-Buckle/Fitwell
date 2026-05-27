# Retention Loop — Post-Purchase Outfitting & Advocacy

Last updated: 2026-05-26

> **Status: working draft.** Created 2026-05-26 to give outfitting
> and advocacy their own framework. Previously `outfitting` was the
> last stage of the D2C [[funnel]]; it is moved here because (a) the
> motion is fundamentally different from acquisition, (b) the
> measurable mechanics are different (email sequences, repeat
> orders, review activity, in-the-wild advocacy), and (c) the
> current data (Nov 2025–May 2026 D2C cohort) shows it as a real,
> measurable loop with distinct levers. Refine as PostHog
> retention instrumentation lands.

## Scope

This loop covers the **post-first-purchase customer lifecycle** — from
a customer's first D2C order through outfitting their collection and
becoming an advocate.

- D2C acquisition (pre-first-purchase) lives in [[funnel]].
- B2B sales motion lives in [[b2b-pipeline]] (B2B has its own
  retention pattern modeled there, not here).
- This doc focuses on D2C consumer retention. Gift recipients and
  brand-partnership recipients enter this loop without going through
  the acquisition funnel.

## Why This Is a Loop, Not a Funnel

The acquisition funnel models a one-way progression toward a single
conversion event. Retention is fundamentally different:

- **No single endpoint.** A customer at the "outfitter" stage isn't
  "done" — they can become an advocate, churn out of the category,
  or stay dormant for years before re-activating.
- **Re-entry is the norm.** Klaviyo email re-engages dormant
  customers; trade-show appearances reactivate; a friend's question
  about their watch surfaces brand recall years later.
- **Compounding effects.** Each outfitter generates downstream
  advocacy (reviews, in-person sightings, word-of-mouth), which
  feeds the acquisition funnel for new customers. The loop is *the
  marketing engine* once it reaches scale.

So we model it as a loop with stages a customer can advance through,
fall back from, or re-enter — not as a linear progression with an
end state.

## Loop Stages

### `first_buyer`
**Definition:** Customer has completed exactly one D2C order with
one or two units total. Has the product on the wrist for the first
time.

**Current data ([[personas]] Distribution):** 543 customers (65.9%
of the D2C base). This is the *Single Buyer* segment in the
personas Distribution table.

**Mental state:** Forming an opinion. Comfort experience kicks in
over days/weeks. May not yet know they want more.

**Goal:** Move them to `second_buyer` (another order) or
`multi_unit` (additional units in one go).

**Signal of progression to `second_buyer`:** second order placed
within 90 days.
**Signal of progression to `multi_unit`:** total units owned reaches
3+ (typically via a second order; sometimes via a single bigger
order).
**Signal of regression / churn:** no return visit within 180 days,
no email engagement.

---

### `second_buyer`
**Definition:** Customer has placed exactly two orders, total
units ≤ 2. Has come back once but not yet outfitting at scale.

**Current data:** 28 customers (3.4%). The *Single Repeat* segment.

**Mental state:** The product worked well enough on the first watch
that they want it on a second. Outfitting motion has started.

**Goal:** Move them to `multi_unit` (3+ units total).

**Signal of progression to `multi_unit`:** third unit acquired
(via order three, or via a multi-unit order two).
**Signal of progression to `outfitter`:** rare but possible — large
third-order jump.

---

### `multi_unit`
**Definition:** Customer owns 3–4 buckles, typically across 2+
orders OR in a single bulk order.

**Current data:** Aggregated into Bulk Single (1 order / 3–4
units) = 69 customers (8.4%) and a portion of multi-order Curators.

**Mental state:** Committed enough to have outfitted multiple
watches. Likely outfitting their daily-rotation watches.

**Goal:** Move them to `outfitter` (5+ units OR 3+ orders).

**Signal of progression to `outfitter`:** fifth unit acquired, or
third order placed.

**Notes:** The Bulk Single sub-pattern (single multi-unit order)
often correlates with founder-touch customer service per
[[personas]] Distribution findings. These customers may be more
loyal than their order count suggests.

---

### `outfitter`
**Definition:** Customer owns 5+ buckles OR has placed 3+ orders.

**Current data:** 47 customers (5.7%) driving 18.7% of D2C revenue
at $242/customer average. The *Outfitter* segment.

**Mental state:** This is identity behavior. They've decided
Fitwell is part of their watch experience and they're outfitting
their collection systematically. Per [[personas]] P1b real review
quotes: *"I own nearly a dozen"*, *"Just bought my 5th"*, *"will be
getting these for all of my straps."*

**Goal:** Move them to `advocate` — convert their outfitting
behavior into observable advocacy (review, referral, social
mention).

**Signal of progression to `advocate`:** Judge.me review posted,
referral attributed, social post / forum mention captured, in
creator program.

**Notes:** Outfitters review at 19.1% (vs. 3.7% for Single Buyers
— see [[personas]] Distribution review-behavior table). The advocacy
yield from this segment is the highest-leverage thing the retention
loop produces.

---

### `advocate`
**Definition:** An `outfitter` who has produced observable advocacy
— review, referral, social mention, creator-program participation.

**Current data:** Roughly 9 customers identified from the
outfitter × Judge.me reviewer intersection (named in [[personas]]
Distribution). Real number likely higher once forum/social mentions
are captured.

**Mental state:** Identifies with the brand. Tells other watch
people about Fitwell unprompted.

**Goal:** Sustain and amplify. Recognize the advocacy, give them
the next tier (creator-program seat, early access, founder-touch
relationship), and use them as proof for the upstream
acquisition funnel.

**Signal of regression:** advocacy goes quiet for 180+ days; can
re-engage but the loop has cooled.

**Notes:** This is where the retention loop closes back into the
acquisition funnel — each `advocate` produces touches that feed
`creator_partnerships`, `forum_reddit_organic`, `in_person_sighting`,
and `post_creator_branded_search` entry points in [[funnel]]. The
loop becomes the marketing engine.

## Entry Points to the Loop

Most customers enter at `first_buyer` from the D2C funnel — they
completed a checkout via [[funnel]] `converting` and land here. But
two other channels insert customers directly into the loop without
acquisition-funnel contact:

### `gift_recipient`
**Loop entry:** `first_buyer` (they have one on the wrist, but it
wasn't a journey they took)
**Acquisition cost:** zero to us; the buyer paid full retail
**Notes:** Per [[funnel]] gift-context entry — the gift *buyer*
went through the D2C funnel; the *recipient* is a new customer
entering this loop. Currently under-detected without a gift-card
SKU + recipient registration. The recipient is a hot prospect for
`second_buyer` if we can identify and re-engage them.

### `brand_partnership_oem_facing`
**Loop entry:** `first_buyer` (they bought a watch and a Fitwell
came with it)
**Acquisition cost:** wholesale margin paid in the partnership deal
**Notes:** Per [[funnel]] — when a B3+ brand ships Fitwell as default
or upgrade, the watch buyer becomes a Fitwell customer without
ever touching our marketing. Aspirational channel; structurally
inserts customers at the retention-loop entry rather than the
acquisition funnel entry.

## Retention Channels (what moves customers through the loop)

Each retention channel is a first-class object, parallel to the
acquisition channels in [[funnel]]:

### `klaviyo_post_purchase`
**Targets:** `first_buyer` → `second_buyer`, `second_buyer` →
`multi_unit`
**Persona affinity:** any
**Measurement:** Klaviyo + UTM `utm_source=klaviyo` on orders where
the customer has prior order history. Now segmented from welcome-
flow first-order Klaviyo (see [[funnel]] `email_klaviyo_welcome_flow`)
via `scripts/klaviyo-acquisition-vs-retention.ts`.
**Current data:** **Surprisingly small measured contribution.** In
the Nov 2025–May 2026 window: 5 orders / 5 customers / $551 — only
10.3% of all Klaviyo-touched revenue, and all are 2nd orders (no
3rd+ orders attributed to Klaviyo at all). The post-purchase email
program is either (a) not driving meaningful repeat purchase yet, or
(b) driving repeat *visits* that then convert via direct or branded
search rather than via tagged Klaviyo links.
**Status:** active operationally; weakly measured
**Notes:** The earlier "dominant retention lever" framing of this
channel was wrong. The data says post-purchase Klaviyo attribution
is small in absolute terms. This could be a measurement artifact
(emails drive return visits that close via other channels) or a
real weakness in the post-purchase sequence design — most likely
both. Next investigation: tag post-purchase Klaviyo links more
aggressively (per-email UTMs, not generic `utm_source=klaviyo`) so
we can measure email-driven return visits separately from email-
attributed orders. The "outfit your collection" sequence is the
single highest-leverage piece of copy to test against — if it's not
working, that's the place to fix it.

### `judgeme_re_engagement`
**Targets:** `first_buyer` → `second_buyer`; `outfitter` → `advocate`
**Persona affinity:** any (Outfitters review at 19.1%)
**Measurement:** `judgeme` UTM source (already visible in order
data — markus.dinkel@liveramp.com is the named case in [[personas]]
Distribution)
**Status:** active
**Notes:** Judge.me's review-request emails are doing dual work —
re-engaging customers AND surfacing advocates. The intersection of
review-leavers and outfitters is the warmest creator-program
candidate pool.

### `order_shipping_notifications`
**Targets:** `first_buyer` → return visit (re-engagement)
**Persona affinity:** any
**Measurement:** PostHog return-visit cohort by order date
**Status:** structural (transactional emails)
**Notes:** Often-underused channel — a shipping email that includes
*"now that yours is on the way, here's how to outfit your next
watch"* converts higher than a generic re-engagement email weeks
later, because the customer is in the right mental state.

### `outfit_your_collection_campaign`
**Targets:** `multi_unit` → `outfitter`
**Persona affinity:** P1, P2, P3 (multi-watch owners)
**Measurement:** campaign-specific UTM + Klaviyo segment performance
**Status:** aspirational (concept; needs design)
**Notes:** A scheduled multi-touch sequence specifically for
customers who own 2–4 buckles, walking them through the "missing"
watches in their collection. Targets the exact transition where the
LTV jump is largest.

### `creator_program`
**Targets:** `outfitter` → `advocate`
**Persona affinity:** P1a especially; Outfitter segment broadly
**Measurement:** program membership; tracked outputs per member
(content posted, attributed sales)
**Status:** aspirational — referenced in [[personas]] P1a as
"primary target of [[creator-program]]"; doc lives elsewhere
**Notes:** Outreach list already named in [[personas]] Distribution
"Outfitter-reviewers" table. Start there.

### `referral_program`
**Targets:** `outfitter` → `advocate`; also produces *new*
`first_buyer` customers (back-feeding the acquisition funnel)
**Persona affinity:** any outfitter
**Measurement:** referral code attribution
**Status:** not yet built
**Notes:** Lowest-effort way to formalize word-of-mouth, which is
currently happening but unattributed.

### `loyalty_program`
**Targets:** `multi_unit` → `outfitter` (rewarding the next purchase
when it crosses a threshold)
**Persona affinity:** any repeat customer
**Measurement:** loyalty platform
**Status:** not yet built
**Notes:** Discussed; deferred. Outfitters say price isn't an issue,
so the value would be recognition / status, not discount.

### `founder_touch`
**Targets:** can intervene at any stage; especially powerful at
`multi_unit` → `outfitter` and `outfitter` → `advocate`
**Persona affinity:** any high-value customer
**Measurement:** ad-hoc — track via customer note in Shopify
**Status:** active (Oliver/Tom, ad hoc)
**Notes:** The Bulk Single segment vocabulary in [[personas]]
Distribution shows founder-touch is generating disproportionate
advocacy. Worth thinking about whether this can be scaled or
templated.

## Persona Outfitting Patterns

Different personas outfit differently. Match the retention motion to
the persona's pattern.

### P1a Watch Advocate
**Likely pattern:** Already outfitting from first contact;
self-directed. Doesn't need much loop activation — but is the
highest-yield `outfitter → advocate` candidate because they have a
public watch identity.
**Key channel:** `creator_program` ASAP.

### P1b Deep Collector
**Likely pattern:** Bulk-outfits methodically. Often hits
`outfitter` within months. Quiet — needs `judgeme_re_engagement` to
surface them as advocates because they don't self-promote.
**Key channel:** `klaviyo_post_purchase` + `judgeme_re_engagement`.

### P2 Engaged Curator
**Likely pattern:** Outfits gradually over 6–12 months across 2–4
watches. Most customers in this segment plateau at `multi_unit`
(2–4 units) and need explicit nudges to push to `outfitter`.
**Key channel:** `outfit_your_collection_campaign` — built for
exactly this transition.

### P3 Strap Hobbyist
**Likely pattern:** Outfits *straps* rather than *watches*. May
maintain high unit count even with few watches. Strap-partner
re-engagement is more relevant than watch-collection campaigns.
**Key channel:** strap-partner co-marketing.

### P4 Algo-Discovered
**Likely pattern:** Starts as `first_buyer` with one problem watch.
May convert to P2 over time if comfort experience generalizes.
Slower to outfit; needs longer Klaviyo nurture.
**Key channel:** `klaviyo_post_purchase` with extended-window
sequences.

### P5 Comfort Buyer
**Likely pattern:** Often stays at `first_buyer` indefinitely —
they had a specific pain, the buckle fixed it, they're done. Low
outfitting yield. Don't over-invest retention spend here.
**Key channel:** none aggressive; rely on natural P5→P2 drift
for re-engagement.

## How the Loop Closes Back to the Funnel

Every `advocate` produces touches that feed [[funnel]] entry points
for *new* customers:

- Reviews (Judge.me + others) → `comparison_listicle_content`,
  `solution_aware` evidence on PDP
- Forum/Reddit mentions → `forum_reddit_organic` entries for cold
  visitors
- In-person wearing → `in_person_sighting` entries
- Creator-program content → `creator_partnerships`
- Branded-search mentions in their content →
  `post_creator_branded_search`

**This is why advocacy yield is the highest-leverage retention
output.** Each `advocate` is structurally equivalent to a continuous
low-cost source of upstream funnel entries. Quantifying the
multiplier — *"one advocate is worth N new first-buyers per year"* —
is the implicit ROI calculation behind the creator program.

## Anti-Patterns

- **Sending the same retention sequence to all `first_buyer`s.** P5
  Comfort and P1b Collector are *not* the same retention target.
- **Measuring retention only by repeat purchase.** Advocacy outputs
  matter at least as much. An `outfitter` who has plateaued at 5
  units but is generating 3 forum mentions per year is more
  valuable than one who silently bought 6.
- **Investing equally across personas.** P5 Comfort plateau is real
  and fine — they're solved. Investing in re-engaging them produces
  fatigue, not LTV.
- **Treating gift recipients as new acquisition prospects.** They
  enter at `first_buyer` and respond to retention motions, not
  awareness ads.

## Open Questions

| Question | Why it matters | Owner | Status |
|---|---|---|---|
| What is the time-to-second-order distribution for `first_buyer` → `second_buyer`? | Determines the optimal Klaviyo cadence and the time at which a customer should be considered churned | Tom | Open — needs cohort query against Shopify |
| Does the founder-touch effect on Bulk Single buyers compound over time? Are they advocating more 6 months later? | Tells us if founder-touch is scalable as a deliberate strategy | Tom | Open |
| What's the right `advocate` threshold? Is one review enough, or do we require sustained activity? | Determines who qualifies for creator-program-level investment | Tom | Open |
| Can we operationalize "in-person sighting" as a measurable channel? Even rough volume from inbound asks? | If yes, advocacy ROI calculation gets sharper | Tom | Open |
| How many `outfitter`-segment customers are also `gift_recipient` entries we're not detecting? | Affects gift-card SKU prioritization | Tom | Open |
| Does the LTV curve flatten after `outfitter`, or do `advocate`-stage customers continue to spend? | Determines whether the loop ends at `advocate` or continues into deeper tiers | Tom | Open — needs 12+ months of cohort data |

## Related

- [[personas]] — segment definitions and the Distribution section
  with current retention behavior data.
- [[funnel]] — D2C acquisition flow that feeds `first_buyer`.
- [[b2b-pipeline]] — B2B has its own retention pattern (`recurring_order`
  → `partnership`), modeled there.
- [[event-taxonomy]] — PostHog events for return visits,
  email engagement, review behavior.
- [[hypotheses]] — H3 (multi-watch owners outfit) is largely
  validated by the Distribution data referenced here; some open
  questions in [[hypotheses]] map to questions in this doc.
