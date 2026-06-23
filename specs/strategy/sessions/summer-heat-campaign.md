# Summer Heat — Klaviyo Campaign (draft)

> Working draft for Tom. Edit freely — Claude re-reads this file to pick up your changes.
> Last touched: 2026-06-23. Not a committed spec yet.

## What this is

A one-shot Klaviyo **campaign** (broadcast), not a flow, to the consumer marketing
list. Seasonal hook: summer + the European heat wave → wrists run bigger in the heat →
the strap that fit a few months ago is now between sizes → a watch you love sits in a
drawer. The fix is the Fitwell.

**Voice/constraints locked so far:**
- Seasonal framing, NOT intra-day ("hot in the morning, hot at night" — not "bigger by 3pm").
- Do NOT frame it as on-the-wrist adjustment. (Using "micro-adjust" as the product
  capability is fine — that's the product name.)
- Real customer language: "between holes / between sizes", "too tight on one hole, too
  loose on the next", "the watch you stopped wearing".
- Site voice: precise, understated. "A fine watch deserves more than a strap that pinches."
- Founder-led, sign as Tom.
- Anchor against the wasted watch / keep the strap you love — never a $5 tang buckle.

---

## Segment A — Existing customers (outfit angle)

Goes to anyone who's bought any number of buckles. The job: outfit the watches they
*haven't* fitted yet.

**Subject (A):** It's not the watch. It's the summer.
**Subject (B):** The watches you've stopped wearing this summer
**Preview:** The strap that fit in spring doesn't now. You know the fix.

> Hi {{ first_name|default:"there" }},
>
> Summer's here, there's a heat wave across Europe, and it's warming up everywhere else — which means a bigger wrist. The strap that sat just right a few months ago is suddenly between sizes — too tight on one hole, too loose on the next — and a watch you love ends up in the drawer for months.
>
> You already know the difference a Fitwell makes: the watches you've outfitted sit just right. It's the ones you haven't that go quiet this time of year.
>
> So this is the nudge to outfit the rest. The **[M1 Buckle](→ M1 page)** replaces your existing buckle with half-hole adjustment; the **[M4 Universal Link](→ M4 page)** adds the same to deployants, buckles you'd rather keep, and a touch of length to straps on their last hole. Between them, nothing in your collection has to wait out the summer in a drawer.
>
> And to make it easy — **we're giving you 20% off of three or more**. Use code **[SUMMER20](→ /discount/SUMMER20)** at checkout, now through June 30.
>
> **[Outfit the rest of your collection →](CTA → /discount/SUMMER20?redirect=/collections/all)**

---

## Segment B — Prospects on the list (comfort / conversion angle)

Signed up, never bought. The job: convert. References their live WELCOME15.

**Subject (A):** Summer's here and your watch doesn't fit
**Subject (B):** Between two holes again
**Preview:** Make the watch you stopped wearing wearable again. 15% off inside.

> Hi {{ first_name|default:"there" }},
>
> Summer's here, there's a heat wave across Europe, it's warming up everywhere else, and your wrist is feeling it. The strap that fit a few months ago doesn't anymore — one hole is too tight, and the next is too loose — so your favorite watch ends up in a drawer for months, until the cooler weather comes back.
>
> That's exactly what the **[Fitwell M1 Micro-Adjust Buckle](→ M1 page)** fixes. It doubles the usable positions on your strap and gives you the comfort of half-hole adjustment — so the watch sits perfectly, in any season.
>
> See why so many customers have called it a "**[game changer](→ M1 page)**" for the watches and straps they love.
>
> Your welcome offer still stands — **15% off with code [WELCOME15](→ /discount/WELCOME15)**.
>
> **[Find your buckle →](CTA → /discount/WELCOME15?redirect=/pages/m1-micro-adjust-buckle)**

---

## Offer (locked 2026-06-23)

- **20% off 3+ units**, code **SUMMER20**, now through **June 30**, one use per customer.
- **Why 3+ @ 20% (not 4+ @ 25%):** total contribution = qualifying orders × per-order
  contribution. 4-unit order contributes more ($105 vs $85) but the ≥4 pool is historically
  ~45% of the ≥3 pool (Cut 1) — far below the 81% breakeven needed to win. The 3+ threshold
  also sits adjacent to the largest movable cohort (173 two-unit orders): a 2→3 nudge is a
  3rd buckle for ~$16 net, accretive ~$12 contribution. 4+ asks a 2-unit buyer to double.
  Resolves the "25 vs 20 vs 30" open Q in [[bundle-strategy]].
- Applies to **Segment A only** (customers / outfitting). Segment B prospects stay on
  **WELCOME15** (15% off, any qty) — a 3+ threshold is wrong for a first-time buyer.
- **Shopify dependency:** `SUMMER20` must be created as a Shopify discount (20% off, min 3
  items, expires Jun 30, limit one use per customer) for redemptions to work. The Klaviyo
  tooling does NOT create it — this is a Shopify Admin step.

## Build status (Klaviyo draft tooling — `npm run klaviyo:campaign:draft`)

Two draft campaigns, created via API, **never auto-sent** (sending = manual click in Klaviyo).

| Campaign | Slug | Audience (segment) | Klaviyo campaign ID | Status |
|---|---|---|---|---|
| Segment A (purchasers) | `2026-06-summer-heat-customers` | `UKuzAA` Customers - All Purchasers - Consumer | `01KVV15212YJXT1X2SSCCKDQD0` | **draft pushed** |
| Segment B (non-purchasers) | `2026-06-summer-heat-prospects` | `UiFhJ2` Signed Up - No Purchase - Consumers | `01KVTYQRWNPQKV45X1B6GJVEDG` | **draft pushed** |

No geography split (decided 2026-06-23). Both drafts are in Klaviyo, correct audiences,
will not send until Tom sends manually.

Assets live in `klaviyo/campaigns/<slug>/{template.mjml, config.yaml}`.

## Open items for Tom

- [ ] **Create two segments** (no geo): `Purchasers — all` (Placed Order ≥1) and
      `Non-purchasers` (Placed Order = 0). Tell Claude the names → he fetches IDs + wires both.
- [ ] **Create SUMMER20 in Shopify** before sending Segment A.
- [ ] **Confirm sender:** drafts send from `info@fitwellbuckle.co`, from-name **"Fitwell Buckle Co."**
      — confirm that's a verified sending identity in Klaviyo.
- [ ] **Send:** review each draft in Klaviyo and schedule for tomorrow AM (I draft only).

## Brand design tokens (extracted from the live "Welcome Flow Template", reuse for all campaigns)

- **Logo (white wordmark):** `https://d3k81ch9hvuctc.cloudfront.net/company/R3gvvz/images/15eda511-48d4-4287-88ba-464ecfa6db1a.png` — sits on the dark header bar.
- **Product hero (GIF):** `https://u7unnafmnzoxkkki.public.blob.vercel-storage.com/newsletter/fitwell-buckle.gif?v=3` — same asset the daily newsletter ad uses, shown at **220px** wide, centered, 6px corners (NOT full-bleed).
- **Colors (updated 2026-06-23):** whole email background `#2a3641` (slate) · text `#ffffff` ·
  button `#c08a4d` (brass) · **inline links white + underlined**. One seamless dark email.
- **Fonts:** body = Palatino serif stack · **button = Palatino too** (changed from Quattrocento per Tom). Email-safe stacks, no web-font import.
- **Button:** brass `#c08a4d`, white Palatino text, radius 7px, inner-padding 16px 40px.
- **No signature** — each email ends on the CTA button. Footer = social icons + `{% unsubscribe_link %}`
  + `{{ organization.name }}` + `{{ organization.full_address }}` (the CAN-SPAM postal address; pulls from Klaviyo account settings, same as the Welcome flow).
- **Links (4 per email):** customers → M1 page, M4 page, SUMMER20 code, CTA (collections). prospects → M1 page, WELCOME15 code, full range (collections), CTA (M1 page).
- **Discount link pattern:** `https://www.fitwellbuckle.co/discount/CODE?redirect=/path` — applies the code
  AND lands on the chosen page (bare `/discount/CODE` dumps on the homepage). UTMs appended by pipeline.
- **NOTE:** future work — promote this into a reusable MJML brand shell so campaigns aren't hand-built each time.

## Notes

- UTMs auto-injected by the pipeline: `utm_source=klaviyo&utm_medium=email&utm_campaign=<slug>`.
  The two slugs differ, so the two sends are distinguishable in `/funnel/strategy`.
- Smart sending left on (Klaviyo default) so anyone mid-welcome-flow isn't double-hit same-day.
