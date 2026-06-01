# B2B Sales Pipeline

Last updated: 2026-05-26

> **Status: starter draft.** Created 2026-05-26 to give the B2B
> motion its own framework, separate from the D2C [[funnel]]. The
> B2B sales motion is relationship-driven and cycle-based — funnel
> stage vocabulary doesn't fit. This pipeline shares the
> `unaware`/`aware` top-of-mind language with [[funnel]] and
> diverges into sales-pipeline stages from there. Refine as deals
> close and patterns become observable.

## Scope

This pipeline covers **B2B / wholesale acquisition** — the motion
that produces orders from B1 Strap Makers, B2 Watch Retailers, B3
Microbrands, B4 Established Brands, B5 OEM Strap Manufacturers,
and B6 OEM Watch Manufacturers (see [[personas]] B-section).

D2C acquisition lives in [[funnel]]. Post-D2C-purchase retention
lives in [[retention-loop]]. B2B has its own retention pattern
(re-orders → standing relationship → co-branded SKU); for now
that's modeled here in the `recurring_order` and `partnership`
stages rather than in a separate B2B-retention doc.

## Why This Is a Pipeline, Not a Funnel

The D2C funnel models a stage-progression where a single person
moves through awareness → consideration → purchase. The B2B motion
is fundamentally different:

- **Long cycles** (weeks for B1/B2, months for B3, quarters-to-year
  for B4/B5/B6).
- **Relationship-driven** — the same prospect surfaces at multiple
  trade shows, in multiple conversations, over months.
- **Sample-anchored** — the critical commitment is "send a sample,"
  not "click an ad."
- **Multi-stakeholder** at the larger end (B4–B6 have product /
  sourcing / design weighing in).
- **No anonymous traffic** — every prospect is named and known.

So we use pipeline stages (sales-CRM-style) rather than funnel
stages (visitor-behavior-style).

## Pipeline Stages

### `prospect`
**Definition:** Identified as a fit for one of B1–B6 but no contact
yet. Lives in a target list, not yet a conversation.

**Examples:** A microbrand we saw at WindUp but didn't speak to; a
strap-maker in the target list (JPM Straps, BluShark, Crown &
Buckle, Watchgecko, Veblenist, Hodinkee Shop, Aaron Bespoke) we
haven't approached.

**Goal:** Get to first contact (outbound outreach, intro through a
mutual connection, inbound interest).

**Signal of progression to `lead`:** any first contact —
email, DM, trade-show booth visit, or response to outreach.

---

### `lead`
**Definition:** First contact established. They know we exist; we
know they're interested enough to engage.

**Examples:** A strap-maker founder replied to an outreach email; a
microbrand product lead asked at a trade show "send me info."

**Goal:** Get a sample shipped. The critical commitment.

**Signal of progression to `sample`:** sample order placed (free
or paid) and shipped.

---

### `sample`
**Definition:** Sample shipped; their hands have touched the
product. They're evaluating it for fit, finish, integration.

**Examples:** Delugs had a sample; WIS has a sample in flight; UAE
leather buyer had a sample before the 250-unit order.

**Goal:** First pilot order. Convert hands-on evaluation into a
small real commercial transaction.

**Signal of progression to `pilot_order`:** first wholesale order
placed at any size.

**Notes:** This is the most critical stage. Per [[personas]]
B1 note: *"adoption is the constraint, not pricing or terms."* If
they have the sample and don't move to pilot, the friction is
internal to them (product fit, business case, prioritization), not
external to us. Multiple gentle follow-ups; understand the blocker.

---

### `pilot_order`
**Definition:** First small wholesale order placed. They've made a
real commercial commitment.

**Examples:** 100-unit first order from a strap-maker; B2 retailer's
first 10-unit test purchase; B3 microbrand's small custom-branded
test run.

**Goal:** Successful sell-through that motivates a re-order.

**Signal of progression to `recurring_order`:** second wholesale
order from same partner.

**Notes:** The pilot must succeed *for them*. If sell-through is
slow, dig into why — wrong target customer, missing display
materials, missing co-marketing support, wrong SKU mix.

---

### `recurring_order`
**Definition:** Standing wholesale customer. Multiple orders placed;
predictable pattern emerging.

**Examples:** Delugs at proven-partner scale.

**Goal:** Promote to `partnership` — formal co-branded
relationship, default-spec status on their products, or scaled
recurring purchase commitment.

**Signal of progression to `partnership`:** formal commitment to
default-spec, co-branded SKU, exclusive arrangement, or scheduled
volume.

---

### `partnership`
**Definition:** Co-branded / default-spec / scaled relationship.
Fitwell is a structural part of their product offering, not a
discretionary purchase.

**Examples (aspirational):** A B3 microbrand that ships every
strap-equipped watch with a Fitwell as default; a B5 OEM offering
Fitwell as a spec option to their brand customers; a B1 partner
co-branding a strap+buckle bundle.

**Goal:** Maintain the relationship; expand into adjacent SKUs;
use as proof-point for next-tier prospects.

**Signal of regression:** declining order cadence, conversation
about substitution, change in their product strategy.

## B2B Entry Points

Like [[funnel]], each entry channel is a first-class object.
B2B-specific channels:

### `b2b_trade_shows_consumer`
**Typical entry stage:** `lead` or `sample`
**Persona affinity:** B1 Strap Maker, B3 Microbrand
**Notes:** WindUp + microbrand consumer shows. The consumer side
of the show generates B2B leads too — strap-maker founders walk
the floor.

### `b2b_trade_shows_industry`
**Typical entry stage:** `lead`
**Persona affinity:** B4 Established Brand, B5 OEM Strap Mfr, B6
OEM Watch Mfr
**Notes:** EPHJ, Watches & Wonders (B2B side), Hong Kong Watch &
Clock Fair. Industry-only audience; different conversations from
consumer shows.

### `b2b_outbound_cold`
**Typical entry stage:** `prospect` → `lead`
**Persona affinity:** B1, B2, B3
**Notes:** Email / DM outreach from us to a named prospect. Largest
volume channel.

### `b2b_inbound`
**Typical entry stage:** `lead`
**Persona affinity:** any
**Notes:** They contact us. Email, contact-form, social DM. Often
triggered by an upstream consumer-side touch (saw us at WindUp,
saw a creator video featuring us).

### `b2b_peer_referral`
**Typical entry stage:** `lead`
**Persona affinity:** B3 Microbrand → other B3 Microbrand; B1 →
other B1
**Notes:** One brand mentions us to another. High trust transfer.
Encouraged by good `recurring_order` and `partnership` relationships.

### `b2b_strap_maker_referral_into_brand_customers`
**Typical entry stage:** `lead` (or higher if the B5 strap-maker
includes us in their spec sheet automatically)
**Persona affinity:** B3, B4 (brand customers of B5 partners)
**Notes:** This is the force-multiplier path described in
[[personas]] B5 — Jean Rousseau-class OEM strap manufacturers
offering Fitwell as a spec option to *their* brand customers.

### `b2b_d2c_reverse_attribution`
**Typical entry stage:** `lead`
**Persona affinity:** any
**Notes:** Sometimes a B2B prospect first encounters Fitwell via the
D2C funnel — a microbrand founder personally buys one for their own
watch, then opens a B2B conversation. Compound path across the two
docs. We should be alert to this; flag in CRM when a known D2C
customer email turns into a B2B inquirer.

## B2B Persona Paths

(Pulls forward [[personas]] B1–B6 to declare expected pipeline
progression per persona.)

### B1 — Strap Maker / Reseller
**Typical entry channel(s):** `b2b_outbound_cold`,
`b2b_trade_shows_consumer`
**Typical path:** `prospect` → `lead` → `sample` → `pilot_order`
→ `recurring_order` → `partnership` (Delugs is the proof case)
**Cycle:** weeks
**Where they stall:** at `sample` — they take it and need internal
buy-in to commit to a pilot order. Adoption is the constraint, not
pricing.

### B2 — Watch Retailer
**Typical entry channel(s):** `b2b_outbound_cold`, walk-in
conversation at consumer trade shows
**Typical path:** `prospect` → `lead` → `pilot_order` (small test
order; sometimes skips `sample` if they touch it at a trade show)
**Cycle:** days to weeks
**Where they stall:** at `pilot_order` deciding whether the retail
margin justifies the inventory commitment. Display unit + walk-in
fitting-room script materially help.

### B3 — Microbrand
**Typical entry channel(s):** `b2b_trade_shows_consumer`,
`b2b_peer_referral`, `b2b_d2c_reverse_attribution` (founder bought
one personally first)
**Typical path:** `lead` → `sample` → `pilot_order` (custom-branded
test run) → `recurring_order` → `partnership` (default upgrade on
strap-equipped SKUs)
**Cycle:** months
**Where they stall:** at `sample` while internal product roadmap
discussions happen; at `pilot_order` while custom-branding tooling
is sorted.

### B4 — Established Brand
**Typical entry channel(s):** `b2b_trade_shows_industry`,
relationship-led introductions
**Typical path:** `lead` → `sample` → extended evaluation → may
route via OEM (`b2b_strap_maker_referral_into_brand_customers`)
rather than direct
**Cycle:** quarters to year+
**Where they stall:** quality validation phase; product-roadmap
prioritization at their end.

### B5 — OEM Strap Manufacturer (Jean Rousseau-class)
**Typical entry channel(s):** `b2b_trade_shows_industry`, industry
relationships
**Typical path:** `lead` → `sample` → `partnership` (integration as
a spec option to their brand customers — this is the leveraged
outcome, not a recurring direct order)
**Cycle:** months
**Notes:** B5 is special — the *outcome* is offering Fitwell into
B3/B4 brand customers, not direct sales. A B5 partnership multiplies
B3/B4 reach.

### B6 — OEM Watch Manufacturer
**Typical entry channel(s):** `b2b_trade_shows_industry`, sourcing
networks
**Typical path:** `lead` → `sample` → `partnership` (integration as
a parts-catalog option for the brands they assemble for)
**Cycle:** months to year+
**Notes:** Similar leverage pattern to B5 but at watch-assembly
rather than strap-assembly level.

## Pipeline Hygiene Rules

- **Every prospect has a named decision-maker** (per [[personas]]
  B-entries: founder/owner for B1/B2, founder/product lead for B3,
  product/sourcing director for B4, BD/OEM sales lead for B5,
  sourcing/product for B6). If you can't name them, you have a
  `prospect`, not a `lead`.
- **Sample status is the central metric.** "How many samples are
  out, how old are they, what's the follow-up status" answers
  "how healthy is the pipeline."
- **No deal moves backward in the pipeline implicitly.** A `lead`
  that goes silent stays a `lead` until you've explicitly demoted
  it (back to `prospect` or removed from the list).
- **B2B prospects who first appeared as D2C buyers** (the
  `b2b_d2c_reverse_attribution` channel) should be flagged — they
  arrive warmer and are often easier sales.

## Tooling

Leads are captured and tracked in the in-repo CRM under **Customers →
Leads** (admin). The mobile-first capture page at `/leads/capture` offers
three modes for the same flow:

- **Scan card** — photograph the front; Claude Sonnet 4.5 vision extracts
  name / company / email / phone / title / website with per-field confidence
  rings on the confirm form. Raw OCR text is preserved on the lead for
  desktop recovery.
- **Scan QR** — live camera decode of vCard / MeCard / `mailto:` / `tel:` /
  URL payloads, parsed into the same field shape.
- **Type it in** — blank confirm form for when there's no card on hand.

All three feed a single confirm form whose stage defaults to `prospect`,
honoring the anti-pattern below. The two tradeshow entry channels
(`b2b_trade_shows_consumer`, `b2b_trade_shows_industry`) are first-class
selectable source values, and each lead records an editable **meeting
date** (defaults to today). Names are title-cased and the company field
defaults to the email domain. The capture-confirm step also matches the
email domain against existing companies and flags duplicate leads.

## Anti-Patterns

- **Counting trade-show conversations as pipeline.** A booth
  conversation is `prospect` at most until they've engaged after
  the show. Otherwise the post-show pipeline is theater.
- **Sending samples without follow-up plans.** Sample shipped is
  the most expensive step; no follow-up is wasted cost.
- **Optimizing for `pilot_order` margin.** The pilot order is
  customer acquisition cost — its value is the *option* on
  `recurring_order` and `partnership`, not the gross margin on
  the pilot itself.
- **Treating B5/B6 like B1/B2.** They have fundamentally different
  decision processes and timelines. Same product, different sale.

## Open Questions

| Question | Why it matters | Owner | Status |
|---|---|---|---|
| What's our sample-to-pilot-order conversion rate? | Tells us if `sample` follow-up is the biggest pipeline lever | Tom | Open — needs CRM data |
| What does B3/B4 conversion actually look like at trade shows? Where do deals stall? | Sharpens the B2B sales playbook | Tom | Ongoing (carried from [[personas]]) |
| Is there a measurable lift in B2B inbound from D2C activity? | If yes, more D2C visibility is a B2B growth lever | Tom | Open |
| Should we instrument a B2B-specific landing experience (e.g., `/wholesale`) and route inbound through it? | Concentrates inbound, simplifies attribution | Tom | Open |
| How do we know when a `recurring_order` partner is at risk of churning? | Retention signal — declining order cadence is currently un-monitored | Tom | Open |

## Related

- [[personas]] — B1–B6 persona definitions, decision-makers,
  cycles, and economics.
- [[funnel]] — sister flow for D2C acquisition; shares vocabulary
  at the `unaware`/`aware` top.
- [[retention-loop]] — sister flow for D2C post-purchase; the B2B
  retention motion is modeled here in `recurring_order` and
  `partnership` stages.
- [[../current/integrations.md]] — Shopify wholesale / draft-order
  handling for B2B orders.
