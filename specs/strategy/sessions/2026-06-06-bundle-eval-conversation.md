# Session: bundle evaluation — conversation detail (2026-06-06)

> **Purpose.** Focused supplement to [[2026-06-09-retention-led-recal]],
> which captures the broader multi-day session covering bundle +
> in-box card + COGS + Klaviyo Phase 4 + creator program. This doc
> records the bundle-conversation reasoning trail in detail, plus
> three open follow-up threads the master log doesn't yet have:
> the 548-customer × email-list question Tom raised at the end of
> the bundle session, the empty `klaviyo_list_growth_daily` table,
> and the unbuilt `klaviyo_flow_attribution` per-customer grain.
>
> The bundle decision itself (declined; W1 §2 ladder cut; redirect
> to W5 retention + acquisition-side signup-lift) is summarized in
> [[2026-06-09-retention-led-recal]] §"Decisions made" #2 and lives
> in detail in [[../bundle-strategy]] (committed `fb685a0`).

## Why this doc exists

A prior Claude session had run a bundle analysis Tom asked to commit;
the commit step was dropped silently, the analysis was lost, and Tom
re-asked it from scratch on 2026-06-06. The new analysis ran 12+
inflections deep — multiple plausible answers were considered and
rejected — before landing on "decline the bundle." If a future
session only reads the spec, it'll see the destination but not the
rejected branches. That risks reopening the same debate without new
data.

This doc preserves the rejected-branch reasoning so future sessions
can recognize "we already considered this" without re-running the
whole tree.

## The 12 inflections

Captured chronologically. The terse arc is enough — full text lives
in the session transcript and in [[../bundle-strategy]] itself.

1. **"Should we bundle at all?"** Built `scripts/bundle-strategy-
   analysis.ts` with four cuts (units distribution, discount usage,
   frontline vs realized ASP per unit, what 3+ unit buyers actually
   paid). Initial conclusion: drop the ladder, keep single SKU.
2. **Tom corrected the framing.** *"We should do a bundle. The
   question is how many units and at what price."* Also flagged
   free-shipping-at-2+ as the existing implicit incentive and
   multiple 15% codes in circulation (welcome flow, `watchbros15`,
   review-leaver) — not just welcome flow.
3. **Consumer-behavior framing — adjacent categories.** Drew on
   Anson Belt (closest direct analog; sustains 2-pack as default),
   premium straps (BluShark, Crown & Buckle), sunglasses 2-packs.
   Category default at $40 unit price is single + 2-pack, not
   3-tier ladder. Outfit-the-collection is post-confidence and
   time-shifted (D30/D45 email territory, not PDP).
4. **First recommendation — 2-pack at $68 + D30 outfit code.** Tom
   confirmed. $68 matches welcome-flow realized 2-unit price and
   pushes marginal second-unit cost to ~$28 (15-25% off marginal
   unit is the category behavioral threshold).
5. **Extended the script** with cuts 5/6/7 — shipping by units
   bucket (confirmed free-shipping-at-2+ fires on 85% of 2-unit
   orders), discount × order position (discounts are dominantly
   acquisition tools), repeat behavior by first-order size (repeat
   rate flat ~7-8% across first-order sizes; LTV scales linearly
   with first-order size).
6. **Re-ran against prod, rewrote spec around 2-pack@$68 +
   D30 code.**
7. **Tom pushed back: margin transfer risk.** *"Are you sure we're
   not just giving margin away to the 25% of buyers who buy 2
   already?"* Redid the math honestly: of 173 two-unit orders, ~67%
   paid full retail. A public $68 2-pack transfers ~$12/order to
   them = ~$1,400 over the window. Break-even requires ~6pp lift in
   2-unit share — aggressive given free shipping at 2+ is already
   the implicit incentive. Pessimistic / realistic / aggressive
   scenarios came out marginal to negative.
8. **First pivot — welcome-flow-gated 2-pack.** Proposed making the
   2-pack a welcome-flow offer instead of a public PDP SKU. Existing
   full-pay 2-unit buyers untouched; reaches only acquisition-side
   buyers. Math clean: ~$380 contribution per 10% lift in welcome-
   cohort 1→2, $0 give-away to PDP organic traffic.
9. **Tom pushed back: welcome flow reaches too narrow a slice.**
   ~67.5% of first orders don't use the welcome code. Tom asked me
   to enumerate why:
   - **C1.** Came in via another code (creator codes like
     `watchbros15`, partner codes, referral codes) — redeemed a
     15% equivalent through another path, never joined the email
     list. **Likely the largest leak.**
   - **C2.** High-intent buyer, no friction wanted. Branded search /
     creator post / trade-show referral; email-for-discount feels
     like a delay between them and the purchase, not value.
   - **C3.** Gift buyer. Code goes to the wrong inbox; relationship
     is one-off. (Underserved per [[../personas]] Gift Buyer overlay;
     no gift SKU exists.)
   - **C4.** Skeptical of email-for-discount popups categorically.
     Trust threshold not met; would convert better on a guarantee
     badge or social proof.
10. **Tom's pivot: don't bundle. Focus on signup + retention.**
    *"I don't really know what C could be. Maybe you could tell me.
    I don't want to give away the margin, and I think we need to
    figure out another way to get people to bundle, because you
    mentioned it earlier. We've talked about it. A lot of first-time
    buyers are buying one so they can try it out, or one because
    they've got that one strap. We need to figure out how to get
    them back. Well, not first, but we do need to get more people to
    buy the first one and sign up for our email list. Then we need
    to utilize that email list to drive repeat purchase behavior.
    That's probably the direction that we need to go in rather than
    creating bundles."*
11. **Spec rewritten — bundle declined; signup-lift + W5 retention
    are the leverage.** Added the acquisition-side signup-lift
    workstream definition (measure signup rate at first purchase,
    identify C1–C4 leakage shape, run interventions targeting each).
12. **Tom: M4 link bundle isn't active either, shouldn't be in
    scope.** Scrubbed all "keep the M4 bundle as proof of concept"
    framing from spec and 360 edit. Kept only the factual Cut 1
    unit-count footnote (5 line items that were bundles get counted
    as 5 single-unit orders, mildly understating unit volume by
    <2%) because it's a methodology disclosure, not a recommendation.

**Committed:** `fb685a0` — script + spec + 360-campaign W1 §2 +
calendar edit. SHA verified before saying "done" per the new
[[../../../.claude/projects/-Users-tomsimson-code-Fitwell/memory/feedback_commit_verification|commit-verification feedback memory]].

## Rejected branches (don't reopen without new data)

These were considered during the session and explicitly rejected.
Mere preference cannot reopen them; only new data can:

1. **Public PDP 3-pack at $92.** Median 3-unit first-order buyer
   already pays $120 (full retail × 3). The bundle would transfer
   $28/order to a cohort already converting at full price. Rejected
   on Cut 4 evidence.
2. **Public PDP 5-pack at $134.** 0.4% of orders (three in seven
   months); median 5-unit buyer paid $140, only $6 above the
   proposed bundle. Rejected on rounding-error volume.
3. **Public PDP 2-pack at $68.** ~$1,400 margin transfer to existing
   full-pay 2-unit buyers over the window; break-even requires ~6pp
   lift on top of an already-firing free-shipping-at-2+ incentive.
   Rejected on Cut 5 + the realistic-conversion-scenario math.
4. **Welcome-flow-gated 2-pack at $68.** Reach is ~32.5% of first
   orders, leaving the C1–C4 cohort (~67.5%) untouched. Rejected
   on narrow reach + Tom's preference for solving the broader
   acquisition problem directly.
5. **"Keep the existing M4 link bundle as proof of concept."**
   Bundle isn't active. Not in scope. Scrubbed from spec.

## Open thread Tom raised at session end

**How many of the 548 customers who made a D2C purchase in the last
6 months are on the Klaviyo email list, and how many are not?**

Findings from the prod query (2026-06-06):

- **548 distinct customers** (with `customer_id`) made a D2C
  purchase in the last 6 months. 530 have email on file.
- **77 guest orders** in that window — buyers with no customer
  record at all. **Separate leakage shape from C1–C4** (they're not
  "skipped the email signup," they're "no customer record exists at
  all"). Probably concentrated in POS; needs confirmation.
- **Can't answer the precise question from our DB** because of two
  side-findings (see below).

Two paths to actually answer it, both unblocked:

- **Path 1 — Klaviyo API live query.** Hit `/api/profiles` filtered
  by email for the 530 customer emails (Klaviyo supports batched
  filter queries), check `subscriptions.email.marketing.consent`.
  ~30 min of work. Klaviyo credentials are already in Vercel env
  from the existing integration.
- **Path 2 — Klaviyo Admin CSV export.** Export subscribed-profiles
  list from Klaviyo Admin → intersect with the 530 emails locally.
  Manual, no engineering. Same precision; faster if already in the
  Klaviyo dashboard.

**Decision pending from Tom.** This is the obvious first task for
the signup-lift workstream — it sizes the gap the workstream is
designed to close.

## Side-findings (Klaviyo data plumbing)

Not in [[2026-06-09-retention-led-recal]] yet. Surfaced while
querying for the 548-customer overlap.

1. **`klaviyo_list_growth_daily` is empty.** The extract-klaviyo
   cron exists but has never populated this table. Either the cron
   is silently broken or the list-growth extract code path was
   never hit successfully. Worth checking `vercel.json` cron config
   and `/api/cron/extract-klaviyo` logs. **Independently breaks the
   `/funnel/strategy` Klaviyo read view** that depends on this
   table.
2. **`klaviyo_flow_attribution` per-customer grain (Phase 0.5)
   isn't built.** Currently 48 rows, all aggregate-only
   (`customer_id = NULL` on every row). Phase 0.5 in
   [[../../work-plans/todo/klaviyo-integration]] shapes the schema
   for per-order rows but hasn't shipped. Until it does, we can't
   use Klaviyo touch as a "was on the email list at purchase time"
   proxy. Decide whether to ship Phase 0.5 alongside the signup-
   lift workstream or independently.
3. **77 guest orders in the last 6 months have no customer record.**
   Distinct from the C1–C4 hypotheses. Most likely concentrated in
   POS — should confirm. If concentrated in POS, the POS checkout
   flow may need an email-capture improvement. If not, the
   webhook-creates-order-before-customer-sync race may be losing
   customer records.

## How this thread continues

The signup-lift workstream is captured at the conceptual level in
[[../bundle-strategy]] §"Add a new workstream — acquisition-side
email signup lift." [[2026-06-09-retention-led-recal]] In-flight
follow-up #1 commits to formalizing it as 360-campaign.md W5 §6
in a follow-up edit; #3 commits to scoping the discount-code-name
visibility pull (Shopify GraphQL `discountApplications`), which is
the engineering prerequisite for the C1 measurement.

Three threads that should plug into that work but aren't yet
follow-ups in the master log:

- The 548-vs-list question (one of paths 1 or 2 above).
- The empty `klaviyo_list_growth_daily` debug.
- The `klaviyo_flow_attribution` Phase 0.5 decision.

If the next contributor adds these as follow-ups in
[[2026-06-09-retention-led-recal]] In-flight table, they're
covered. Until then, this doc is the catch.

## Related

- [[../bundle-strategy]] — the committed spec (analysis + decision).
- [[2026-06-09-retention-led-recal]] — the parent multi-day session
  log this supplements.
- [[../360-campaign]] Workstream 1 §2 — the section the bundle
  decision revises; W5 — the retention motion the leverage
  redirects to.
- [[../personas]] Distribution — the segment quantification
  underlying the consumer-behavior framing.
- [[../../work-plans/todo/klaviyo-integration]] — Phase 0.5 (per-
  customer grain) and `klaviyo_list_growth_daily` debug live here.
- `scripts/bundle-strategy-analysis.ts` — the 7-cut analysis, re-
  runnable against prod read-only.
- `scripts/klaviyo-acquisition-vs-retention.ts` — the prior analysis
  that quantified the +27.6% welcome-flow LTV lift the signup-lift
  workstream leans on.
- Commit `fb685a0` — bundle decision committed 2026-06-06.
