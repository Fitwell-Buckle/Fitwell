# Personas

Last updated: 2026-05-25

> **Status: starter draft.** Captures the persona thinking from the
> Greg/Tom/Oliver strategy conversation. Needs a dedicated 30-min
> persona exercise (go wide, then collapse) before treating these as
> canonical. Refine continuously against real traffic data.

## Why Personas Matter Here

Personas are the rails on which everything else sits — product design,
landing page copy, ad creative, site architecture, PostHog event
tagging. When personas are aligned, every artifact targets a known
audience at a known stage. When they're vague, copy gets generic, ads
spray, and analytics produce mush.

We use personas to answer "who is this for?" before "what does it say?"

## How to Use This Doc

- Every marketing artifact (page, ad, email, campaign) should name its
  target persona. If you can't pick one, the artifact is too generic.
- Personas evolve. The current distribution is an estimate; real
  traffic, PostHog cohorts, and customer interviews refine it.
- When you add or change a persona, update this file in the same
  commit as the work that prompted the change.

## Current Personas (Starter Set)

### P1 — The Collector
**Who:** Watch enthusiast with 5+ watches in active rotation. Reads
WatchUSeek/Reddit r/Watches, follows specific brands obsessively,
knows what a micro-adjust clasp is and why it matters.

**Pain:** Has lived with the comfort problem long enough to have
tried multiple solutions. Knows the off-the-shelf options are
mediocre.

**How they find us:** Direct search ("micro adjust buckle",
"[watch brand] aftermarket clasp"), enthusiast forums, word of
mouth in collector circles.

**What converts them:** Technical depth, precision specs, compatibility
detail, evidence we know watches at their level. Price is a near
non-issue.

**Outfitting behavior:** Likely to buy multiple buckles to outfit a
collection. Lifetime value is substantially higher than first-order
revenue.

**Funnel entry point:** Usually arrives `solution_aware` or
`brand_aware`. Short path to purchase.

---

### P2 — The Casual Owner
**Who:** Owns 1–2 watches. Wears the same watch most days. May have
upgraded once or be wearing a gift. Not deep in watch culture.

**Pain:** Has a vague awareness that their watch doesn't fit quite
right — maybe loose in the morning, tight after a meal, has a notch
between two holes that's right. Hasn't named the problem or gone
looking for a solution.

**How they find us:** Ads, social, broad search, recommendations.
Rarely arrives by direct intent.

**What converts them:** Understanding that the problem they tolerate
has a name and a fix. Visual/video demonstration. Social proof.
Price sensitivity is real but not dominant if the value is clear.

**Outfitting behavior:** First purchase likely covers their primary
watch. Repeat purchase depends on whether they acquire more watches
later or recommend to a friend.

**Funnel entry point:** Usually `unaware` or `problem_aware`. Long
path; multiple touches typically required.

---

## Personas to Develop

These are mentioned implicitly but not yet fleshed out — candidates for
the next refinement pass:

- **The Gift Buyer** — buying for a partner or family member. Different
  intent signals, different copy needs.
- **The Brand Loyalist** — owns one specific brand (Rolex, Omega,
  Seiko, etc.) and is searching for a brand-compatible solution.
  May be a sub-segment of P1 or P2.
- **The Crossover Athlete** — wears a sports watch (dive, field) and
  needs the buckle to handle wrist swelling through the day. Pain is
  acute and physical, not aesthetic.
- **The B2B / Bulk Buyer** — watchmaker, retailer, or corporate gifting
  contact. Out of scope for direct marketing but worth flagging.

## Distribution (Estimate)

We don't have validated data yet. Current gut estimate of inbound
traffic, **to be replaced with PostHog cohort data once events are
instrumented**:

| Persona | % of traffic (est.) | % of revenue (est.) |
|---|---|---|
| P1 Collector | ~10–20% | ~40–60% |
| P2 Casual Owner | ~70–85% | ~30–50% |
| Other / unclassified | ~5–10% | ~5–10% |

**Aspirational shift over time:** as brand awareness grows, the
absolute volume of `unaware` and `problem_aware` traffic should
shrink as a percentage, replaced by direct-search `brand_aware`
traffic that arrives close to purchase intent. The Collector segment
may grow in absolute terms but shrink as a percentage of total.

## Open Questions

- What's the actual revenue split between P1 and P2 today? (Needs
  Shopify customer cohorting tagged by acquisition source.)
- How do we identify a persona from PostHog session data? What
  signals separate Collector vs. Casual? (Candidate signals: time on
  technical-spec sections, search referrer, ad source.)
- Is there a "Watch-curious newcomer" persona — someone who just
  bought their first nice watch and is exploring upgrades — that's
  meaningfully different from P2?
- How does persona shift after first purchase? Do P2 Casual buyers
  become P1 Collectors over time?

## Related

- [[funnel]] — funnel stages, used alongside personas to target
  every artifact.
- [[hypotheses]] — beliefs about persona behavior worth validating.
- [[event-taxonomy]] — how persona is captured in PostHog events.
- [[landing-page-goals]] — every landing page declares its target
  persona.
