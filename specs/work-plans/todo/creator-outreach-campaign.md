# Creator Outreach Campaign — Wave 1 + Portal Efficiency Layer

Status: **planned, awaiting Greg sign-off on schema deltas** (created 2026-07-01). Owner: Tom.

## Context

Tom is launching a creator outreach wave now (50–100 creators over the next
2–3 weeks) and wants the portal to carry as much of the operational load as
possible. This plan is **not** the original creator-management build — most of
that already shipped (see [[../../strategy/creator-program.md]] and the mature
tables/routes below). This plan covers the **campaign-specific deltas** that make
a 50–100 creator wave efficient to run: an affiliate-commission program, three
converging address-capture paths, content housing for paid reuse, and a small
automated creator-engagement layer.

**Critical framing: outreach starts this week with zero build.** The prospect DB,
scoring, outreach CRM, gifting draft-orders, post detection, and the "ping me"
action engine already exist. Phase 0 is a runbook, not code. Everything in Phases
1–6 makes the *next* wave cheaper to run; none of it gates starting the *first* one.

### What already exists (do not rebuild)

Confirmed in `src/lib/schema.ts` (lines ~1968–2527) and `src/app/(admin)/`:

- **Prospect DB + scoring + vetting** — `creator`, `creatorPlatform`,
  `creatorStatsDaily`, `creatorEmail`; ranking via `crossPlatformFit`; scoring per
  [[../../strategy/creator-scoring.md]]. UI at `creators/` + `creators/[id]/`.
- **Outreach CRM** — `creatorOutreach` (thread per channel) + `creatorOutreachEvent`
  (timeline). UI `creators/[id]/outreach-panel.tsx`. Follow-up rules in
  `src/lib/creators/lifecycle.ts`.
- **Gifting / sample orders** — `influencerOrder` (`shipTo` jsonb, `contentDueDate`,
  `expectedPlatform`, `affiliateLink`, tracking, `status`). $0 draft-order creation
  via `createDraftOrderInvoice()` (`src/lib/shopify/client.ts:957`); gifting builder
  in `src/lib/influencer/service.ts`; send flow at `api/influencer-orders/[id]/send/`.
- **Discount codes** — `creatorDiscountCode` + `createBasicDiscountCode()`; revenue
  attributed by joining `orderDiscountCode.code`.
- **Post detection** — YouTube (daily) + IG via Apify (6h) crons →`creatorPost`
  (`postUrl` unique, `mentionedUs`).
- **Assets/rights** — `creatorAsset` (Drive/Dropbox pointer, `rightsTier`,
  `rightsExpiresAt`).
- **Action engine** — `src/lib/creators/actions.ts` surfaces follow-ups, delivered
  nudges, post-overdue nudges, auto-burn. Nothing auto-sends; humans approve.
- **Inbound email** — Gmail-API poll (`src/lib/gmail/`), matched to
  customer/company/supplier/**legacy influencer** via `src/lib/crm/customer-match.ts`.
- **Outbound email** — Resend (`src/lib/email/resend.ts`). **Blob** storage available.

### Locked decisions (this campaign)

| # | Decision |
|---|---|
| L1 | First wave: 50–100 creators over 2–3 weeks |
| L2 | Offer = gift + affiliate commission for everyone, 10% (small) → 20% (large) |
| L3 | No BOGO; never discount below the standing 15% floor |
| L4 | Content usage: both organic reshare + paid repurposing |
| L5 | Address capture: all three methods (manual / LLM-from-email / self-serve link), one order core |
| L6 | Engagement layer = minimum only (sale ping + monthly report + first-post amplification + existing exception queue); richer tactics shelved |
| D1 | Audience mechanism = 15% code per creator (matches floor, doubles as attribution basis) |
| D2 | Structured `offerTier` + `commissionRatePct` fields (not free-text) |
| D3 | Commission payout floor ~$25 accrued |
| D4 | Payout is **manual** v1 (PayPal/Wise); app computes amount owed |
| D5 | Tax: lightweight — collect W-9 at first payout, formalize later |
| D6 | Self-serve portal = tokenized "confirm your details" link now; full authenticated portal deferred |
| D7 | Gifting-order channel = keep `isSample` tag + `creator_partnerships` attribution (no new Shopify sales channel) |
| D8 | TikTok = manual post entry v1 (no API client) |
| D9 | Milestone rewards = product / early access / status / recognition — never cash or discount |
| D10 | Build order: (1) inbound-email wire → (2) offer/commission fields → (3) LLM email→order → (4) self-serve link → (5) media housing → (7) engagement layer; manual outreach runs in parallel from day one |
| Mailbox | Outreach sent from **tom@fitwellbuckle.co** (his business mailbox; inbound matching + LLM extraction key off this connected account) |

Brand guardrails for all creator-facing artifacts: `.claude/skills/fitwell-brand`.
The affiliate model is brand-safe because commission rewards the *creator* without
lowering the *customer's* price; the 15% code never goes below the standing floor;
rewards are product/status, not cash/discount races.

## Dependencies

- **Shopify `write_discounts` scope** — needed for per-creator 15% code generation.
  Coded but noted "pending grant" in `shopify.app.toml`; must be granted + deployed
  (see [[../../current/shopify-app-config.md]]) before Phase 1 code generation works.
  `write_draft_orders` (gifting) already granted.
- **Gmail connection for tom@fitwellbuckle.co** with `gmail.readonly` — for inbound
  matching (Phase 2) and LLM extraction (Phase 3). Verify the account is connected.
- **LLM access** for Phase 3 extraction — use the latest Claude model for structured
  address extraction; validate output with Zod before it touches a Shopify order.
- **Vercel Blob** (existing) — media housing, Phase 5.
- **Resend** (existing) + **cron framework** (`vercel.json`, `verifyCronOrAdmin`) —
  engagement layer, Phase 6.
- **Greg sign-off** — required before Phase 1 schema lands (new nullable columns +
  small additive tables), per AGENTS.md §4 rule 5 and the creator-program sign-off gate.
  Nothing touches the `influencer→creator` retirement or a full authenticated portal,
  so the gate stays light.

## Scope

### Included
- Affiliate program config: `offerTier`, `commissionRatePct`, 15%-code default, payout
  floor, commission-owed computation + readout, payout ledger, W-9 status flag
- Creator ↔ inbound-email wire (unified `creator`, not just legacy `influencer`)
- LLM email → draft-order prefill (human-confirmed)
- Tokenized self-serve "confirm your details" intake link + pending-order review queue
- Media housing (Blob) + rights capture for paid reuse
- Engagement layer minimum: real-time sale ping, monthly report, first-post
  amplification surfaced in the action engine, activation (`firstSaleAt`) tracking
- Campaign runbook (tiering + outreach templates) so Phase 0 starts immediately

### Excluded (backlog — "later, if it earns it")
- Full authenticated creator portal (login, self-serve status/history/upload) — D6
- TikTok API client / auto-detection — D8 (manual entry only)
- Automated commission *payment* (PayPal/Stripe payout API) — D4 (manual v1)
- Richer engagement: private community channel, product-decision voting, creator
  referral loop, pick-your-own-goal dashboard, quarterly "wrapped", leaderboards — L6
- Any discount below the 15% floor; any cash/discount-based creator reward — L3/D9

## Implementation Phases

### Phase 0: Launch the wave (no build — do this now)

- [ ] Define the three offer tiers by `crossPlatformFit` band (Seed 10% / Partner
      15% / Anchor 20%), with per-tier rights ask (organic / paid_30d / paid_90d)
- [ ] Write 2–3 outreach email templates (per tier), on brand — problem→fit→proof,
      full price, commission framed as partnership. Store in the campaign runbook.
- [ ] Pull top ~100 approved creators from `/creators` ranked by `crossPlatformFit`;
      assign a tier to each
- [ ] Send from tom@fitwellbuckle.co; log each as a `creatorOutreach` thread + initial
      `creatorOutreachEvent` (works in the current UI today)
- [ ] Collect shipping details by email; create $0 gifting orders manually via the
      existing `influencer-tracking/new/` form

*No tests — operational. This validates the funnel while Phases 1–6 build.*

### Phase 1: Affiliate program config + commission tracking (build #2)

Schema deltas (all additive; signed off by Tom) — **DONE: migration 0097, dev + prod (commit 3a4cdac)**:
- [x] `creator.offerTier` (enum seed|partner|anchor), `creator.commissionRatePct` (real)
- [x] `creator.payoutEmail` (nullable), `creator.taxFormStatus` (enum none|requested|received)
- [x] `creator.firstSaleAt` (nullable timestamp — activation metric, reused in Phase 6)
- [x] New table `creatorPayout` — creator_id FK, period, amount_cents, method, paid_at,
      note (records what's been *paid*, so owed = earned − paid)
- [x] `npm run db:generate`, review, `npm run db:migrate` (dev + prod at parity)
- [x] Default `creatorDiscountCode` generation to **15%** (already in place — discount-code route)
- [x] Commission-owed computation (`commission.ts` + `commission-queries.ts`, 9 unit tests)
      exposed on `creators/[id]` (commit 37263df); offer tier/rate/payout editable (commit 035ec55)
- [ ] "Commission owed ≥ $25" roll-up admin view (`getCreatorCommissions()` is built — needs a page)
- [ ] W-9 request surfaced in the action engine when a creator first crosses the payout floor
- [ ] `offer_tier` filter on the `/creators` list (nice-to-have for managing the wave)
- [x] Update `specs/current/schema.md`

#### Tests
- Unit: commission-owed math (earned − paid, floor gating at $25)
- Unit: 15% default applied on code generation
- Integration: create code → simulate redeemed order → owed amount + `firstSaleAt` set
- Integration: record a `creatorPayout` → owed decreases correctly

### Phase 2: Creator ↔ inbound-email wire (build #1)

- [ ] Extend `src/lib/crm/customer-match.ts` (or a creator-specific matcher) to match
      inbound Gmail on tom@fitwellbuckle.co against `creatorEmail`
- [ ] On match, write a `creatorOutreachEvent` (direction=in) onto the creator's thread
      so replies appear in the existing timeline and drive the action engine
- [ ] Dedup on Gmail message id (reuse `customerMessage` dedup pattern)
- [ ] Reconcile with legacy `influencer` matching (don't double-count during retirement)

#### Tests
- Unit: email → creator match (business/personal/manager addresses)
- Unit: message-id dedup (same message ingested twice → one event)
- Integration: simulated inbound reply → outreach event on the right creator

### Phase 3: LLM email → draft-order prefill (build #3)

- [ ] On a matched inbound reply (Phase 2), run an LLM extraction step over the parsed
      Gmail transcript (`src/lib/gmail/transcript.ts`) to pull name, address, phone, email
- [ ] Validate extraction with a Zod schema; never write to Shopify unvalidated
- [ ] Prefill an `influencerOrder` **draft** (`shipTo` jsonb) for the creator; surface a
      "review & confirm" step in the admin — human approves before the draft order is created
- [ ] Add `influencerOrder.intakeMethod` (enum manual|llm|self_serve) for provenance
- [ ] Graceful failure: low-confidence extraction → flag for manual entry, don't guess

#### Tests
- Unit: Zod validation rejects malformed/partial addresses
- Unit: intakeMethod set correctly
- Integration: sample reply text → prefilled draft with correct fields; confirm → draft order
- Integration: garbage input → flagged for manual, no Shopify write

### Phase 4: Tokenized self-serve intake link (build #4)

- [ ] New table `creatorIntakeToken` — token, creator_id FK, expires_at, used_at
      (or reuse magic-link infra in `src/lib/email/magic-link.ts`)
- [ ] Public route (pattern of `(marketing)/creator-signup/`) — tokenized "confirm your
      details / pick your strap" form → writes `influencerOrder` draft (`intakeMethod=self_serve`)
- [ ] Pending-order review queue in admin (reuse `influencer-tracking` draft state)
- [ ] "Send intake link" action on `creators/[id]` (emails the tokenized link via Resend)
- [ ] Token single-use + expiry; no login (defer full portal per D6)

#### Tests
- Unit: token generation, expiry, single-use enforcement
- Integration: submit form → draft order in review queue with correct creator link
- Playwright: open link → fill form → appears in admin queue
- Security: expired/used/invalid token rejected

### Phase 5: Media housing + rights for paid reuse (build #5)

- [ ] Extend `creatorAsset` with `blobUrl` (housed media) alongside the pointer `storageUrl`;
      add `sourcePostUrl` link to `creatorPost` where applicable
- [ ] "House this content" action: fetch the deliverable/post media → store in Blob →
      record `rightsTier` + `rightsExpiresAt` (paid_30d/90d/perpetual per tier)
- [ ] Rights-status surfacing (active / expiring-soon / expired) on the creator detail +
      a "rights expiring ≤14d" admin widget
- [ ] Backfill option: house existing `creatorAsset` pointers on demand

#### Tests
- Unit: `rightsExpiresAt` per tier
- Unit: expiring-soon / expired bucketing
- Integration: house a media URL → Blob object + asset row with rights metadata

### Phase 6: Engagement layer — minimum (build #7)

- [ ] **Real-time sale ping**: extend the `orders/create` webhook handler — if a tracked
      `creatorDiscountCode` was used, send the creator a Resend "you earned a sale" note;
      set `creator.firstSaleAt` on the first one
- [ ] **Monthly report cron** (add to `vercel.json`, `verifyCronOrAdmin`): per active
      creator, email sales driven / commission earned + pending / top post / progress to
      payout floor. Automated — zero founder time
- [ ] **First-post amplification** nudge in `src/lib/creators/actions.ts`: when a new
      creator's first `creatorPost` is detected, surface a "boost this / reshare" action so
      Tom clears it by exception (no auto-send)
- [ ] Show real numbers only (no projected earnings); honesty guardrail per brand skill

#### Tests
- Unit: sale-ping fires only on a tracked code; `firstSaleAt` set once
- Unit: monthly report content assembly (owed = earned − paid, correct top post)
- Integration: simulated redeemed order → ping queued + activation timestamp
- Unit: first-post detection → amplification action surfaced once per creator

## Notes

### Sign-off gate
Phase 1 introduces new nullable columns + two small additive tables (`creatorPayout`,
`creatorIntakeToken`). Per AGENTS.md §4 rule 5 + the creator-program gate, Greg reviews
the schema before generate/migrate. Nothing here touches the `influencer→creator`
retirement or a full authenticated portal, so the review is light. Follow the standard
migration workflow (dev → prod-before-push) in AGENTS.md §8.

### Risks
- **`write_discounts` scope not yet granted** — Phase 1 code generation degrades until the
  scope rides a `shopify app deploy && shopify app release`. Sequence the scope deploy before
  Phase 1 QA.
- **LLM extraction accuracy** (Phase 3) — mis-parsed addresses ship product to the wrong place.
  Mitigation: Zod validation + mandatory human confirm before any Shopify write; low-confidence
  → manual. Never auto-create the order.
- **Commission payout is manual** (D4) — the app computes owed but a human pays. Risk of drift
  between computed-owed and actually-paid; `creatorPayout` ledger is the reconciliation record.
- **Attribution leakage** — code-based (not link) attribution is why D1 chose the 15% code;
  still, self-reported/organic sales without a code won't attribute. Accept for v1.
- **Tax exposure at scale** (D5) — commission to many creators can cross 1099 thresholds;
  lightweight W-9-at-payout now, revisit if the program grows.

### Backlog (explicitly deferred)
Full authenticated creator portal • TikTok API client • automated payout • private community
channel • product-decision voting • creator referral loop • pick-your-own-goal dashboard •
quarterly "wrapped" • leaderboards. Pull from here only once the wave proves the base loop.

### Cross-references
[[../../strategy/creator-program.md]] (base system) • [[../../strategy/creator-scoring.md]]
(scoring) • [[../../strategy/retention-loop.md]] (advocate stage — the creator engagement layer
is the advocate funnel applied to partners) • [[../../strategy/personas.md]] •
[[../../current/shopify-app-config.md]] (scope deploy) • `.claude/skills/fitwell-brand`.
