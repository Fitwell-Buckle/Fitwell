# Fable 5 Sprint — 2026-06-12 → 2026-06-22

> **Status:** active. This is the working agenda for the next ~10 days,
> while Tom has access to Claude Fable 5 (frontier-tier model). Owner: Tom
> (with Claude doing the model-bound work). Tracked here so the whole team
> can see what's in flight; see also `specs/ops/PRIORITIES.md` → Current
> Strategic Focus.

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
- `specs/work-plans/todo/utm-linking-gap.md` — Workstream 4 investigation brief
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
- [ ] Phase 1: schema (creator, creator_contact, creator_post, sample/code tables — reuse existing entities per Critical Rule 6) + migration
- [ ] Phase 2: 735-creator CSV import with watch_score / fit_score / cross_platform_fit scoring
- [ ] Admin UI: creator list + detail under Marketing nav (read-first)
- [ ] Phase 4: Shopify per-creator sample draft orders + discount code generation (write_draft_orders is live)
- [ ] Phase 5: post detection — YouTube polling + Apify IG (needs Apify account ~$1–2/mo; flag for Tom)
- [ ] Tests for each phase (`npm run check` green before any phase is called done)
- [ ] Stage for Tom's return: seeded dev data + a 5-minute walkthrough note

### WS2: Post-purchase retention flow content (D1 / D14 / D21 / D30)
The lead workstream's writing, draftable now — the Klaviyo skeleton only
blocks deployment. Flow shape locked 2026-06-09: D1 install guide → D14
"how many watches?" → D21 Judge.me review ask → D30 outfit code (25% off
5+, 30-day expiry). Ground every line in `personas.md` + `vocabulary-map.md`.
- [ ] Draft D1 / D14 / D21 / D30 email content (subject lines + body + CTA, per-email UTM tags per event-taxonomy)
- [ ] Draft welcome-flow rewrite E1–E4 (360 W5) — same grounding
- [ ] Decide shared vs single-use D30 outfit code (recommendation + tradeoffs for Tom)
- [ ] Tom on return: create flow skeleton in Klaviyo UI, review copy, deploy

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
- [ ] Trace the full path: theme snippet → `_fw_distinct_id` cart attribute → orders/create webhook → `link_method` stamp
- [ ] Identify where the ~95% drop happens (with evidence, not hypothesis)
- [ ] Write backfill plan (and script if the fix is data-side)
- [ ] Update `utm-linking-gap.md` with findings; hand off to Greg

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
