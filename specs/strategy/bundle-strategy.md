# Bundle Strategy — evaluated, declined; redirect to retention motion

Last updated: 2026-06-06

> **Status: bundle evaluated and declined.** Recomputed from the
> production `order` + `order_line_item` tables on 2026-06-06 against
> the 2025-11-01 → 2026-06-06 D2C window. Script:
> `scripts/bundle-strategy-analysis.ts`. Conclusion revises
> [[360-campaign]] Workstream 1 §2 "Bundle Ladder" — the original
> $40 / $92 / $134 ladder is cut, no replacement bundle ships in
> this iteration, and the leverage redirects to acquisition-side
> email signup lift + the existing [[360-campaign]] Workstream 5
> post-purchase Klaviyo motion.

## Context

The 360 campaign v3.1 ([`360-campaign.md`](./360-campaign.md)) Workstream
1 §2 originally proposed a three-tier ladder ($40 single / $92
three-pack / $134 five-pack) as part of the locked offer stack. The
premise: make multi-unit obvious and tilt single-buyer demand into
collector demand. That premise was set before we had quantified the
demand curve, the discount surface, or the existing free-shipping
incentive.

A prior Claude session reportedly reached a directional conclusion on
this question, but the spec was never committed and the reasoning is
lost. This doc recomputes from data and treats the prior conclusion
as unknown.

**What changed during the evaluation (2026-06-06 session):** initial
recommendation was a public PDP 2-pack at $68. Tom pushed on the
margin-transfer risk to existing full-pay 2-unit buyers (~67% of the
173 two-unit orders in the window). Re-examined, the public 2-pack
failed the break-even bar at plausible 1→2 conversion lifts. The
deeper read: **at this price point ($40 unit), no public bundle SKU
does net-positive work for Fitwell.** The actual lever is acquisition-
side email signup at first purchase + the post-purchase Klaviyo
retention motion — both already scoped in [[360-campaign]] Workstream
5 (post-purchase Klaviyo series), Workstream 1 §4 (in-box card), and
the Klaviyo welcome flow that already exists.

So this doc is no longer a "what bundle do we ship" — it's a
"bundle evaluated, declined, here's where the leverage actually is"
doc with the analysis preserved so the conclusion is auditable.

## What we measured

Script: `scripts/bundle-strategy-analysis.ts`. Run pattern:

```bash
npx vercel --global-config ~/.vercel-fitwell env pull \
  .env.production.local --environment=production --yes
npx dotenv -e .env.production.local -- node --import tsx/esm \
  scripts/bundle-strategy-analysis.ts
rm -f .env.production.local
```

Window: `processed_at >= 2025-11-01`. Cancelled orders excluded. D2C
filter: `source_name != 'shopify_draft_order'`, NULL treated as D2C —
matches the strategy-funnel filter in `src/lib/funnel/strategy.ts`.

**Scope footnote:** in the prod DB the window resolves to **670 D2C
orders / 1,096 units / $45,565 in revenue** (546 `web` + 120 `pos` +
4 other; the wholesale `shopify_draft_order` channel adds another 77
orders / $31K we filter out). This is smaller than the 996-order
baseline in [[personas]] Distribution, which was sourced from a
Shopify CSV at a different point in time. Direction and shape agree;
absolute counts differ. The order-count gap is flagged in *Open
questions* — it does not change the conclusions here.

**Historical bundle SKU — out of scope, but a unit-count footnote.**
The catalog historically carried `FWB004-SS-BUN` / `FWB004-YG-BUN` —
the M4 Universal Micro-Adjust Link Bundle (16mm + 18mm + 20mm in one
box, $110–$112). It is **not currently an active SKU and is not in
scope of this analysis**. It shows up in the window on 5 order line
items (4 SS, 1 YG) totaling ~6 bundles, sold via email when it
existed. Mechanical implication: those 5 line items are counted by
this analysis as 5 single-unit orders, so Cut 1 mildly understates
true multi-unit demand (~13 buckles missing from the unit tally —
well under 2% of the 1,096-unit denominator; doesn't shift the
distribution shape).

### Cut 1 — Units-per-order distribution

| Units per order | Orders | % orders | Cum % | Units | % units | % revenue |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 419 | 62.5% | 62.5% | 419 | 38.2% | 42.1% |
| 2 | 173 | 25.8% | 88.4% | 346 | 31.6% | 30.7% |
| 3 | 43 | 6.4% | 94.8% | 129 | 11.8% | 10.6% |
| 4 | 16 | 2.4% | 97.2% | 64 | 5.8% | 5.8% |
| 5 | 3 | 0.4% | 97.6% | 15 | 1.4% | 0.9% |
| 6+ | 16 | 2.4% | 100.0% | 123 | 11.2% | 9.9% |

**88.4% of orders are 1 or 2 units. Only 8.7% are 3+.** Five-unit
orders are 0.4% (three orders in seven months). The natural demand
curve is essentially "everyone buys 1 or 2"; any public bundle SKU
above 2 sits on rounding-error volume.

### Cut 2 — Discount usage distribution

- **31.8%** of D2C orders (213 of 669 with subtotal > 0) used any
  discount.
- **Median discount rate: 0.00%.** Most buyers pay full price.
- **94.8% of discounted orders fall in the 15–20% band** — consistent
  with the multiple 15% codes in circulation (welcome flow,
  `watchbros15` and other creator codes, review-leaver reward).
- p75 / p90 / p95: 17.65%. p99: 29.0%. Max: 150% (small refund-noise
  tail).

Two-tier reality: ~⅔ of orders pay full retail, ~⅓ pay ~15% off via
one of the 15% codes. The pricing surface today isn't a single
frontline — it's "$40 or $34."

### Cut 3 — Frontline vs realized ASP per unit, by units bucket

Realized items revenue = `subtotal_price - total_discounts` (excludes
tax + shipping). ASP/unit = realized items ÷ total units in that
bucket.

| Units | Orders | Frontline ASP | Realized ASP | Disc rate | 3-unit realized | 5-unit realized |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 419 | $42.48 | $38.18 | 5.06% | $114.53 | $190.89 |
| 2 | 173 | $40.94 | **$36.50** | 5.31% | $109.51 | $182.52 |
| 3 | 43 | $39.83 | $34.19 | 6.59% | $102.58 | $170.97 |
| 4 | 16 | $43.48 | $38.06 | 4.70% | $114.17 | $190.28 |
| 5 | 3 | $30.13 | $22.13 | 15.31% | $66.40 | $110.67 |
| 6+ | 16 | $40.81 | $30.89 | 12.04% | $92.68 | $154.47 |

Realized ASP/unit at 2 units = $36.50 — typical 2-unit buyer pays
roughly $73 in item revenue today. Bimodal: ~67% paid $80 full
retail; ~33% paid ~$68 via a 15% code. **Any public 2-pack at $68
would transfer ~$12 per order from the 67% who already pay full.**

### Cut 4 — What 3+ unit buyers already paid

| Units | Orders | Mean paid | Median paid | vs proposed bundle |
|---|---:|---:|---:|---:|
| 3 | 43 | $102.58 | **$120.00** | +$28 vs $92 |
| 4 | 16 | $152.22 | $160.00 | — |
| 5 | 3 | $110.67 | **$140.00** | +$6 vs $134 |
| 6+ | 16 | $237.50 | $217.00 | — |

The typical 3-unit buyer paid $120 — full retail × 3. A $92 3-pack
would have been a $28-per-order margin transfer to that 43-order
cohort. The typical 5-unit buyer paid $140 — only $6 above the
proposed $134 bundle, and there are three 5-unit orders in the entire
window. The original 3-pack / 5-pack tiers were structurally
margin-transfer plays from the start.

### Cut 5 — Shipping behavior by units bucket

Tests whether "free shipping at 2+" is firing — the existing implicit
2-pack incentive.

| Units | Orders | Mean ship | Median | p75 | % free |
|---|---:|---:|---:|---:|---:|
| 1 | 419 | $3.46 | $5.29 | $5.89 | 43.2% |
| 2 | 173 | $1.96 | $0.00 | $0.00 | **85.0%** |
| 3 | 43 | $0.26 | $0.00 | $0.00 | 95.3% |
| 4 | 16 | $2.50 | $0.00 | $0.00 | 93.8% |
| 5 | 3 | $0.00 | $0.00 | $0.00 | 100.0% |
| 6+ | 16 | $0.00 | $0.00 | $0.00 | 100.0% |

**Free shipping at 2+ is firing.** 85% of 2-unit orders ship free vs
43% of 1-unit orders. The existing 1→2 incentive math: a 1-unit
buyer pays $40 + ~$5 shipping = $45; a 2-unit buyer pays $80 + $0
shipping = $80. The marginal cost of the second unit today is ~$35
(12.5% off the marginal unit). That implicit 2-pack is doing
whatever work it's going to do; layering a labeled $68 2-pack on top
adds modest behavioral lift while transferring real margin from the
~67% who'd have paid full anyway.

### Cut 6 — Discount usage × order position

Order position 1 = customer's first order; 2+ = subsequent. Separates
acquisition codes (welcome flow on E1, dominant first-order) from
retention codes (review-leaver, creator codes, post-purchase flows).

|  | n | % w/ discount | Median disc% | p75 disc% | Avg units |
|---|---:|---:|---:|---:|---:|
| First-order (pos=1) | 624 | **32.5%** | 0.00% | 17.65% | 1.63 |
| Repeat orders (pos≥2) | 45 | 22.2% | 0.00% | 0.00% | 1.67 |

Discount-band split:

| Band | First-order | Repeat |
|---|---:|---:|
| 0% (no discount) | 421 (67.5%) | 35 (77.8%) |
| 0 < x < 10% | 1 (0.2%) | 0 |
| 10–15% | 1 (0.2%) | 0 |
| **15–20%** | **193 (30.9%)** | **9 (20.0%)** |
| 20–30% | 4 (0.6%) | 0 |
| > 30% | 4 (0.6%) | 1 (2.2%) |

Units distribution by order position:

| Units | First-order | Repeat |
|---|---:|---:|
| 1 | 390 (62.5%) | 28 (62.2%) |
| 2 | 162 (26.0%) | 11 (24.4%) |
| 3 | 40 (6.4%) | 3 (6.7%) |
| 4 | 14 (2.2%) | 2 (4.4%) |
| 5 | 3 (0.5%) | 0 |
| 6+ | 15 (2.4%) | 1 (2.2%) |

Two reads:

1. **Discounts are dominantly an acquisition tool.** 32.5% of first
   orders use a 15% code; 22.2% of repeats do. The welcome flow is
   the lead lever, with review-leaver / creator codes filling a
   smaller retention surface.
2. **Units-per-order distribution is essentially identical between
   first orders and repeat orders.** Repeat buyers don't bulk up —
   they buy at the same shape they bought before. **The outfit-the-
   collection move happens across multiple separate orders, not by
   making one big later order.** Multi-order retention is the
   structural mechanism, not single-transaction bundling. Strongest
   single piece of evidence in the analysis for redirecting from
   "ship a bundle" to "ship the post-purchase retention motion."

### Cut 7 — Repeat behavior by first-order size

For customers (excludes guest orders) whose first order was N units:

| First-order units | Customers | Repeat rate | Median days→2nd | LTV/customer | Lifetime units |
|---|---:|---:|---:|---:|---:|
| 1 | 336 | 7.4% | 10 d | $51.82 | 1.11 |
| 2 | 147 | 7.5% | 1 d | $88.47 | 2.18 |
| 3 | 37 | 8.1% | 28 d | $124.72 | 3.22 |
| 4 | 13 | 0.0% | — | $161.63 | 4.00 |
| 5 | 3 | 0.0% | — | $141.73 | 5.00 |
| 6+ | 12 | 8.3% | 0 d | $297.38 | 7.92 |

Three reads:

1. **Repeat rate is essentially flat across first-order size** —
   ~7–8% everywhere. Buying 2 instead of 1 doesn't make a customer
   meaningfully more likely to come back. (Window is partial; per
   [[personas]] mature-cohort repeat is ~15%. The shape across
   first-order sizes is the read, not the absolute number.)
2. **LTV scales linearly with first-order size.** $52 → $88 → $125
   → $297. The lift is captured at the first transaction. A bundle
   captures order-size LTV up front; an email retention motion
   captures repeat-order LTV across time. **Both compound** — they
   aren't substitutes. The bundle just isn't a positive-expectancy
   way to capture the order-size piece at $40 unit price.
3. **The 7–8% repeat rate is the actual gap.** If the post-purchase
   email motion (currently $551 across 5 orders / 7 months per the
   `klaviyo-acquisition-vs-retention` analysis) lifts the mature-
   cohort repeat rate from 15% to even 25%, the LTV impact dwarfs
   any plausible bundle outcome.

## What the data + consumer behavior says

### Why no public bundle works at $40 unit price

At $40, a watch buckle is a "small premium accessory" — same tier as
sunglasses, premium socks, belt buckles, premium watch straps. The
behavioral patterns:

- **First purchase is almost always 1 unit.** The job-to-be-done is
  "fix this specific watch's strap" or "try this product" — not
  "outfit a collection." Trust is unproven.
- **1→2 is a "while I'm here" move** at the cart — happens for a
  meaningful 25.8% naturally, with free shipping at 2+ as the quiet
  ambient incentive. The lift available *beyond* that ambient
  baseline by adding a labeled 2-pack at $68 is small — small enough
  that the margin transfer to ~67% of existing 2-unit buyers (who'd
  have paid full retail anyway) almost certainly exceeds it.
- **1→3+ on first purchase is rare.** Median 3-unit buyer already
  pays full retail. A public 3-pack at $92 captures that 6.4% at a
  $28-per-order loss.
- **Outfit-your-whole-collection is post-confidence and time-
  shifted.** Watch hobbyists' 5–10 watch collection bears no
  relation to first-order size. They acquire accessories over
  months at a cadence of one or two at a time, *after* confirming
  each works. The collection-replacement decision happens around
  30–45 days after first purchase. That decision belongs in email,
  not in a PDP SKU.

### Why a welcome-flow-gated bundle isn't the right alternative either

An earlier draft of this analysis recommended moving the 2-pack from
public PDP to welcome-flow-gated. That fixes the give-away problem
but introduces new ones:

- **Buyers who don't sign up for the email list miss the offer.**
  ~67.5% of first orders use no discount (welcome flow or otherwise).
  That's a large slice of buyers we can't reach this way. Reasons
  (Tom + analysis):
  - **C1.** They came in via another code (creator codes like
    `watchbros15`, partner codes, referral codes) — they redeemed a
    15% equivalent through another path and never joined the email
    list. The data is suggestive: we can't currently distinguish
    creator-code redemptions from welcome-flow redemptions within
    the 15–20% band (see *Open questions* — discount-code-name
    visibility). C1 is likely the largest leak.
  - **C2.** High-intent buyer, no friction wanted. Arrived via
    branded search, a creator post, or a trade-show referral; the
    email-for-discount trade feels like a delay between them and the
    purchase, not value.
  - **C3.** Gift buyer — the code goes to the wrong inbox, the
    gift-buyer doesn't want to be on the list, the relationship is
    one-off. (Gift buyer is flagged as underserved in
    [[personas]]; we don't have a gift-card SKU.)
  - **C4.** Skeptical of "email-for-discount" popups categorically.
    Trust threshold for handing over an email to a brand they just
    discovered isn't met; a guarantee badge or social proof would
    convert them better than a code.
- **Buyers may save the code for later** — sign up, get the code,
  don't redeem on the first order, redeem on a future order
  (effectively converts the welcome flow into a one-time
  loyalty-style discount). This makes the welcome flow a
  retention-effect mechanism for some users, not pure acquisition.
- **The narrow reach reduces the bundle test signal.** If the
  welcome-flow 2-pack only sees ~30% of first orders, the data
  needed to validate "did labeled bundling actually move 1→2 lift?"
  takes 3× longer to accumulate, and the result tells us only
  about the welcome-flow subset.

Combine those — the public 2-pack is a margin-transfer trap, the
welcome-flow-only 2-pack is a partial-reach signal trap — and
**bundling isn't the right answer to ask the data this question
right now.** It's the wrong shape for the consumer behavior at this
price point in this category.

### What is the right answer

The two things that compound:

1. **Lift first-purchase volume and email signup rate.** Every email
   address we capture is the head of a downstream Klaviyo retention
   sequence with proven LTV lift (+27.6% per the
   `klaviyo-acquisition-vs-retention` analysis). Today our signup
   surface is one welcome-flow popup. The 67.5% of first orders
   that pay full retail (without a welcome code) are mostly *not on
   the email list* — every one of them is a missed downstream
   retention opportunity worth multiples of the at-cart discount
   we'd otherwise give them. (See the *Acquisition-side signup lift*
   workstream below.)
2. **Ship the post-purchase Klaviyo retention motion.** [[360-campaign]]
   Workstream 5 already scopes this — D1 install guide → D7 in-box
   card reminder → D14 "how many watches do you own?" reply ladder →
   D21 review request → D25 last-call → D30 collection upsell →
   win-back → M4 cross-sell. **This is the highest-leverage gap in
   the entire 360 plan** ("$551 across 5 orders in 7 months"
   currently — i.e., the retention motion is essentially unbuilt).
   The "outfit-the-collection" move belongs here as the D30 send
   segmented off the D14 reply (3+ watch buyers → outfit code, 5+
   units, ~25% off, time-shifted to post-confidence decision moment).
   This is the natural home for any future bundle-shaped offer.

These compound because they share infrastructure (Klaviyo + email
list) and the same customer journey (acquired → on list → nurtured →
repeat). A bundle SKU on the PDP captures, at best, the AOV piece on
the slice of customers who'd have bought 2 anyway. The retention
motion captures the LTV piece on every email address we hold.

## Recommendation

### 1. Decline the bundle in this iteration

- **No public PDP 2-pack.** Single SKU at $40 stays as the only
  product-page offer. Free shipping at 2+ stays as the implicit
  multi-unit incentive.
- **No public 3-pack or 5-pack.** First-order 3+ buyers already
  convert at full retail; 5-unit demand is rounding error.
- **No welcome-flow-gated 2-pack** in v1. Reach is too narrow to
  cleanly validate, and the work overlaps with the higher-leverage
  signup-rate and retention work below.

### 2. Add a new workstream — acquisition-side email signup lift

Treat email signup at first purchase as a first-class metric. The
sub-text of every analysis we've done is "email is the lever";
making the signup rate visible and movable is the prerequisite to
every retention play.

- **Measure.** Today we don't track "% of first-time visitors who
  signed up for the welcome flow" or "% of first-time buyers who are
  on the list at purchase time." Both numbers should be derivable
  once PostHog instrumentation is fully live (360 W6). Surface them
  on the `/funnel` and `/attribution` admin views.
- **Identify the C1–C4 leakage shape.** With discount-code-name
  visibility (see *Open questions*), we can split the 32.5% of
  first orders with discount into welcome-flow vs. creator-code vs.
  review-code redemptions — quantifying C1 directly. C2 / C3 / C4
  remain qualitative but become testable once the C1 baseline is
  known.
- **Intervene.** Candidate experiments — none of which are bundle-
  shaped:
  - Replace the email-for-discount popup with a higher-trust frame
    (guarantee badge + "first to know about new finishes" framing
    over "15% off"). Test C4 directly.
  - Post-add-to-cart capture — once the buyer has committed to
    purchase, ask for email as a "receipt + care guide" rather than
    a discount trade. Test C2 directly.
  - Gift-friendly checkout option — code goes to recipient OR to
    buyer's email-of-choice, with explicit framing. Test C3
    directly; depends on a gift SKU per [[personas]].
  - Creator-code attribution — close the loop so a buyer who used
    `watchbros15` is automatically subscribed to a Watch Bros-themed
    sub-flow rather than being lost from the list. Test C1
    directly.
- **Engineering scope.** Most of the above sits at the
  PostHog/Klaviyo intersection, with no new schema. Discount-code-
  name visibility is a Shopify GraphQL pull (~½ day) and unlocks
  the C1 split.

### 3. Lean into the existing 360 W5 post-purchase retention motion

The D30 outfit-the-collection code direction stays — but it lives
inside W5's post-purchase Klaviyo series (where it was always
properly scoped), not as a bundle-decision side product. The 360 W5
sequence:

- D1 — install guide + tips
- D7 — in-box card reminder
- D14 — "how many watches do you own?" reply segmentation
- D21 — Judge.me review request
- D25 — last-call on in-box card discount
- D30 — collection upsell segmented from D14 reply: 1–2 watches →
  single-unit reorder; 3+ watches → outfit-the-collection code
  (5+ units, ~25% off, 30-day expiry)
- Win-back and M4 cross-sell flows downstream

The bundle-shaped offer that does the outfit work is the D30 code,
delivered via email, gated on confirmed watch-count intent.

### Knock-on effects in the 360 plan

- **W1 §2 deletes the public bundle ladder entirely** and links here.
  No new public SKUs. Calendar W1 drops the "create 2-pack SKU in
  Shopify" / "bundle products in Shopify" line.
- **W1 §1 (Guarantee) and W1 §3 (Anchor) unchanged.**
- **W5 D30 line unchanged** — the outfit code direction was always
  the right place for the bulk offer.
- **W5 priority gets reinforced.** Post-purchase series and signup
  lift become the two top-priority offer-stack workstreams; bundle
  scope returns to zero.
- **A new sub-section gets added to W5 (or stays here in this doc):**
  the acquisition-side signup-rate measurement + intervention work.
  Tom decides whether to formalize that as a numbered W5 sub-section
  or keep it pointed at from here.
- **Priority ordering in `specs/ops/PRIORITIES.md` does not need to
  change.** The 360 isn't tracked there as a discrete workstream;
  the bundle decision is internal to W1.

## Trade-offs and what we're betting on

1. **The bet: most of the LTV upside sits in capturing more email
   addresses and shipping the post-purchase retention motion** —
   not in surfacing discounted multi-unit SKUs on the product page.
   We accept that a future iteration may revisit a bundle-shaped
   offer (e.g. an email-gated outfit code as part of W5 D30), but
   we're done evaluating public PDP bundles in this iteration.
2. **Signup-rate work depends on PostHog instrumentation being
   complete enough to measure the signup funnel** (360 W6). Until
   that's live we'll be operating partially blind; the intervention
   experiments above can be designed in parallel but their measurement
   gate is W6.
3. **We accept the give-up of "what if the public 2-pack DID work
   anyway."** Possible but lower-expectancy than the retention motion.
   If a clean A/B mechanism becomes available (e.g., once the variant
   attribution wiring in 360's engineering scope is live), revisiting
   a labeled 2-pack as an experiment is cheap. Not now.
4. **Free shipping at 2+ stays in place** as the only multi-unit
   incentive on the PDP. We don't know how much of the existing 25.8%
   two-unit share it drives vs. how much would happen anyway. That's
   fine — measuring it isn't urgent compared to the retention motion.

## Open questions for Tom

1. **Discount-code-name visibility.** Our `order` table stores
   `total_discounts` ($ amount) but not the discount-code label. We
   can't distinguish welcome-flow 15% off from `watchbros15` from
   review-leaver 15% off from a service refund. This is the lever
   that unlocks the C1 measurement (creator-code redemption rate as
   a fraction of all first-order discounts). Fix: pull per-order
   `discountApplications` from Shopify's GraphQL API (~½ day
   engineering) or CSV export from Shopify Admin. **Priority: high
   for the signup-lift workstream.**
2. **POS orders in scope?** 120 of 670 D2C orders (18%) are
   `source_name = 'pos'` (trade show / in-person). Including them
   slightly pulls up the single-unit share. The conclusion doesn't
   change either way, but worth deciding whether to publish web-only
   numbers going forward.
3. **Reconcile order count vs personas baseline.** This analysis
   sees 670 D2C orders; [[personas]] Distribution (run 2026-05-26
   via Shopify CSV) shows 996 orders over the same window.
   ~330-order gap. Possible causes: CSV included
   `shopify_draft_order`, CSV's last-touch attribution row-
   multiplied differently, DB missing some orders. Worth a
   follow-up.
4. **Should the signup-lift workstream become 360 W5 §6, or stay
   surfaced from this doc?** Either works; the engineering surface
   is small enough that pinning it under W5 is clean.
5. **D30 outfit code rate (25% vs 20% vs 30%) — TBD by Tom when W5
   post-purchase ships.** Not blocking now.

## Related

- [[360-campaign]] Workstream 1 — the offer stack this revises;
  Workstream 5 — the retention motion this redirects toward.
- [[personas]] Distribution — the segment quantification (65.9%
  Single Buyer, 5.7% Outfitter) underlying the consumer-behavior
  framing.
- [[retention-loop]] — the post-purchase outfitting motion the D30
  code lives inside.
- [[hypotheses]] H12 (Klaviyo welcome flow as acquisition lever) —
  the validated discount mechanism this leans on.
- `scripts/bundle-strategy-analysis.ts` — the script that produced
  the numbers above. Re-runnable against prod read-only.
- `scripts/klaviyo-acquisition-vs-retention.ts` — the analysis that
  quantifies the welcome-flow LTV lift and the current near-zero
  post-purchase retention contribution.
