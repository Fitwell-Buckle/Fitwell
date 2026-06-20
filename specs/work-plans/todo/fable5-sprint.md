# Fable 5 Sprint — 2026-06-12 → 2026-06-22

> **Status:** active, but the original premise expired. **Fable 5 access was
> cut on day 2 (~2026-06-13)** — the sprint's "do the model-capability-bound
> work while we have a frontier model" framing no longer applies. We kept the
> remaining workstreams (they're still the right work) and continue them on
> the standard model; the front-loading rationale is just moot now. WS1 and
> WS4 shipped during the window. Owner: Tom (with Claude doing the build).
> See also `specs/ops/PRIORITIES.md` → Current Strategic Focus.

## Context

Session review 2026-06-12: the platform and strategy layer are in good
shape, and the retention-led recalibration (2026-06-09) settled the
sequencing — post-purchase retention leads, paid waits. What remains is a
mix of (a) human-gated deploy steps and (b) work that is **bound by model
capability**: complex one-shot engineering builds, persuasive copy that
gets frozen into production for months, and gnarly cross-system
root-cause analysis. This sprint front-loads bucket (b) while Fable 5 is
available. Work gated on data accumulation, deploys, or paste-steps is
explicitly out.

Selection lens: *does a stronger model materially change the quality of
this artifact?* If no, it doesn't belong in this sprint.

## Dependencies

- `specs/strategy/360-campaign.md` (W2, W3, W5) — workstream definitions
- `specs/strategy/creator-program.md` + `creator-scoring.md` — Workstream 1 spec
- `specs/strategy/personas.md` + `vocabulary-map.md` — grounding for all copy
- `specs/work-plans/completed/utm-linking-gap.md` — Workstream 4 investigation brief
- `specs/work-plans/todo/klaviyo-integration.md` — Phase 4 architecture (signed off 2026-06-09)
- Tom in Geneva until ~2026-06-21 — everything here must be executable without him present, with review-on-return checkpoints

## Scope

**In:** the five workstreams below — engineering pre-builds, copy drafts,
and analysis that Fable 5 disproportionately improves.

**Out:** PostHog baseline analysis (gated on data accumulation), paid
channel launch (sequenced after retention motion is live), newsletter
voice iteration (engine calls the API with its own model; not
session-model-bound), Shopify scope deploy + Feb-2024 history import
(pure ops, Greg's queue), Klaviyo flow skeleton creation (Tom, ~15 min in
the Klaviyo UI — blocks *deployment* of WS2 content, not drafting).

## Implementation Phases

### WS1: Creator program pre-build (Phases 1+2+4+5 compress) — biggest win
Pre-build before the planned 2026-06-21 start so Tom returns to
outreach-ready tooling instead of a spreadsheet cadence. Pulls 360
Workstream 2 forward ~2 weeks. Spec: `creator-program.md` + `creator-scoring.md`.
- [x] **Architecture decision (Tom, 2026-06-12): single unified system** —
      `creator` is the one entity, brain AND hands. Oliver's gifting
      machinery re-pointed via additive `creator_id` FKs; `influencer`
      retires in a post-sprint contract migration (needs Oliver + Greg).
      Logged in `creator-program.md`.
- [x] Phase 1: schema — 6 creator tables + 2 link columns, migration
      `0064_far_sway.sql`, applied to tom-dev (NOT prod yet — Greg gate)
- [x] Scoring library (`src/lib/creators/scoring.ts`) — all formulas from
      `creator-scoring.md` as pure functions, 36 unit tests
- [x] CSV import — transform layer (`src/lib/creators/import.ts`, 15
      tests) + idempotent upsert script (`scripts/import-creators-csv.ts`,
      verified create→update on re-run against dev). Alias-driven header
      mapping; adjusting to the real CSV is a one-minute edit.
      **Waiting on Tom: the real `Fitwell_Creators_CrossPlatform.csv`.**
- [x] Phase 2: admin UI — `/creators` list (filter pills, search, sortable
      columns, URL-state, burned hidden by default) + `/creators/[id]`
      detail (platform stats cards, posts, gifting orders, emails, codes,
      status/notes editor via `PATCH /api/admin/creators/[id]`). Nav +
      middleware wired; prod build verified; 11 list-logic tests.
- [x] Backfill script `scripts/backfill-influencers-to-creators.ts` —
      maps influencer rows → creator (reuses CSV-imported creators on
      platform+handle match, migrates portal allowlist emails, stamps
      `creator_id` on influencer + orders). Idempotent; dry-run verified
      (dev branch has 0 rows; the real run happens on prod after the
      Greg gate). Old influencer pages keep working until Phase 4
      re-points the gifting flow, then become redirects.
- [x] Phase 4: "Send sample" promotes a creator into the existing gifting
      flow (`POST …/promote` → prefilled `/influencer-tracking/new`);
      `recordInfluencerOrder` now stamps `creator_id`; discount codes via
      new `createBasicDiscountCode` on the Shopify client
      (`discountCodeBasicCreate`, default 15% once-per-customer) with
      graceful 502 until `write_discounts` lands — **added to
      shopify.app.toml; rides Greg's queued scope deploy**. Redemptions =
      join on `order_discount_code` (refund-netted), shown on detail.
- [x] Phase 5: post detection — YT nightly cron (04:00, ~2 quota
      units/channel) + IG Apify cron (6h, ≤50 engaged-creator profiles,
      cost-throttled) + manual entry API. Both crons no-op ("skipped")
      until `YOUTUBE_API_KEY` / `APIFY_TOKEN` are set (.env.example
      documents both; **Tom: fresh YT key + Apify token needed**).
      Gift-order matching (≤30d window) + mention detection unit-tested.
- [x] Tests ship with each phase — 916 passing (`npm run check` green),
      prod build verified after every phase
- [x] Stage for Tom's return: 4 seeded dev creators + walkthrough below
- [x] **Real CSV imported to dev** (2026-06-12): 735 creators, 0 skipped,
      104 multi-platform — importer trusts the research pass's precomputed
      scores (CSV lacks the caption text they were computed from),
      handles US dates + per-platform email columns. Fixtures removed.
- [x] **Vetting workflow** (Tom's requirement — "vetting 735 in the
      portal"): `vetting_status` + `score_boost` columns (migration
      0065, applied to dev), inline ✓ approve / ✗ reject / ▲▼ boost on
      every list row, "To vet / Approved / Rejected" pills, rejected
      hidden by default but kept for dedup. Effective rank =
      cross_platform_fit + boost; the algorithmic score is never
      mutated, so refreshes don't erase human judgment.
- [x] **Discovery pipeline** ("once the CSV is in we can't be done"):
      ① Add-creator inline form (auto-approved, 409 on duplicates);
      ② weekly YT keyword-search cron (Mon 05:00) feeding untracked
      watch channels into the To-vet queue, ~600 quota units/run,
      no-ops until `YOUTUBE_API_KEY`. IG discovery deliberately deferred
      (no search API without Meta review; multi-platform matching pulls
      IG handles in via YT channel links).
- [x] **Stats refresh (Phase 6, pulled forward 2026-06-12)** — Tom hit
      the staleness immediately ("The Watchlist says last post 5/22"):
      the CSV froze at the May scrape. Built: nightly YT refresh cron
      (03:00, subscribers/ER/last-upload + re-scoring) and IG stats
      piggybacked on the Apify posts cron (now ALL non-rejected IG
      profiles, 50/cycle round-robin ≈ full pool every 3–4 days).
      `score_boost` is never touched by refreshes.
      **Blocked on env: `YOUTUBE_API_KEY` + `APIFY_TOKEN` (Tom, ~10 min
      total) — until then every date/count on /creators is the May-22
      research snapshot.**
- [x] **Country / market gating** (Tom, 2026-06-12): `country` columns
      (migration 0066), auto-filled from YT channel metadata (135/169
      backfilled; IG manual), gated against **live Shopify Markets**
      (45 countries incl. IN — surfaced to Tom; "creator target markets"
      override list pending his call). Out-of-market = parked: hidden +
      zero API calls + auto-return when the market is enabled.
- [x] **Creator lifecycle** (Tom's design session, 2026-06-12 — full
      push-through): ① sample logistics on `influencer_order` (migration
      0067: shopify_order_id via webhook GraphQL draft-link,
      shipped/delivered from fulfillments, tracking, expected platform);
      ② outreach threads + per-creator activity timeline
      (`creator_outreach` + events, follow-up rules in `lifecycle.ts`,
      status `committed`→`agreed`); ③ action cron (13:30 UTC): follow-ups
      due, sample-landed drafts (approve-and-send, never auto), overdue
      post nudges, 60-day auto-burn; ④ pipeline bar on /creators
      (derived stages: prospect → outreach → agreed → sample_sent →
      evaluating → posted, click-to-filter, zero-drift — logistics facts
      outrank stale statuses). 936 tests green.
- [x] **Prod go-live DONE 2026-06-12** (Tom's call): migrations 0064–0067
      applied, pushed, deployed; 735 creators + countries on prod; env
      keys in Vercel; scope deploy `fitwell-admin-10` (write_discounts +
      read_shipping live, re-granted in place — no uninstall needed);
      market gating = markets ∩ shipping (India IS shipped to — stays).
- [x] **Phase 6: asset capture + rights tracking** (Tom, 2026-06-12 —
      "completely ready on the 21st"): `creator_asset` (migration 0068),
      pointer-based storage (Drive/Dropbox URLs), rights tiers
      (organic_only / paid_30d / paid_90d / perpetual) with computed
      expiry, status badges (active / expiring soon / expired), action
      cron warns ≤14d before paid rights lapse, 90-day followers+ER
      trend chart per platform (fills as snapshots accumulate).
- [ ] Final QA pass before 06-21: end-to-end manual run-through
      (vet → outreach → send sample → delivered ping → post detected →
      asset logged) + update releases.yaml + move creator-program work
      plan forward

#### WS1 walkthrough (5 minutes)

1. **Marketing → Creators** — the unified list. Seeded with 4 fixture
   creators on tom-dev; the real 735 land when the CSV is imported.
   Pills filter platform/status; default view hides burned/archived;
   column headers sort; search hits names + handles. Default rank =
   `cross_platform_fit`.
2. Click a creator → detail: per-platform stat cards, posts feed,
   gifting orders, emails, codes, status + notes (editable, saves via
   PATCH).
3. **Send sample** → creates the influencer-bridge row if needed and
   drops you in the existing gifting-order form, creator preselected.
   The order comes back stamped with `creator_id` so it shows on the
   creator's detail page.
4. **Generate code (15%)** → returns a clear error until Greg's scope
   deploy grants `write_discounts`; after that it creates the Shopify
   code and registers it. Redemption counts/revenue appear automatically
   (joined from `order_discount_code`, refund-netted).
5. Post detection runs itself once `YOUTUBE_API_KEY` + `APIFY_TOKEN`
   exist (until then the crons report "skipped" — visible in the cron
   logs, harmless).

**Go-live order:** ① Greg reviews schema/design (0064 + this section) →
② `npm run db:migrate:prod` → ③ push (Vercel picks up the new crons) →
④ `shopify app deploy` (scopes incl. `write_discounts`) + re-auth →
⑤ import real CSV on prod → ⑥ run `backfill-influencers-to-creators.ts`
on prod → ⑦ Wave 1 outreach (top-50 by fit_score) starts from the list.

### WS2: Post-purchase retention flow content
The lead workstream's writing. **Drafted + redesigned with Tom 2026-06-20 →
`specs/strategy/retention-email-content.md`** (the copy source of truth;
review-ready). The original D1/D14/D21/D30 single-flow shape was reworked in
session into **two fully-automated flows** once two products (M1/M4),
repeat-buyer re-entry, and a no-human-failure-point constraint surfaced:
- [x] Post-purchase **nurture** flow — E1 setup (branched per product M1/M4, gated on product-newness, leans into the trust-objection preempt + buckle-not-lug sizing) → E2 value → E3 cross-sell ("complete your kit", recommendation-block-ready for M2/M3/M5) → E4 outfit code. D14 "how many watches" **cut** (Tom: "stupid on its own").
- [x] **Founder-touch** — outfitters buying again divert from the discount to an *automated* personal note from Tom (reply-to `info@` → Tom+Oliver+Melanie). Tom's call: no human-in-the-loop send step anywhere.
- [x] **Review-request** flow — replaces the current Judge.me 3-variant timing; Fulfilled-triggered POS+10 / domestic+14 / **intl+26** (fixes "asked before it arrived"), one reminder +7, suppress-if-reviewed, via Judge.me↔Klaviyo. Recommends adding a delivered signal to collapse the geo split.
- [x] Welcome-flow rewrite E1–E4 — **as an A/B challenger, not a replacement** (live flow is +27.6% LTV, on the Phase 4 denylist); E4 reframed off the cut bundle SKU.
- [x] Shared vs single-use D30 code — **recommended single-use** (Klaviyo coupon + Shopify price rule) + a new `outfit` classifier family.
- [ ] Tom on return: confirm the 6 facts/decisions + build the two flow skeletons in Klaviyo UI (full build spec in the doc), then Claude QA's the render and we iterate in place.

### WS3: Landing page variants A + B (360 W3)
Author both variants as ready-to-publish drafts; persona-targeted
copywriting is peak-model work. Spec: `landing-page-goals.md` + `funnel.md`.
- [ ] Variant A: "Watch Wearer's $40 Fix" (P2 Curator, direct-response) — full page copy
- [ ] Variant B: "For Collectors Who Notice" (P1b identity) — full page copy
- [ ] Both tagged with persona × funnel stage + hypothesis per `landing-page-goals.md` (Critical Rule 14)
- [ ] Shopify Pages write client (idempotent GraphQL, draft/publish states, dry-run) — the 360's mandatory engineering item; unblocks publishing without admin-UI paste
- [ ] Tests for the write client

### WS4: UTM linking gap root-cause (Greg's #1)
Only 40/734 orders get `link_method` stamped vs 1,249 converted UTM rows.
Deliverable is a **verified diagnosis + backfill plan** Greg can execute —
clears his critical path without waiting for his cycle. Brief:
`utm-linking-gap.md`.
- [x] Trace the full path — done across 06-12/06-13 sessions; path works, it was starved of pixel ids pre-06-04
- [x] Identify where the ~95% drop happens — verified with prod data: pre-pixel touches captured anonymously (no visitor_id / distinct id), so the identity edge never existed; only 2 of 1,189 unlinked orders are window-matchable. Historical backfill is structurally impossible, not pending.
- [x] Backfill executed where possible: self-report re-run (0 remaining), 2,823 duplicate utm_attribution rows deleted (`scripts/cleanup-utm-duplicate-touches.ts`), duplicating insert in `upsertOrder()` fixed + integration test
- [x] `utm-linking-gap.md` updated with verified diagnosis → moved to completed/. **Nothing for Greg.**

### WS5: Signup-lift experiment designs (360 W5 §6)
Pure design work, explicitly "design now, launch once PostHog data
accumulates." 71.8% of first orders are no-code → off the email list →
missed retention.
- [ ] Full experimental design for each of the four candidates in W5 §6
- [ ] Power calculations against ~7 orders/day volume (be honest about runtimes)
- [ ] Sequencing recommendation: which experiment first and why
- [ ] Write into `hypotheses.md` with test cost + status per the registry format

## Notes

- Suggested order: WS1 first (largest capability-bound chunk, hard date
  2026-06-21), WS2 drafted in the same stretch (lead workstream), then
  WS4 → WS3 → WS5. WS4 may jump the queue if Greg wants the diagnosis
  sooner.
- WS1 schema + WS3 write client are **new tables / structural changes** —
  surface the design in a working session before shipping (Critical
  Rule 5), and run the migration pre-flight gate (Critical Rule 2)
  before any commit.
- Open questions for Tom (async-able): Apify account approval (WS1 Phase
  5), shared vs single-use D30 code (WS2), `ANTHROPIC_API_KEY` into
  `.env.local` for the newsletter dry-run (separate from this sprint but
  same trip-return checklist).
- When the sprint ends (~2026-06-22): check off what shipped, move
  finished pieces into their parent work plans / `releases.yaml`, fold
  the rest back into `PRIORITIES.md`, and move this file to
  `specs/work-plans/completed/`.
