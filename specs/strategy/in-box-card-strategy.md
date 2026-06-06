# In-Box Card Strategy — evaluated and declined on brand-posture grounds

Last updated: 2026-06-06

> **Status: in-box card declined for this iteration.** Recomputed
> from the production `order` table on 2026-06-06 against the
> 2025-11-01 → 2026-06-06 D2C window (script:
> `scripts/in-box-card-analysis.ts`). The corrected economics
> (using actual ~91% gross margin per [[../ops/domains/costs]])
> show the card mechanic is plausibly net-positive at realistic
> repeat-rate lifts. **We are declining it anyway** on brand-
> posture grounds: stacking welcome-flow + card + D7/D25 reminders
> + D30 outfit-code is too much discount cadence for a premium-
> precision $40 accessory. The corrected timing data also reframes
> who repeats: 85% of natural repeats happen inside 30 days, which
> is a signal the product is doing the retention work — they came
> back because they loved it, not because they needed a coupon.
> The post-purchase Klaviyo flow ships as 4 emails (D1 / D14 /
> D21 / D30), with the D30 outfit-the-collection code as the only
> discount touchpoint in the first 30 days post-purchase.

## Context

[[360-campaign]] Workstream 1 §4 originally scoped a physical
in-box card: **"$29 for your next buckle. 30-day expiry. Unique
discount code. Target redemption: 25%+."** It backed the D7 and
D25 reminder emails in the W5 post-purchase Klaviyo series.

Before [[bundle-strategy]] was evaluated, the card was assumed to
"just work" — it's tactile, branded, lives in the unboxing moment,
and 25%+ redemption is a defensible DTC target. Tom requested an
evaluation before any print commitment (cards in fulfilled boxes
are irreversible).

This doc evaluates the card economics against real D2C repeat
behavior AND against the strategic posture we want Fitwell to hold.
The data alone supports printing; the posture argument is what
flips the decision.

## What we measured

Script: `scripts/in-box-card-analysis.ts`. Run pattern:

```bash
npx vercel --global-config ~/.vercel-fitwell env pull \
  .env.production.local --environment=production --yes
npx dotenv -e .env.production.local -- node --import tsx/esm \
  scripts/in-box-card-analysis.ts
rm -f .env.production.local
```

Window: `processed_at >= 2025-11-01`. Cancelled orders excluded.
D2C filter: `source_name != 'shopify_draft_order'`. Restricted to
orders where `customer_id IS NOT NULL` so repeat-customer logic
works (548 distinct customers across 593 orders in the window).

### Cut 1 — Time-to-second-order distribution (repeaters only)

Of the 40 customers whose 2nd order is observable:

| Days since 1st order | Repeaters | Share | Cum share |
|---|---:|---:|---:|
| 0–7d | 18 | 45.0% | 45.0% |
| 8–14d | 10 | 25.0% | 70.0% |
| 15–30d | 6 | 15.0% | **85.0%** |
| 31–60d | 6 | 15.0% | 100.0% |
| 61–90d | 0 | 0.0% | 100.0% |
| 91+d | 0 | 0.0% | 100.0% |

**85% of natural repeats happen inside 30 days; 70% inside two
weeks.** Two reads of this number:

1. **Card-friendly reading:** the 30-day card window catches almost
   the entire active-repeat cohort. Good targeting.
2. **Product-friendly reading:** people who come back, come back
   fast — which means the product itself is doing the retention
   work. They tried it, loved it, ordered another. The card would
   be subsidizing demand the product already earned.

Read 2 is the more honest reading of this curve in a premium-
precision category. People who don't come back in 30 days mostly
don't come back at all — the data says so. The card targets the
"would have come back fast anyway" cohort, which is precisely the
margin-transfer cohort.

### Cut 2 — Baseline 30-day repeat rate (R0)

Restricted to first-orders with ≥30 days of observation window:

- Eligible first-orders: 374
- Of those, 2nd order within 30 days: 26
- **R0 = 7.0%**

Matches the bundle analysis Cut 7 finding (~7–8% repeat rate, flat
across first-order size). Mature-cohort R0 is likely 10–15% per
[[personas]] Distribution; the window-partial figure is a lower
bound, not a ceiling. **Use R0 = 7–10% as the realistic baseline
range.**

### Cut 3 — What did 2nd-order buyers (inside 30 days) actually pay?

34 in-window 2nd orders:

| Discount band | Orders | Share |
|---|---:|---:|
| 0% (no discount) | 26 | **76.5%** |
| 0 < x < 10% | 0 | 0.0% |
| 10–15% | 0 | 0.0% |
| 15–20% | 7 | 20.6% |
| 20–30% | 0 | 0.0% |
| > 30% | 1 | 2.9% |

**76.5% of repeat buyers paid full retail.** These are the buyers
a card discount would be a margin transfer to — they were coming
back anyway, paying $40. The card would hand them $11 each.

The 20.6% in the 15–20% band are likely welcome-flow / review-
leaver code users. For those, the card is duplicative — they'd
swap one $11 saving for another.

### Cut 4 — Quantity of 2nd orders inside 30 days

| Units in 2nd order | Orders | Share |
|---|---:|---:|
| 1 | 22 | 64.7% |
| 2 | 9 | 26.5% |
| 3 | 2 | 5.9% |
| 4 | 0 | 0.0% |
| 5 | 0 | 0.0% |
| 6+ | 1 | 2.9% |

**64.7% of in-window 2nd orders are single-buckle.** The card's
"next buckle" (singular) framing matches the typical buyer
behavior. No structural framing collision.

### Cut 5 — Break-even sensitivity (CORRECTED with actual COGS)

Assumptions:
- Card discount: $11 ($40 retail → $29)
- **COGS per unit: $3.65** (M1 SS, M4 — per
  [[../ops/domains/costs]]; M1 Ti is $4.50, slightly worse)
- **Full-price contribution: $36.35 per buckle (~91% gross margin)**
- Print cost per card: $0.50 (Moo.com rough rate)
- Total cards in window: 548 (= first orders)

Per-redemption math:
- Incremental redeemer (new order that wouldn't have happened):
  **+$25.35 contribution** (was $13 at the wrong-margin 60%
  assumption)
- Non-incremental redeemer (would have bought anyway at full):
  **−$11 margin transfer** (unchanged)

**Break-even incremental fraction (f):**

| Redemption rate | Break-even f |
|---:|---:|
| 10% | 44.0% |
| 15% | 39.4% |
| 20% | 37.1% |
| 25% | **35.8%** |
| 30% | 34.8% |

The break-even bar drops from "more than half of redemptions must
be net-new orders" (at the wrong 60% margin assumption) to
"roughly a third must be net-new" (at the correct 91% margin).
That's an achievable bar against the 23.5% of in-window repeaters
who don't currently pay full (Cut 3 — they're already discount-
sensitive, so subbing the card for their existing code is roughly
neutral, and the card's job is to lift the full-pay 76.5% repeat
rate enough to clear the bar).

### Cut 6 — Implied required lift over the measured R0 = 7.0%

At R0 = 7.0%, assuming 90% of in-window repeats redeem the card:

| ΔR (pp lift) | Effective redemption R | Inc fraction f | Net per card | Total program net |
|---:|---:|---:|---:|---:|
| 0 pp | 6.3% | 0.0% | −$1.19 | −$651 |
| 2 pp | 8.1% | 22.3% | −$0.73 | −$401 |
| 5 pp | 10.8% | 41.8% | **−$0.05** | **−$26** |
| 8 pp | 13.5% | 53.5% | +$0.64 | +$349 |
| 10 pp | 15.3% | 59.0% | +$1.09 | +$599 |
| 15 pp | 19.8% | 68.3% | +$2.23 | +$1,224 |
| 20 pp | 24.3% | 74.2% | +$3.37 | +$1,849 |

**The card breaks even at ~5 pp lift** (7% → 12% 30-day repeat).
Industry DTC card lift on 30-day repeat is typically 2–5 pp —
**right at break-even with realistic lift, and meaningfully
positive if the card outperforms.** Even at 0 pp lift (worst case),
program loses ~$651 over the window (≈ $1,100/year extrapolated).
Bounded downside.

**On pure economics, the card is a reasonable bet.** This is a
material reversal from the analysis that used the wrong 60%-margin
assumption (which showed −$331 to −$651 across the realistic lift
range).

## What the data says — and what the data doesn't say

The data says: **at the correct 91% gross margin, the card
mechanic is plausibly net-positive at industry-typical lift
rates.** Cuts 1, 3, 4 corroborate the timing, audience, and
framing fit.

The data does not say: **whether printing a discount card and
sending two reminder emails about it is consistent with the brand
posture we want Fitwell to hold.** That's the strategic question
the data doesn't answer.

### The strategic reframe

[[bundle-strategy]] declined a public bundle ladder because
discounting demand that already converts at full retail is
mostly a margin transfer. The card is structurally the same shape
of move — it's a discount handed to repeat buyers, 76.5% of whom
already pay full retail (Cut 3).

The bundle decision wasn't only quantitative. It was a brand-
posture decision: **most people are buying one to test it; the
right job for marketing is to get them to test it, love it, and
buy more — not to bribe them into coming back.** The card stacks
that same brand-tension on top of the existing welcome-flow
discount and the planned D30 outfit code.

The cumulative-discount load over the first 30 days post-purchase
would be:

- Welcome flow (33% of buyers): 15% off → $6 off at checkout
- Customer buys (potentially with welcome code)
- In-box card on arrival: $11 off next single buckle
- D7 email: "Remember the card"
- D25 email: "Last call on the card"
- D30 email: 25% off 5+ buckles → ~$50 off if redeemed

**That's 3–4 discount touchpoints in 30 days** for the welcome-
flow cohort. At a premium-precision $40 accessory positioning,
that cadence reads more like a Bath & Body Works (constant promo
cycle) than a Patek (no discount, ever) brand. Brands that
discount-train their customers eventually have to keep
discounting — the discount becomes the only mechanic that works.

The data also re-reads through this lens. Cut 1's 85% repeat-in-
30-days isn't "the card's window catches all the repeats." It's
"the product earns its own repeat behavior fast or doesn't earn
it at all." Subsidizing that 7–8% cohort doesn't change anything
for the 92% who don't come back (because they got their one and
either didn't love it enough to need another, or they only own one
watch).

### What the right post-purchase posture is

The first 30 days post-purchase should be **product-experience-
driven**, not discount-driven. The post-purchase flow's job is to
make sure the customer loves what they bought:

- Help them install it properly (so the first experience is great)
- Help them discover related use cases (sizing across other
  watches, finish options, M4 for deployants)
- Collect a satisfaction signal (D14 question; D21 review)
- Build identity around the product (UGC ask; community)
- Tee up the collection-outfitting moment once they've confirmed
  it works (D30 outfit code — the ONE discount push, at the moment
  of greatest leverage)

That posture is consistent with the bundle decision. It's also
consistent with where the data points: the product is doing the
retention work for the 7–8% who repeat; our job is to make sure
the product gets the chance to do that work, and to push at the
right moment when the customer is ready to outfit beyond one
watch.

## Recommendation

### Decline the card in this iteration

- **No physical in-box card.** No discount, no reminder emails
  tied to it.
- **No D7 or D25 in the post-purchase flow.**
- The W5 post-purchase flow ships as **4 emails: D1 / D14 / D21 /
  D30**.
- D30 outfit-the-collection code (25% off 5+, 30-day expiry) is
  the only discount touchpoint in the first 30 days post-purchase.

### What we're betting on

1. **The product earns its own repeat behavior.** The 7–8% who
   come back in 30 days don't need a card; they already loved it.
   The 92% who don't come back mostly won't come back regardless
   of a $11 discount.
2. **Brand restraint compounds.** Customers who learn that Fitwell
   doesn't discount on a drumbeat treat the rare discount (D30
   outfit code) as meaningful when it lands. Brand that constantly
   discounts trains customers to wait for the next discount.
3. **Operational simplicity is real value.** No card design /
   print / code-management workstream means engineering and
   ops capacity stays on retention motion, signup-lift, creator
   program, and PostHog instrumentation.

### What we're giving up

- Estimated $311–$1,224 / window in foregone net contribution
  at industry-typical 5–10 pp card lift (per Cut 6). Annualized,
  somewhere $600–$2,400. Real money, but bounded.
- The physical unboxing touchpoint at the moment of greatest
  customer excitement. Real brand value, hard to quantify.
- An attribution surface (per-customer card code) that would have
  given a clean per-customer repeat signal. Mitigated by the
  signup-lift workstream's planned discount-code-name visibility
  work (see [[bundle-strategy]] Open Questions §1).

### Alternative paths we evaluated but don't pursue

- **Card with no discount** (brand artifact only — thank-you note,
  install tips, UGC ask). Defensible on brand-experience grounds;
  drops the discount cadence problem; print cost remains
  (~$275/window at $0.50/card × 548) without measurable LTV math.
  Worth revisiting later if the post-purchase flow surfaces a
  specific job a physical artifact could do (e.g. a tactile sizing
  guide). Not in v1.
- **Card with different discount mechanic** (free shipping, $10
  off $80+, free gift). Each requires another round of break-
  even analysis. Useful if a specific mechanic has a strong story
  attached to a customer-journey moment; not worth scoping in v1.

## What changes in the W5 post-purchase flow

Before (per [[360-campaign]] v3.1):

| Day | Email | Status |
|---|---|---|
| D1 | Install guide + tips | Keep |
| D7 | In-box card reminder | **Drop** |
| D14 | "How many watches do you own?" | Keep (intel only) |
| D21 | Judge.me review request | Keep |
| D25 | Last call on in-box card | **Drop** |
| D30 | Outfit-the-collection code (25% off 5+, 30-day expiry) | Keep |

v1 ships as 4 emails. If a future post-flow audit surfaces a real
job a D7 or D25 email could do (install help, M4 cross-sell tease,
UGC ask), add them. Don't pre-build empty slots.

## Open questions for Tom

All previously open questions are resolved by the decline
recommendation:

1. ~~Pick alternative (a) / (b) / (c)~~ — landed on (a) drop, with
   open option to revisit (b) brand-artifact card later if a real
   job emerges.
2. ~~D7 / D25 repurpose or drop~~ — drop both.
3. ~~Gross margin assumption~~ — confirmed at $3.65 COGS (M1 SS /
   M4) per Tom 2026-06-06; captured in
   [[../ops/domains/costs]].
4. ~~Print cost per card~~ — moot in v1.

Standing-deferred:

- **If a future iteration revisits the card, on what trigger?** The
  cheapest answer would be a successful post-purchase flow that
  surfaces D7/D25 as missing engagement slots. The more rigorous
  answer would be a clean A/B between cohorts (cards-in-box vs no-
  card) once attribution wiring supports it. Neither is in v1
  scope.

## Assumptions and limits

- **R0 = 7.0% is window-partial.** Mature-cohort 30-day repeat is
  likely higher (10–15% per [[personas]] Distribution);
  conclusion is robust to the range.
- **Customer-id-tagged orders only.** Guest orders (~12% of
  orders) excluded because the repeat logic can't link them.
  Doesn't affect conclusion.
- **COGS per unit = $3.65 (M1 SS, M4).** From Tom 2026-06-06;
  variant-level cost tracked in
  `production_po_line_item.unit_cost_cents` but rolled up for
  strategy use in [[../ops/domains/costs]]. M1 Titanium is $4.50
  (~$0.85 worse contribution per unit). The 91% blended margin
  is unchanged conclusion across that range.
- **Industry DTC card lift figures (2–5 pp on 30-day repeat) are
  external benchmarks, not internal data.** No internal A/B test
  of cards yet. The recommendation gives weight to the brand-
  posture argument explicitly because internal validation isn't
  available.

## Related

- [[360-campaign]] Workstream 1 §4 — the card section this
  evaluates and declines.
- [[360-campaign]] Workstream 5 — the post-purchase Klaviyo flow
  this feeds into (ships as D1 / D14 / D21 / D30).
- [[bundle-strategy]] — the bundle ladder evaluation that
  established the brand-posture framework this analysis extends.
- [[../ops/domains/costs]] — confirmed COGS used in the break-
  even math.
- `scripts/in-box-card-analysis.ts` — the script that produced
  these numbers. Re-runnable against prod read-only.
- `scripts/bundle-strategy-analysis.ts` — sibling analysis (Cut 7
  of which surfaces the 7–8% repeat-rate baseline this confirms).
