# Work Plan: GSC organic-search plays (closer-channel + small SEO wins)

## Context

GSC went live 2026-06-29 (`completed/gsc-pipeline-setup.md`) with 16 months of
history. First strategic read of the data (last 90 days) reframed what organic
search *is* for Fitwell:

| | Impressions | Clicks | CTR |
|---|---|---|---|
| **Branded** ("fitwell…") | 32,625 (93%) | 1,580 (89%) | 4.8% |
| **Non-branded** | 2,579 (7%) | 192 (11%) | 7.4% |

**93% of organic visibility is people searching the brand by name.** This is the
quantified proof that **Google is the closer, not the introducer** (matches
`specs/ops/PRIORITIES.md` positioning + `specs/strategy/funnel.md`). Meta/creators
create the demand; search harvests it, branded. There is almost **zero
problem-language search volume** ("watch too tight", "between holes") — the
problem isn't one people search for, so SEO won't *introduce* anyone.

**Therefore this is NOT a big SEO content bet.** It's (a) tightening the branded
SERP, which is the closing surface, and (b) a couple of small, genuinely winnable
non-branded pages. Set expectations accordingly — don't over-invest.

### Reference data (last 90d, so you don't have to re-query)

Non-branded queries we already own (defend): `adjustable watch buckle` (pos 2.6,
102 clicks), `micro adjust watch buckle` (pos 3.2, 39), `adjustable watch strap
buckle` (pos 3.3, 17), `micro adjust buckle` (pos 2.8, 10).

Striking-distance gaps (impressions, ~0 clicks, page 2): `watch buckle` (pos 11),
`watch strap buckle` (pos 13), `titanium watch buckle` (pos 4.9 but low CTR),
`fitwell buckle review` (pos 9.3), bare `fitwell` (pos 6.1 — namesake
competition), `delugs micro adjust buckle` (pos 7 — competitor intent).

Top pages: homepage 9,040 impr / 1,618 clicks (branded catch-all);
`/collections/buckles` 3,933 / 84; M4 page
`/pages/micro-adjust-for-your-existing-watch-straps` 325 / 2 (nearly invisible).

## Dependencies

- **Brand guardrails** (`fitwell-brand` skill) — load before writing any copy.
  Non-negotiables that bind every play below: never discount/never lead with
  price; anchor the comparison (not vs a cheap OEM buckle); proof carries the
  sale; lead with the *between-holes outcome*, not the on-wrist mechanism.
- `specs/strategy/personas.md`, `funnel.md`, `landing-page-goals.md` — every new
  page declares a persona + funnel stage (add an entry to landing-page-goals.md).
- `specs/strategy/vocabulary-map.md` — customer language for on-page copy.
- Live-theme/page edits use the Shopify CLI workflow
  (`specs/current/shopify-theme-edits.md`) + PostHog instrumentation tags
  (`specs/current/posthog-instrumentation.md`, `data-section`/`data-cta`).

## Scope

**In:** branded-SERP tightening + a reviews/proof page; `/collections/buckles`
on-page optimization; a Fitwell-vs-Delugs comparison page; turn the GSC read into
a recurring cut.
**Out:** a big SEO content engine; chasing generic head terms as an acquisition
play; the weightlifting "micro adjustment lifting belt/straps" noise (brand-name
collision, 0 clicks — ignore).

## Implementation Phases

### Phase 1: Branded SERP + reviews page (highest ROI — the closer surface)
- [ ] Audit the brand SERP: what shows for "fitwell" / "fitwell buckle" /
      "fitwell buckle review" / "fitwell buckle reddit". Homepage title/meta,
      sitelinks, structured data.
- [ ] Build a **reviews / social-proof page** to own `fitwell buckle review`
      (currently pos 9.3) — proof-led, full-price conviction, NOT a discount
      (guardrail #1). Persona P5/P2, funnel stage `converting`. Pull from the
      Judge.me corpus (`review` table) + vocabulary-map language.
- [ ] Add it to `landing-page-goals.md` with persona/stage; instrument with
      PostHog `data-section`/`data-cta` tags.
- [ ] Tests/QA per the theme-edit + instrumentation recipes.

### Phase 2: `/collections/buckles` on-page optimization (defend + extend)
- [ ] We own `adjustable watch buckle` (pos 2.6); the gap is `watch buckle`
      (pos 11) / `watch strap buckle` (pos 13) on page 2 landing here with zero
      clicks. Rewrite the collection's title + on-page copy in the customer's
      own language ("between holes", "tweener", "finally fits") — lead with the
      outcome, surface finish + founder/service (the defensible secondary
      benefits), don't lead with the on-wrist mechanism. Persona P5/P3, stage
      `solution_aware`.
- [ ] Re-check positions after ~2-4 weeks of GSC data (the staleness monitor
      keeps the feed live).

### Phase 3: Fitwell vs Delugs comparison page (competitor intent)
- [ ] `delugs micro adjust buckle` (pos 7) = consideration-stage searchers
      comparing. Build a comparison page that anchors on Fitwell being the only
      real *strap* micro-adjust (anchor framing, guardrail #3 — never vs a cheap
      buckle, never on price). M1 vs M4 explained. Persona P2/P3, stage
      `considering`. Honest about the mechanism (guardrail #5: "set once", not
      effortless on-wrist tightening).
- [ ] Add to landing-page-goals.md + instrument.

### Phase 4: Recurring GSC read (set-and-watch)
- [ ] Stand up a recurring cut (admin view or scheduled summary): branded vs
      non-branded trend (leading indicator of demand creation — branded search
      should rise days after Meta/creator spikes), striking-distance movers, and
      M4-page visibility. Cheap cross-check on whether top-of-funnel spend works.

## Notes

- **Expectation-setting:** organic is a closer/measurement channel here, not an
  acquisition engine. Phases 1-2 are the real ROI; Phase 3 is a small bet; Phase
  4 is low-effort monitoring. Do them in order, stop if signal is weak — don't
  let this balloon into an SEO content program the data doesn't support.
- Bare "fitwell" at pos 6 is namesake competition (Fitwell shoes/fitness) — hard
  to fully win; don't sink time into it beyond the SERP basics in Phase 1.
- Connects to the 360 content sprint / destination pages — but as supporting
  closer-channel hygiene, not the lead acquisition workstream (that stays
  Meta/creator + the retention motion).
