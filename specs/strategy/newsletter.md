# Newsletter

Last updated: 2026-06-10

> **Status: in-flight.** Strategy decided. Engine build is Session 2 work.
> See [newsletter-engine.md](../current/newsletter-engine.md) for the
> technical implementation plan.

## Positioning

**"Everything that matters in watches. In your inbox before your first meeting."**

A daily B2B-leaning watch industry briefing — Mon–Fri morning send. Built
as a Fitwell-owned content asset (not an independent publication).
Designed to drive Fitwell name recognition with the personas already
defined in [personas.md](personas.md), not to grow a standalone subscriber
base for sale.

## Why we're building it

Fitwell sits inside the watch industry but is currently invisible to most
of it. The personas that matter most for Fitwell (P1a/P1b on the consumer
side; B1–B6 on the partner side) are the same people who'd subscribe to a
serious industry brief. A daily presence in their inbox compounds Fitwell's
credibility cheaper than any other channel.

Forked from a working content engine Tom built for a cannabis newsletter
([Elevated Insights](https://github.com/fitwell-tom/elevated-insights-newsletter),
35 subs, 63% open rate). The engine works; the cannabis vertical wasn't
worth scaling. The watch vertical is.

## Audience (anchored to existing personas)

The newsletter serves the **subset of Fitwell's personas who treat the
watch industry as something worth tracking daily**, not as something they
consume opportunistically. Specifically:

| Persona | Why this newsletter reaches them |
|---------|-----------------------------------|
| **P1a — Watch Advocate** | Tier 1 active posters. They already follow industry news; we land in their inbox as the synthesis tool. Influence multipliers — each P1a subscriber compounds into P2/P4 reach via their posts. |
| **P1b — Deep Collector** | Tier 1 quiet. They want the industry signal but don't post. Highest-LTV consumer segment. A daily brief gives them what they currently piece together from 6–12 sources. |
| **B1 — Strap Maker / Reseller** | Need industry intel to position their own product roadmap. Cheap way to be in front of every Delugs/BluShark/Crown & Buckle-class buyer. |
| **B2 — Watch Retailer** | Independent boutique owners scanning for what's coming. |
| **B3 — Microbrand Brand** | Founders tracking competitor launches, supply-chain news, retail movements. Already overlap heavily with the audience our [creator-program](creator-program.md) reaches. |
| **B4 — Established Brand** | Product / sourcing directors. Aspirational reach. |
| **B5 / B6 — OEM** | Manufacturers tracking brand-side movement to anticipate sourcing demand. |

**Explicitly NOT targeting:**
- **Tier 2/3 consumers** (P2, P3, P4) — saturated by Hodinkee, ABTW, Worn & Wound. Different content needs (lifestyle, reviews, listicles). Different acquisition cost. We'd lose to incumbents.
- **Tier 0 search-led consumers** — they're not reading newsletters.

Total addressable: ~50–80K globally across these personas.

## Editorial cut

Cover stories that bridge insider and serious-enthusiast interest. A
Rolex CEO change is news to both a B4 sourcing director and a P1b
collector. A Bulle manufacture expansion is a production-capacity story
AND a waitlist story.

**Cover heavy:**
- Brand financials (Swatch Group, Richemont, LVMH Watches & Jewelry earnings)
- M&A and rumors of M&A
- Retail movements (boutique openings/closings, dealer changes, Hodinkee Shop curation shifts)
- Auction results with market commentary
- Microbrand drops with business context (run size, founder backstory, trajectory signals)
- Supply chain (movement makers, dial suppliers, hairspring makers — anything that affects multiple brands)
- Executive moves and brand strategy shifts

**Cover lightly or skip:**
- New release walkthroughs without business angle (every enthusiast site does these)
- Pure product reviews
- "Top 10 watches under $X" listicles
- Lifestyle / wrist-shot / collector-of-the-day content

## Classification axis

Each story gets one Segment tag and one Type tag. Email organizes
primarily by Segment with Type subheaders.

**Segment** (one of):
- Luxury / Swiss majors (Rolex, Patek, AP, Vacheron, Lange, Breguet, Blancpain, Cartier high-end)
- Mid-tier (Omega, IWC, Jaeger, Tudor, Grand Seiko, Longines, TAG, Zenith)
- Microbrand & Indie (Halios, Nodus, Lorier, Baltic, Christopher Ward, Farer, Anordain, Studio Underd0g, MB&F, Urwerk, Massena LAB)
- Vintage & Auction

**Type** (one of):
- Releases & Launches
- Business & Industry (M&A, earnings, executive moves, retail, supply chain)
- Auction & Market
- Community / Culture / Analysis

## Voice direction

Insider-knowing. Think Puck News, scaled to watches. Opinionated,
name-dropping when justified, gossipy when the gossip matters
commercially. Brief reads like it was written by someone with taste and
a network, not by an aggregator algorithm.

Avoid: trade-press blandness, enthusiast-blog gushing, "we're excited
to share" newsletter-isms.

Final voice settles after the first three sends; Tom edits the test
brief, refinements feed back into the prompt set.

## Source list (proposed — confirm before Session 2 build)

### Editorial
Hodinkee, A Blog to Watch, Worn & Wound, Fratello, Monochrome Watches,
Revolution Watch, Time + Tide, Quill & Pad, SJX Watches, Watches of
Espionage, Hairspring, Wind Vintage

### Industry / B2B
WatchPro, Europa Star, Watchonista (when business angle)

### Community / market signal
WatchCrunch, Reddit r/watches, Reddit r/Watchexchange

### Auction houses
Phillips Watches, Christie's Watches, Sotheby's Watches, Antiquorum,
Bonhams Watches

### Earnings / corporate
Swatch Group IR, Richemont IR, LVMH Watches & Jewelry segment
reporting, Kering Watches (when relevant)

### Microbrand release tracking
Curated set initially: Halios, Nodus, Lorier, Baltic, Christopher Ward,
Farer, Anordain, Studio Underd0g, Massena LAB, Furlan Marri, DiRenzo.
Expandable.

### Sources NOT pulled (deliberately)
- WatchUseek forum threads (signal-to-noise too low)
- r/Watchexchange listings as content (subscribers care about market
  trends, not specific listings — though aggregate listing data is fair
  game)
- Pure marketing / PR sites without editorial filter

## Send window

**5am ET / 11am CET / 5pm SGT.** One send hits Geneva (Swiss execs in
business hours), London (industry/auction crowd just opening), New York
(pre-wakeup, lands in inbox before they read email), Singapore (post-
lunch). Captures all four major watch-industry markets.

## Measurement

Newsletter is a **persona × funnel artifact** per Rule 14, so it gets
tagged for measurement:

- **Persona attribution**: subscriber import flags subscribers' likely
  primary persona at signup (P1a, P1b, B-codes via job title field).
  Validated against post-purchase behavior over time.
- **Funnel stage**: top-of-funnel for new subscribers, advocacy /
  retention for existing Fitwell customers.
- **PostHog events**: `newsletter_subscribed`, `newsletter_opened`,
  `newsletter_clicked`, `newsletter_unsubscribed` — wired to the same
  funnel as other marketing surfaces per
  [event-taxonomy.md](event-taxonomy.md).
- **Cross-attribution**: Klaviyo segments tag overlap between newsletter
  subscribers and Shopify customers. We can measure "newsletter readers
  who bought a buckle" cleanly because both lists share an email key in
  Klaviyo.

## Open decisions (blocking Session 2 build)

- **Brand name and domain.** Working title is `Fitwell Newsletter`.
  Candidates that surfaced in strategy: "Caliber Daily", "The Crown
  Brief", "Movement", "Manufacture", "The Watch Industry Briefing".
  Final pick is Tom's. Lean boring-and-credible — positioning is
  serious people who want intel, not entertainment.
- **Confirm 5am ET send time** (recommended above).
- **Soft-launch contact list.** Tom compiles 20–30 watch-industry
  contacts (his current network — Fitwell-adjacent buyers,
  distributors, brand contacts). CSV import to Klaviyo as initial
  segment.
- **Klaviyo list + tag scheme.** New list `newsletter-subscribers` or
  add as a segment tag on the existing Klaviyo list? Decides whether
  the newsletter inherits Fitwell's transactional sender reputation or
  builds its own.

## What this is not

- **Not a sale-path business.** We're not growing the list for a buyer.
  Newsletter exits via Fitwell's exit, or doesn't.
- **Not a separate brand.** This is Fitwell's industry intelligence arm.
  Footer mentions Fitwell. Domain may be Fitwell-adjacent (e.g.
  `newsletter.fitwellbuckle.co`) rather than independent.
- **Not the cannabis newsletter v2.** The cannabis newsletter
  (Elevated Insights) is Tom's separate personal side project on
  autopilot. The engine pattern transfers; the codebase does not.
