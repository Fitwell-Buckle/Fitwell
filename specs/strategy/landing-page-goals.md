# Landing Page Goals

Last updated: 2026-05-25

> **Status: starter draft.** Defines the template; the registry below
> is intentionally sparse and gets populated as pages are built or
> audited. Every marketing page should appear here with its declared
> target.

## Purpose

Every marketing page in this repo declares — explicitly, in this file
— which persona and funnel stage it targets, and what would count as
the page doing its job. This forces design intent up front and makes
it possible to measure whether pages are actually working.

If a page doesn't appear in this registry, it doesn't have a clear
purpose and either needs one or needs to be removed.

## How to Use This Doc

1. When you build or substantially redesign a marketing page, add or
   update its entry below.
2. The page's `page_goal_stage` and `page_target_persona` PostHog
   properties ([[event-taxonomy]]) must match this declaration.
3. If a page is testing a hypothesis ([[hypotheses]]), link it.
4. Audit periodically: does the page actually move the cohort it
   targets to the next stage?

## Entry Template

```
### <route> — <short name>
**Route:** /path/here
**Target persona:** P1_collector | P2_casual | mixed | other (specify)
**Target funnel stage:** unaware | problem_aware | solution_aware | brand_aware | considering | converting | outfitting
**Page goal in one sentence:** What the page is designed to do for the visitor.
**Primary CTA:** What action moves them to the next stage.
**Success signal (PostHog):** Which event(s) indicate the page worked.
**Testing hypothesis:** H<N> if applicable, or "—"
**Variant of:** parent route if this is an A/B variant, or "—"
**Last reviewed:** YYYY-MM-DD
**Notes:** Anything else relevant.
```

## Design Principles

- **One *primary* target per page, with defensive design for
  off-target arrivals.** Pages should be designed for one persona at
  one stage — but per [[funnel]] Targeting Discipline, the upstream
  channel is intentionally cast broad-net early on, so the page will
  *actually* receive mixed-persona traffic until the channel
  narrows. Design for the primary persona without actively repelling
  the rest.
- **Self-sorting CTAs let off-target visitors find a path that
  fits them.** A page primarily targeting P2 Curators (deployant-
  anchor framing) should still offer a clear "Looking for the comfort
  fix? → /comfort" or "Outfitting a collection? → /collectors" path,
  rather than bouncing the off-target visitor. Self-sorting is the
  page-level analogue of broad-net upstream targeting.
- **The next stage, not the final stage.** A page targeting
  `problem_aware` visitors should aim to move them to
  `solution_aware`, not all the way to `converting`.
- **CTAs match the target stage.** Problem-awareness pages
  shouldn't have "Buy Now" as the primary CTA — they should have
  "See how it works." Conversion pages shouldn't have "Learn more"
  as the primary CTA.
- **Persona language matches the persona.** Collector pages can
  assume vocabulary and tolerate density. Casual-owner pages must
  define terms and prioritize visual demonstration.
- **Narrow as the channel narrows.** Pages that today serve a broad
  audience because their upstream channel is broad-net should narrow
  over time as PostHog cohort data shows which segments actually
  convert through them. Page narrowing is downstream of channel
  narrowing, not ahead of it.

## Page Registry

> The pages below need to be audited against the actual current
> `(marketing)` route group and either confirmed or replaced with
> real entries. Treat anything here as placeholder until reviewed.

### `/` — Homepage
**Route:** `/`
**Target persona:** mixed (currently)
**Target funnel stage:** mixed (currently)
**Page goal in one sentence:** _Needs audit — what is the homepage trying to do, and for whom?_
**Primary CTA:** _to confirm_
**Success signal (PostHog):** _to confirm_
**Testing hypothesis:** —
**Variant of:** —
**Last reviewed:** not yet audited
**Notes:** Likely candidate to split into persona-specific entry
points (collector-focused vs. casual-focused) or to commit to a
single primary persona. See [[hypotheses]] H4 — branded-search
arrivals may need a different homepage experience than cold
traffic.

### Product detail pages
**Route:** `/products/<slug>`
**Target persona:** mixed (`P1_collector` primary, `P2_casual` secondary)
**Target funnel stage:** `considering` → `converting`
**Page goal in one sentence:** _Needs audit per product._
**Primary CTA:** Add to cart
**Success signal (PostHog):** `cart_item_added`
**Testing hypothesis:** —
**Variant of:** —
**Last reviewed:** not yet audited
**Notes:** PDP visitors are typically already further down the
funnel. Specs density and compatibility detail matters for P1;
visual demonstration matters for P2.

---

### `/pages/fitwell-buckle-reviews` — Reviews / proof page
**Route:** `/pages/fitwell-buckle-reviews`
**Target persona:** mixed (P5 wasted-watch / P2 casual-owner primary)
**Target funnel stage:** `considering` → `converting`
**Page goal in one sentence:** Convert a brand-aware buyer (typically Meta/creator-exposed, now searching "fitwell buckle review" to validate) with real owner proof, organized around the between-holes outcome — no discount.
**Primary CTA:** dual — `reviews_shop_m1` → `/collections/buckles` and `reviews_shop_m4` → `/collections/fitwell-universal-micro-adjust-link`
**Success signal (PostHog):** `cta_clicked` (`reviews_shop_m1` / `reviews_shop_m4`); `section_scrolled_into_view` on `comparison`/`service`; downstream `product_viewed` → `purchase_completed`.
**Testing hypothesis:** — (also captures the GSC "fitwell buckle review" SERP gap, pos 9.3 → page 1; see `work-plans/todo/gsc-organic-search-plays.md` Phase 1)
**Variant of:** —
**Last reviewed:** 2026-06-30
**Notes:** Built 2026-06-30 from the live Judge.me corpus (97 reviews, 4.6★) — all quotes verbatim. Native Craft custom-liquid section (scheme-2), template `templates/page.fitwell-buckle-reviews.json`. Proof-led, full-price conviction per brand guardrails (no caveats/limitations section by design). Sections: hero → problem → comparison (deployant anchor) → finish → service (founder) → collectors → cta.

---

## Pages to Build (Backlog)

Candidates surfaced by the strategy conversation but not yet built:

- **`/why-micro-adjust`** — `problem_aware` → `solution_aware`
  for P2 Casual Owners. Names the comfort problem, explains why
  micro-adjust solves it, demonstrates with video.
- **`/compatibility/<watch-brand>`** — `solution_aware` →
  `considering` for both personas. Brand-specific landing pages
  for compatibility-driven search traffic.
- **`/collectors`** — `brand_aware` → `considering` for P1.
  Technical depth, materials, manufacturing detail.
- **`/the-problem`** — `unaware` → `problem_aware` for cold
  traffic from awareness ads.

Each of these should get a full registry entry when built.

## Audit Cadence

Quarterly: walk the registry and ask, for each entry:
- Does PostHog data show this page actually moving its target
  cohort to the next stage?
- Is the declared target still right?
- Is the page worth keeping, redesigning, or retiring?

## Related

- [[personas]] — persona definitions referenced by every entry.
- [[funnel]] — stage definitions referenced by every entry.
- [[event-taxonomy]] — required PostHog properties on every page.
- [[hypotheses]] — pages testing specific hypotheses link here.
