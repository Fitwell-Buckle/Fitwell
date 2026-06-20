# Retention & Welcome Email Content (Klaviyo)

Last updated: 2026-06-20 (v2 — two-product, two-flow, fully automated)

> **Status: draft for Tom's review (WS2).** Copy source of truth for the
> post-purchase nurture flow + the review-request flow + a welcome-flow
> *challenger*. **Content only** — no Klaviyo objects exist yet.
>
> **Deploy path (v1 is paste-based).** The repo-managed flow pipeline
> (`klaviyo-integration.md` Phase 4) is **not built** — so v1 ships by Tom
> building the flow skeletons in the Klaviyo UI and pasting the copy below,
> using the per-flow build spec at the foot of this doc. (Building the
> Phase 4 pull/deploy pipeline is a separate engineering effort, worth it
> later for iteration, not required to launch.)
>
> Grounded in [[personas]], [[vocabulary-map]], [[retention-loop]],
> [[360-campaign]] W5, and the live catalog
> (`fitwellbuckle.co/products.json`, pulled 2026-06-20 → `product.md`).

## Design principles (locked with Tom, 2026-06-20)

1. **Product-experience-led, single discount.** One discount touchpoint
   (D30 outfit code). We earn the outfitting order by making the first one
   work, not by discounting.
2. **Zero human-in-the-loop per customer.** Every outbound is automated —
   setup, value, cross-sell, outfit, review ask + reminder, *and the
   founder-touch*. Humans only ever handle inbound **replies**, which route
   to `info@fitwellbuckle.co` (Tom + Oliver + Melanie). Nothing waits on a
   person remembering to act.
3. **Serve them by what they know and own, not by order number.** Setup is
   gated on *product-newness*; the goal escalates with *loop stage*.
4. **Built to extend to M2/M3/M5.** Only the Setup email and the
   cross-sell recommendation are product-specific; everything else is
   product-agnostic. Adding a product = add a setup branch + add the SKU to
   the recommendation block. No N×N rebuild.

**Voice anchors:** founder-led and direct (customers name Tom in reviews —
founder-touch is a brand asset); "solution to a known problem," never
novelty; don't medicalize comfort (P5 say "swelling/warm days," never
"edema"); never let the price anchor become a $5 OEM tang buckle
([[personas]] Pricing-by-Anchor). Sign as Tom.

## The two products (quick ref — full detail in `product.md`)

- **M1 Micro-Adjust Buckle** — *replaces* the strap's pin buckle (spring-bar
  swap; ships with a spare bar). 3mm "half-hole" on-wrist adjust. For straps
  where you can/want to swap the buckle.
- **M4 Universal Micro-Adjust Link** — an *inline connector* installed
  *between* the strap and its existing closure. Slide mechanism, up to 3mm,
  adds <one hole of length, **works with deployant clasps *and* pin buckles**
  — the answer when you *can't or won't* swap the buckle.
- **Shared sizing rule:** measure strap width **at the buckle, not
  lug-to-lug**.
- **Cross-sell pair:** M1 *becomes* the buckle (cleanest, swappable straps);
  M4 *adds a link* without removing anything (deployant/integrated/maxed
  straps). Complementary, not either/or.

## Architecture — two parallel flows, both Fulfilled-triggered

Trigger is **Shopify "Fulfilled Order"** (no "delivered" signal exists yet —
see the delivered-signal upgrade note in the build spec; getting one would
let the review flow drop its geo branching entirely).

```
FULFILLED ORDER (core product; accessory-only orders excluded)
│
├─ FLOW A · Post-Purchase Nurture
│   E1 Setup        F+2   ← per-product branch, gated on PRODUCT-NEWNESS
│   E2 Value        F+8   ← agnostic                  (first-order arc)
│   E3 Complete kit F+24  ← recommendation, excl. owned (first-order arc)
│   E4 Outfit 25%   F+38  ← agnostic, the one discount  (first-order arc)
│   └─ Outfitter buying again → diverts to FOUNDER-TOUCH (automated), no discount
│
└─ FLOW B · Review Request   (once per customer, suppress-if-reviewed)
    POS       ask F+10 → reminder +7
    Domestic  ask F+14 → reminder +7
    Intl      ask F+26 → reminder +7   ← fixes the "asked before it arrived" bug
```

**Entry logic (Flow A), evaluated at Fulfilled:**
1. **Accessory-only order** (only Spring Bar / Wide Tang) → exit, no flow.
2. **E1 Setup** sends for each core product in the order **that the customer
   has not purchased before this order** (product-newness). First M1 → M1
   setup. Later first M4 (already owns M1) → M4 setup. Reorder of an owned
   product → no setup.
3. **The E2→E3→E4 arc runs only on a true first order overall** (`first_buyer`).
4. **Outfitter buying again** (5+ units owned incl. this order, OR 3+ orders
   — the [[retention-loop]] `outfitter` threshold) → **Founder-touch** email
   instead of the arc. No discount-flog.
5. **In-between** (2nd order, not yet outfitter): gets only the relevant E1
   setup from this flow; the outfit-campaign / win-back flows own this tier.
   *Deliberate v1 simplification* — flagged as a future "rising collector"
   nudge in Open Items.

All timings tunable; keep ≥48h between any two sends and leave Klaviyo
**smart sending** on so the two flows never double-send the same profile in
a day. The two near-adjacencies to watch: intl review ask (F+26) vs E3
(F+24), and review reminders vs nurture sends — a day or two of spacing +
smart sending resolves both.

## UTM tagging

The MJML pipeline auto-rewrites `fitwellbuckle.co` links to
`utm_source=klaviyo&utm_medium=email` + the campaign/content below (write
plain links in the body; tags attach at compile). Per-email `utm_content`
is deliberate — [[retention-loop]] flags generic `utm_source=klaviyo` as
why we can't separate email-driven return visits from email-attributed
orders today.

| Email | `utm_campaign` | `utm_content` |
|---|---|---|
| Nurture E1 Setup (M1) | `post-purchase` | `e1-setup-m1` |
| Nurture E1 Setup (M4) | `post-purchase` | `e1-setup-m4` |
| Nurture E2 Value | `post-purchase` | `e2-value` |
| Nurture E3 Complete-kit | `post-purchase` | `e3-kit` |
| Nurture E4 Outfit | `post-purchase` | `e4-outfit` |
| Founder-touch | `post-purchase` | `founder-touch` |
| Welcome challenger E1–E4 | `welcome-challenger` | `e1-promise` … `e4-collection` |

(Review-flow CTAs point at Judge.me, not `fitwellbuckle.co`, so UTM
injection doesn't apply — that flow is measured via Judge.me's
review-submitted event, not link UTMs.)

**Confirm canonical URLs before deploy.** Drafts use
`/pages/m1-micro-adjust-buckle`, the M4 product handle
`/products/fitwell-universal-micro-adjust-link`, and `/collections/all`.

---

# FLOW A — Post-Purchase Nurture

**From:** Tom, Fitwell Buckle Co. · **Reply-To:** info@fitwellbuckle.co

## E1 — Setup · M1 branch  ·  Fulfilled +2

- **Job:** a correct install. Highest-leverage email in the flow — it
  preempts the *only* recurring negative-review pattern ("moves to the
  loosest position", "extends itself", "moves back" — 4 reviews,
  [[vocabulary-map]] Trust-Objection) **and** the top sizing tip. A buyer who
  sets it up right reviews 5★ at D21 and outfits at D30. No discount.

**Subject (A):** Let's get the M1 set just right
**Subject (B):** 2 minutes to set your buckle
**Preview:** Three things that make it lock in — and stay exactly where you put it.

> Hi {{ first_name|default:"there" }},
>
> Before the M1 goes on the wrist, here are the three things that separate
> "nice" from "I'm ordering more."
>
> **1. The swap is easy.** The M1 replaces your strap's existing buckle —
> no strap modification. There's an installed spring bar in place and a
> **spare in the box** if you need it.
>
> **2. Size by the buckle, not the lugs.** Match the width of the buckle
> you're replacing — not the lug-to-lug width. That's the number that
> matters.
>
> **3. Set it so it takes a *positive effort* to change.** The micro-adjust
> has two locking positions and a smooth 3mm half-hole between them. Seated
> properly, it takes a deliberate push to move — that's the design, and
> it's why it holds under a heavy watch instead of creeping loose. If it
> ever feels like it's sliding, it isn't seated; push it home and it locks.
>
> Give it a day, find your two positions (a hair looser for warm
> afternoons), and you'll stop thinking about it.
>
> **[Watch the 60-second setup →](https://fitwellbuckle.co/pages/m1-micro-adjust-buckle)**
>
> Anything not sitting right? Just reply — it reaches our whole team.
>
> — Tom, Fitwell Buckle Co.

**Note:** the concern→reality structure in #3 is lifted from Giulio
Carena's 5★ review — the strongest trust template in the corpus.

## E1 — Setup · M4 branch  ·  Fulfilled +2

- **Job:** correct install of the *Link* — a different action from the M1.

**Subject (A):** Let's get your M4 Link set just right
**Subject (B):** 2 minutes to set up the Universal Link
**Preview:** It goes between your strap and your clasp — keep what you've got.

> Hi {{ first_name|default:"there" }},
>
> The Universal Link works differently from a buckle swap — here's the
> two-minute version.
>
> **1. It installs *between* your strap and your existing closure.** You
> keep your current clasp or buckle — the Link clips inline using standard
> spring bars (1.5mm; 1.6mm on the 22mm). Works with deployant clasps and
> pin buckles both.
>
> **2. Size by the strap width at the buckle**, not lug-to-lug. On a
> tapered strap, measure at the buckle end.
>
> **3. Slide to adjust, on the wrist.** It gives up to 3mm whenever your
> wrist changes through the day, and adds less than one hole of length — so
> it disappears into the strap instead of bulking it up. Looser for warm
> afternoons, snug when it's cold.
>
> **[See the 60-second setup →](https://fitwellbuckle.co/products/fitwell-universal-micro-adjust-link)**
>
> Anything not sitting right? Just reply — it reaches our whole team.
>
> — Tom, Fitwell Buckle Co.

**⚠️ Tom: confirm the M4 mechanics above** (install direction, spring-bar
sizes, the "<one hole" length figure) against the real product — I built it
from the storefront copy, you know it cold.

## E2 — Get the most out of it  ·  Fulfilled +8  ·  product-agnostic

- **Job:** a pure-value jab — deepen usage, no ask. The thing most people
  miss is that it's *not* set-and-forget.

**Subject (A):** The trick most people miss
**Subject (B):** It's not set-and-forget
**Preview:** Your wrist changes through the day. Now your watch can too.

> Hi {{ first_name|default:"there" }},
>
> A week in, here's the one habit that makes a Fitwell worth it:
>
> **Actually move it.** Most people set the fit once and forget it — but
> the whole point is on-the-fly. Loosen a notch on a warm afternoon or
> after a workout; snug it back when it cools. Your wrist swells and
> shrinks through the day; this is the watch that keeps up instead of
> picking a compromise.
>
> That's the difference between a buckle that fits *most* of the time and
> one that fits "just so" all of it. If you're the kind of person who
> notices that — and you bought one, so you are — that's the payoff.
>
> Wipe it down now and then and it'll outlast the strap.
>
> Out of curiosity — which watch did it go on? Reply and tell me. I read
> them.
>
> — Tom

## E3 — Complete your kit  ·  Fulfilled +24  ·  recommendation (first-order arc)

- **Job:** the cross-sell to the *other* product — the half of the
  fit-problem this product doesn't solve. No discount (E4 owns that).
- **Extensibility:** for v1 (M1/M4) the two variants below name the other
  product in prose. When M2/M3/M5 land, replace the named-product paragraph
  with a Klaviyo **catalog/recommendation block that excludes items already
  purchased** — copy frame ("complete your kit") stays.

### E3 — for an M1 owner (recommend M4)

**Subject (A):** For the straps the M1 can't help
**Subject (B):** The other half of the fit problem
**Preview:** Some straps you can't re-buckle. There's a fix for those too.

> Hi {{ first_name|default:"there" }},
>
> The M1 fixed the straps where you could swap the buckle. But some you
> can't — a deployant clasp, an integrated or branded buckle you'd never
> remove, a strap already sitting on its last hole.
>
> That's what the **M4 Universal Link** is for. It clips *between* your
> strap and whatever closure it already has — nothing removed — and gives
> you the same on-the-fly micro-adjust. Deployant clasps, pin buckles,
> either way.
>
> **[See the Universal Link →](https://fitwellbuckle.co/products/fitwell-universal-micro-adjust-link)**
>
> — Tom

### E3 — for an M4 owner (recommend M1)

**Subject (A):** The cleanest fix for your plain straps
**Subject (B):** When you *can* swap the buckle
**Preview:** The Link works on anything. On simple straps, there's something neater.

> Hi {{ first_name|default:"there" }},
>
> The Universal Link works on anything — that's the point of it. But on
> your plain pin-buckle straps, there's a cleaner option: the **M1**. Instead
> of adding a link, it *becomes* the buckle — same 3mm on-wrist adjust,
> nothing extra in the stack.
>
> Use the Link where you can't swap the buckle, the M1 where you can. Between
> the two, every strap you own can fit "just so."
>
> **[See the M1 →](https://fitwellbuckle.co/pages/m1-micro-adjust-buckle)**
>
> — Tom

## E4 — Outfit the collection  ·  Fulfilled +38  ·  the one discount (first-order arc)

- **Job:** convert a satisfied first buyer into a multi-watch order.
  **25% off 5+, 30-day expiry**, two-product-aware.

**Subject (A):** Now do the rest of them
**Subject (B):** Outfit five or more — 25% off
**Preview:** Micro-adjust, for the rest of your watches. 25% off 5+, 30 days.

> Hi {{ first_name|default:"there" }},
>
> What we hear most from people a month in:
>
> *"I will be getting these for all of my straps."*
> *"Just ordered six more."*
>
> Micro-adjust on a bracelet is normal — the reason it feels so good on
> *this* watch is exactly why your others deserve it too. And once one watch
> fits "just so," the unfitted ones start to bother you.
>
> So here's the nudge to finish the job: **25% off when you outfit five or
> more.** Mix it however your rotation needs — the M1 on the straps you can
> re-buckle, the M4 Link on the ones you can't.
>
> &nbsp;&nbsp;&nbsp;&nbsp;**{% coupon_code 'OUTFIT25' %}** — good for 30 days.
>
> **[Outfit the collection →](https://fitwellbuckle.co/collections/all)**
>
> Two strap watches or a dozen — this is the easiest time to get them all
> wearing right.
>
> — Tom

**Note:** verbatim outfitter quotes + bracelet-envy positioning from
[[vocabulary-map]] (the highest-leverage angle in the corpus). Anchor is
"finish the job on the watches you own," never per-unit price. P5 one-watch
comfort buyers won't bite, and that's fine ([[retention-loop]] — don't
over-invest there); the soft "two or a dozen" keeps it from feeling like
pressure. Coupon syntax `{% coupon_code %}` to confirm against Klaviyo's
unique-code setup.

## Founder-touch  ·  automated  ·  replaces the E4 path for outfitters

- **Trigger:** the customer crosses the `outfitter` threshold on this order
  (5+ units owned incl. this order, OR 3+ orders). Diverts here instead of
  E4. **Automated** — no human gate.
- **From:** Tom · **Reply-To:** info@ · **Format:** plain, text-style. No
  buttons, no images, no discount. It must read like a note, not a campaign.

**Subject:** thank you — genuinely

> Hi {{ first_name|default:"there" }},
>
> Another order came through from you, and I didn't want it to pass without
> saying something. You've got a real collection of these going now — at our
> size, that's not something I take for granted.
>
> No pitch here. I'd just genuinely like to know which watches you're putting
> them on, and whether there's anything you wish we made that we don't. Reply
> straight to this — it comes to me, Oliver, and Melanie, and we read all of
> them.
>
> Thank you for betting on a small shop.
>
> — Tom

**Note:** this is the founder-touch your reviews keep crediting ("Tom even
covered the clearing fees", "Tom and his team responded quickly") — now
automated so it never depends on anyone being at a desk. The *reply* is the
human part, and it lands in a monitored inbox by default. The advocacy
(reviews, referrals, creator interest) emerges from the reply thread, so we
don't bolt an ask onto the note itself.

---

# FLOW B — Review Request

**From:** Tom, Fitwell Buckle Co. · **Reply-To:** info@ · **Once per
customer; suppress if already reviewed.**

Replaces the current 3-variant Judge.me setup (domestic 10 / intl 14 /
POS 7, each +4). Same geo/channel split — but keyed to *wear-in after
likely arrival*, because we trigger on **Fulfilled** with no delivered
signal. The international delay roughly doubles (the old 14-from-order
often asked *before the parcel landed* — the core bug). Single reminder at
+7, not +4. Uses the **Judge.me ↔ Klaviyo** integration: send from Klaviyo
with Judge.me's unique per-customer review link merged in; **turn off
Judge.me's native review-request emails** so there's one system of record.

## Review Ask  ·  POS +10 / Domestic +14 / International +26

**Subject (A):** How's it wearing?
**Subject (B):** Now that you've had a chance to wear it
**Preview:** A quick, honest review helps the next person decide.

> Hi {{ first_name|default:"there" }},
>
> You've had it on long enough now to know whether it earned its place.
>
> If it solved the between-holes problem and you're happy, would you leave a
> quick review? A sentence about *which watch* you put it on does more for
> the next buyer than anything we could write ourselves.
>
> **[Leave a review →]({{ judgeme_review_link }})**
>
> And if it's *not* right — wrong size, or not holding the way it should —
> don't leave it there. Reply to this and we'll make it right. That's the
> whole deal.
>
> — Tom

**`{{ judgeme_review_link }}`** = the unique review link from the Judge.me
Klaviyo integration. **Tom: confirm the exact merge-tag/property name** when
you wire the integration — I don't want to quote a stale tag.

## Review Reminder  ·  +7 after the ask  ·  suppress if reviewed

- **Conditional split before send:** if the customer has submitted a review
  (Judge.me "Reviewed" event) since the ask → skip. Otherwise send.

**Subject:** still wearing it?
**Preview:** If it's working, a line would mean a lot. If it's not, tell me.

> Hi {{ first_name|default:"there" }},
>
> Quick nudge — if the Fitwell's working out, a one-line review genuinely
> helps a small shop more than you'd think:
>
> **[Leave a review →]({{ judgeme_review_link }})**
>
> And if something's off, reply instead — I'd rather fix it than have you
> settle for it.
>
> — Tom

---

# D30 outfit code — recommendation: single-use

**Recommendation: single-use codes, dynamically issued per recipient via
Klaviyo's coupon (backed by a Shopify price rule), 25% off 5+ units, 30-day
expiry.**

| | Single-use (recommended) | Shared code (`OUTFIT25`) |
|---|---|---|
| Deal-site leakage | None — bound to one profile | High — discounts full-price-intent buyers |
| Attribution | Clean: every redemption → a profile + the flow | Muddy; pollutes the C1 split work (W5 §6) |
| Expiry | Exact 30 days per code | Global only |
| Setup | One Klaviyo coupon → Shopify price rule (~15 min once) | Trivial, but you pay in leakage forever |

At ~91% margin the question isn't affordability, it's leakage — and we don't
want to hand 25% to people who'd have paid full price. **Add an `outfit`
family to the `order_discount_code` classifier** (existing families:
welcome/creator/review/service/event/other — [[360-campaign]] W5 §6) so D30
redemptions read as their own line on `/funnel/strategy`, directly measuring
whether this flow closes the $551-in-7-months gap. *Fallback* if the unique-
code wiring proves fiddly: a time-boxed shared code with a low per-customer
usage cap and a deal-site-unfriendly name — but single-use is the target.

---

# Welcome Flow — A/B *challenger* (E1–E4)

> **⚠️ Do not swap the live welcome flow.** It drives **+27.6% LTV** and is
> on the Phase 4 **denylist** so this pipeline can't touch it. A proven
> winner is a validated baseline, not a thing to overwrite on a hunch. Treat
> the below as a **challenger to A/B test** — clone, run against the
> incumbent, keep the winner.

Lift mechanism is known: welcome customers buy **bigger first orders** (2.41
vs 1.78 units), not more often — so the challenger leans into "most people
fit out more than one," *without* a bundle SKU (the ladder was cut
2026-06-06). Product-agnostic; pre-purchase.

**E1 (immediate) — Your 15% off, and a promise**
Subject: *Your 15% off — and a promise* · Preview: *The code's below. The promise matters more.*
> Here's your 15% off: **{% coupon_code 'WELCOME15' %}**.
>
> And the promise it comes with: a Fitwell solves the between-holes problem
> — that spot where one hole's too tight and the next's too loose — or we
> make it right. Wear it; if it doesn't fit the way you hoped, reply. It
> reaches our whole team.
>
> **[Find your buckle →](https://fitwellbuckle.co/pages/m1-micro-adjust-buckle)** — Tom

**E2 (day 2) — 30 seconds to find your size**
Subject: *30 seconds to find your size* · Preview: *Measure the buckle you're replacing — not the lugs.*
> The one thing people get wrong: they measure lug-to-lug. **Measure the
> width of the buckle you're replacing instead** — that's what has to match.
> Most strap watches are 18, 20, or 22mm.
>
> Two micro-adjust positions mean the fit lands *between* your strap's holes
> — exactly where it's comfortable.
>
> **[See the sizes →](https://fitwellbuckle.co/pages/m1-micro-adjust-buckle)** — your 15% ({% coupon_code 'WELCOME15' %}) is still good. — Tom

**E3 (day 5) — Keep your strap. Get the fit.**
Subject: *Keep your strap. Get the fit.* · Preview: *You don't replace the strap you love. You replace the buckle.*
> A deployant clasp runs $80–200 and changes how your strap looks. The
> Fitwell is $40, slips onto the strap you already own, and gives you
> micro-adjust without the bulk.
>
> *"My leather straps are now as comfortable as my metal bracelets."* — Markus.
> *"A watch that never seemed to fit is now one of my favourites."* — ACP.
>
> **[Get the fit →](https://fitwellbuckle.co/pages/m1-micro-adjust-buckle)** — Tom

(Anchor the $80–200 deployant, never a $5 OEM buckle — the lone 2★
"overpriced" review anchored low. Quotes verbatim from [[vocabulary-map]];
swap in fresh creator quotes from Workstream 2 as they land.)

**E4 (day 8) — Most people don't stop at one**
Subject: *Most people don't stop at one* · Preview: *Once one watch fits "just so," the others start to bother you.*
> The pattern we see: someone fixes the fit on one watch, wears it a week,
> and the *other* strap watches start to feel wrong.
>
> *"I own four already and eventually want them for all of my straps."*
> *"Just bought my 5th."*
>
> No bundle or special deal needed — your 15% ({% coupon_code 'WELCOME15' %})
> works on however many you add. If you've got two or three strap watches in
> rotation, this is the easy time to sort them in one go.
>
> **[Fit out the rotation →](https://fitwellbuckle.co/collections/all)** — Tom

(Deliberate divergence from the W5 doc's "Most collectors buy 3 → bundle" —
no bundle SKU exists, so E4 drives a bigger *first* order on the existing
code, which is the actual lift mechanism.)

---

# Klaviyo build spec — what Tom builds, what I need

v1 is paste-based (the Phase 4 pipeline isn't built). Everything below is
**one-time build config** — none of it is a per-customer human step.

## What I need from you (facts/decisions)
1. **Confirm the M4 setup mechanics** (E1-M4) and the M1 description.
2. **Canonical URLs** — M4 product handle, M1 PDP, shop/collection handle.
3. **POS detection** — confirmed: Shopify *sales channel = POS*. Confirm the
   exact order property Klaviyo sees (usually `source_name` / "Sales Channel").
4. **Domestic = which country?** (your fulfillment origin — domestic vs
   international split for the review flow).
5. **Judge.me unique-review-link merge tag** name (from the integration).
6. **Approve:** single-use D30 code; welcome challenger as an A/B clone
   (not a replacement).

## What you build in Klaviyo / Shopify (UI)
1. **Tag core products** into a Shopify collection "Core Products" (M1 + M4
   families) — makes "core order" targeting and the cross-sell recommendation
   block trivial, and future M2/M3/M5 just join the collection.
2. **Discounts:** a Shopify price rule (25% off, min 5 units, 30-day) + a
   Klaviyo **Coupon** pointing at it (unique codes) → `OUTFIT25`. Same for
   `WELCOME15` if the challenger goes live.
3. **Judge.me ↔ Klaviyo integration:** install it, confirm the "Reviewed"
   event flows to Klaviyo, grab the unique review-link tag, and **turn off
   Judge.me's native review emails**.
4. **Sender/reply-to:** all flows from `info@` (→ Tom + Oliver + Melanie).
5. **Build Flow A — Post-Purchase Nurture** (trigger: *Fulfilled Order*):
   - Entry filter: order contains a "Core Products" item (excludes
     accessory-only). Smart sending on.
   - **Per-product setup split:** Trigger Split on the order's products →
     Conditional Split "has Placed Order with [that product] **before** this
     event, zero times" → if true, send the matching **E1** (M1 or M4) at F+2.
   - **First-order arc:** Conditional Split "Placed Order zero times before
     this" (true `first_buyer`) → time-delay chain E2 (F+8) → E3 (F+24) →
     E4 (F+38). E3 uses the M1-owner / M4-owner variant per what they bought
     (or the recommendation block once the catalog grows).
   - **Outfitter divert:** Conditional Split — units owned incl. this order
     ≥5 OR total orders ≥3 → **Founder-touch** (skip E4).
6. **Build Flow B — Review Request** (trigger: *Fulfilled Order*):
   - Flow settings: trigger **once per customer**; entry filter "has not
     placed a review" if expressible, else rely on the reminder suppression.
   - Conditional Split 1: POS? (sales channel = POS) → POS branch (ask F+10).
   - Else Conditional Split 2: shipping country = [domestic] → Domestic (F+14),
     else International (F+26).
   - Each branch: delay → **Review Ask** → delay +7 → Conditional Split
     "Reviewed since flow start?" → if no, **Review Reminder**.
7. **Paste** the copy above into each email; I'll do a render/QA pass against
   what you've built and we iterate in place.

## Recommended infra upgrade (not blocking v1)
**Add a "delivered" signal** (Shop app or Aftership free tier → Klaviyo). It
collapses the review flow's 3-way geo guess into a single flat
**"delivered + 10 days"** for everyone, permanently killing the
"asked-before-it-arrived" failure mode. Do it when convenient; v1 ships
fulfilled-based without it.

---

## Open items for Tom

1. The 6 facts/decisions under "What I need from you" above.
2. **In-between tier** (2nd order, not yet outfitter) currently gets only
   setup from Flow A — fine for v1, but a candidate "rising collector" nudge
   later (its natural home may be the outfit-campaign flow, not this one).
3. Delivered-signal upgrade: now or later?
4. Then: build skeletons → paste → I QA → activate.

## Related
- [[retention-loop]] · [[360-campaign]] (W5) · [[personas]] · [[vocabulary-map]]
  · [[event-taxonomy]] · `specs/ops/domains/product.md`
  · `specs/work-plans/todo/klaviyo-integration.md` (Phase 4 pipeline + safety)
