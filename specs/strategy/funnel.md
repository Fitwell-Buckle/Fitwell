# Funnel Stages

Last updated: 2026-05-25

> **Status: starter draft.** Defines the canonical funnel vocabulary
> used across all marketing work. Refine as we learn what stages
> actually predict behavior in our PostHog data.

## Why a Canonical Funnel

Without a shared vocabulary, every landing page sets its own implicit
goal, every event gets named differently, and we can't ask "did this
page move people from X to Y?" The funnel is the vocabulary that lets
us instrument and measure progression.

Every PostHog event, landing page, and ad campaign declares which
funnel stage it targets. Pages are designed to move someone from one
specific stage to the next, not to do everything for everyone.

## How to Use This Doc

- Pick **one** stage as the target for any artifact. If you want to
  serve two stages, build two artifacts.
- Stage names below are the canonical strings used in PostHog
  properties and code constants. Don't synonym-drift.
- "Signals of progression" are the observable cues that someone
  moved to the next stage. These become the basis for PostHog event
  definitions in [[event-taxonomy]].

## The Stages

### `unaware`
**Mental state:** Doesn't know they have a problem. Their watch
fits "well enough." Has never thought about clasp design as a
variable.

**Where we meet them:** Top-of-funnel ads, social, broad-interest
content. Almost never via search.

**Page goal:** Name the problem. "Your watch fits one way at 9am
and another at 3pm — here's why, and why it's fixable."

**Signal of progression to `problem_aware`:** dwell on the
problem-explanation section, video play, scroll past the fold.

---

### `problem_aware`
**Mental state:** Now realizes the comfort issue has a name. Doesn't
yet know solutions exist or are worth pursuing.

**Where we meet them:** Educational content, problem-focused landing
pages, retargeted ads with problem framing.

**Page goal:** Introduce the existence of a solution category
(micro-adjust buckles). Explain why off-the-shelf options are
inadequate.

**Signal of progression to `solution_aware`:** scroll to
"how it works" section, watch demo video, click into product
detail, return visit.

---

### `solution_aware`
**Mental state:** Knows micro-adjust buckles exist. May or may not
know about Fitwell specifically. Comparing options or considering
whether to act.

**Where we meet them:** Search ads on solution terms ("micro adjust
buckle", "best watch clasp"), comparison content, review sites.

**Page goal:** Position Fitwell as the answer. Differentiate from
alternatives. Provide evidence (reviews, specs, demonstrations).

**Signal of progression to `brand_aware`:** product page visit,
specs/compatibility section dwell, navigation to about/story.

---

### `brand_aware`
**Mental state:** Knows Fitwell exists and what we make. Forming
an opinion about whether we're the right choice.

**Where we meet them:** Brand search ("fitwell buckle"), email,
return visits, social follows.

**Page goal:** Build trust. Story, materials, manufacturing,
warranty, founder voice. Answer "why should I trust you with
$XXX for a buckle?"

**Signal of progression to `considering`:** add to cart, save for
later, navigate to checkout, compatibility checker use, return
visit with intent signals.

---

### `considering`
**Mental state:** Actively evaluating purchase. Has questions about
compatibility, fit, shipping, returns, gifting.

**Where we meet them:** Product detail pages, FAQ, compatibility
tools, abandoned-cart email.

**Page goal:** Remove friction. Answer the last objections. Make
checkout obvious.

**Signal of progression to `converting`:** checkout start, payment
method selected, address entered.

---

### `converting`
**Mental state:** Has committed; just needs to complete the
transaction.

**Where we meet them:** Shopify checkout (out of our direct control
but tracked).

**Page goal:** Don't break the conversion. Checkout integrity, no
surprises, fast.

**Signal of progression to `outfitting`:** completed purchase, post-
purchase upsell view, return visit within N days.

---

### `outfitting`
**Mental state:** Has at least one Fitwell buckle. Considering
additional buckles for other watches in their collection.

**Where we meet them:** Post-purchase email, account/order pages,
retargeted ads with "complete your collection" framing.

**Page goal:** Reduce friction for repeat purchase. Surface what
they don't have yet. Recognize their existing investment.

**Signal of "completion":** repeat order, multi-buckle order,
referral.

---

## Stage Transition Matrix

Most users do not move stage-by-stage. A `brand_aware` enthusiast
who lands directly on the product page may skip straight to
`converting`. The stages are not gates — they're locations on a map.

Common patterns we expect:

- **Collector (P1) path:** `solution_aware` → `brand_aware` →
  `converting` → `outfitting` (compressed)
- **Casual Owner (P2) path:** `unaware` → `problem_aware` →
  `solution_aware` → `brand_aware` → `considering` → `converting`
  (long, multi-touch)
- **Gift Buyer path:** likely enters at `solution_aware` after
  someone else's recommendation; skips persona-specific awareness
  building.

## Anti-Patterns

- **Building one page that targets all stages.** It will be bad at
  all of them. Pick one.
- **Tracking conversion as the only event.** If we only see the
  final step, we can't tell which stage is leaking.
- **Treating `unaware` traffic the same as `solution_aware`.**
  Wrong message at the wrong time wastes spend.

## Open Questions

- Is `brand_aware` actually distinct from `considering` in
  observable behavior, or do we collapse them?
- Should `outfitting` be a funnel stage or treated as a separate
  retention loop?
- How do we attribute someone who moves through multiple stages
  across multiple sessions and devices?

## Related

- [[personas]] — combined with funnel stage to fully scope an
  artifact's target.
- [[event-taxonomy]] — event names are derived from these stages.
- [[hypotheses]] — beliefs about stage transitions worth
  validating.
- [[landing-page-goals]] — every page declares one target stage.
