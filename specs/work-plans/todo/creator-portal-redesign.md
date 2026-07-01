# Creator Portal Redesign — from database to workflow

## Context

The creator portal grew by accretion ("a house we kept adding onto"): capable
panels bolted together, organized around **entities** (a Creators table, a
Creator page showing everything known) rather than around the **job** (run a wave
of outreach and move people forward). Tom's diagnosis (2026-07-01): it's not
intuitive, and there's no spine that walks you from *here's a creator* → *approved*
→ *going to reach out this pass* → *how/what I'll offer* → *active Fitwell creator*.

Four structural problems:

1. **Three competing status vocabularies.** `vettingStatus` (unreviewed/approved/
   rejected) + `status` (prospect/contacted/agreed/active/burned/archived) + derived
   `pipelineStage`. No one can hold three ladders. → collapse to **one visible spine.**
2. **No concept of *intent* between "approved" and "contacted."** The system records
   what you've *done* (an outreach thread flips the stage), never what you *plan*. So
   "approved" is a junk drawer. → **"Selected for this wave"** and **"Parked"** must be
   first-class states.
3. **The creator page is ~10 co-equal panels with no primary action.** → one screen,
   one next action, everything else progressively disclosed.
4. **The journey is scattered across screens** (vet on the list, offer/tier in the
   bottom "edit everything" panel, outreach in a right rail, gifting on a different
   route). → draw it as one forward-moving track.

**Principle: organize around the wave, not the database.**

## Agreed direction (Tom sign-off 2026-07-01)

Decisions from the design discovery (his four answers):

- **Home view = board + "needs you now" strip** (Q1c). Board is the *map* (orientation);
  the strip is where you *act*. If the kanban never clicks, the strip + per-card actions
  still run the whole workflow — so the board is low-risk to try and cheap to drop.
- **"Pass for now" = a Parked/Active toggle** (Q2a). Parked stays approved, drops out of
  working views, unpark when ready. Optional free-text reason. (Shipped — see Phase 1.)
- **Operate bulk + single** (Q3a). Multi-select to triage/park/assign/draft many at once;
  open one to compose and act.
- **AI-drafted outreach** (Q4a). Portal generates a tailored draft from the tier template
  + the creator's data + the offer; Tom edits and sends from his own inbox (keeps the
  "from tom@fitwellbuckle.co, manual send" decision).

### The one spine (columns of the board)

`To vet → Approved → Selected → Reached out → In talks → Agreed → Sample out → Live`

- **Selected** and **Parked** are the new intent states (the missing middle).
- Exits are side-states (badges/filters, not columns): **Passed** (rejected),
  **Burned/Archived**.
- Under the hood the existing statuses + derived logistics still drive most transitions —
  we're giving the machinery *one face*, not rebuilding it.
- **Open question (round 2):** confirm the column vocabulary. "Reached out / In talks /
  Live" are provisional names.

### Creator view = action-first

Header: name + at-a-glance (fit, reach, platform, watch confidence, tier) + **one primary
button that changes by stage** (Select for wave → Compose outreach → Log reply → Create
gifting order → Mark agreed → Save their post). Everything else (platform stats, posts,
gifting history, codes, assets, full edit) folds into tabs / an expandable drawer.

### AI-draft outreach = steps 4+5 in one flow

On a **Selected** creator: Compose outreach → pick tier → portal generates a tailored draft
(tier template + creator content/persona + offer code + commission %) → edit → Copy to inbox
→ Mark reached out (auto-logs the thread, sets the code + tier).

## Dependencies

- `specs/strategy/creator-program.md`, `creator-scoring.md` — existing creator machinery.
- `specs/work-plans/completed/…` creator-outreach-campaign (Phase 0/1: schema, commission,
  payouts, tiers — already shipped).
- `src/lib/creators/lifecycle.ts` (stage derivation), `list.ts` (filter/sort), `actions.ts`
  (the daily nudge engine — home strip will consume it).

## Scope

**In:** the reimagined IA above — spine, board+strip home, action-first creator view, bulk
actions, AI-draft compose. **Out (folded in later phases, tracked below):** the backlog
items, not new scope.

### Backlog to fold in (do NOT lose these — Tom's standing asks)
- **Gifting-order-from-inbound-email** — LLM extracts name/address/phone from a creator's
  reply → prefills the Shopify gifting order. Lives in the **Sample out** step.
- **Automated engagement emails** — real-time sale ping, monthly earnings report, first-post
  amplification, exception queue. Fire once a creator is **Live**; exceptions surface in the
  home strip. (Automated only — not a heavy managed program.)
- **Content repurposing** — detected post → one-click "save as Fitwell asset + rights."
  **Live** stage.
- **Self-serve tokenized creator link + commission gamification** — the creator's own view
  of earnings. Later phase.
- **Offer stack** — 15% audience-code floor, seed/partner/anchor = 10/15/20%, $25 payout
  floor, W-9 at first payout, TikTok manual. Baked into Compose + the payouts view (built).

## Implementation Phases

### Phase 1: Parked ("pass for now") — SHIPPED 2026-07-01
- [x] Schema: `creator.parked_at` + `parked_reason` (migration `0099_slim_sleepwalker`)
- [x] API: PATCH accepts `parked` (stamps/clears `parked_at`, clears reason on un-park)
- [x] Detail page: Park/Un-park button (approved only) + "⏸ parked" header badge
- [x] List: per-row park button in VetActions (approved only), "⏸ Parked N" filter pill,
      hidden from default views + pipeline counts, revealed under Everything
- [x] `list.ts` filter + opt-out of the to-vet default; unit tests (parked hide + reveal)
- [ ] Deploy: prod migration + push (blocked on concurrent `0098` ordering — see Notes)

### Phase 2: Unified spine + board home + "needs you now" strip
- [ ] Collapse the three status vocabularies into one derived spine (keep underlying fields)
- [ ] Board view (columns = spine stages; Parked/Passed/Burned as side lanes)
- [ ] "Needs you" strip driven by `actions.ts` (drafts ready, replies to log, samples to
      check in, W-9s)
- [ ] Tests

### Phase 3: Action-first creator view
- [ ] One stage-driven primary action + at-a-glance header; details into tabs/drawer
- [ ] Tests

### Phase 4: Bulk actions
- [ ] Multi-select on board/list → Approve · Park · Select for wave · Assign tier · Draft
- [ ] Tests

### Phase 5: AI-draft outreach compose flow
- [ ] Compose drawer on Selected creators; grounded generation; copy-to-inbox + auto-log
- [ ] Tests

### Phase 6+: fold in the backlog (gifting-from-email, engagement emails, repurposing, self-serve)

## Notes

- **Concurrent-migration entanglement (2026-07-01):** `0098_redundant_stepford_cuckoos`
  (`newsletter_campaign.region`) is untracked WIP from a concurrent session in the same
  working tree; my `0099` sits above it in `_journal.json`. Pushing `0099` cleanly requires
  `0098` (+ its schema change) to be committed/applied first, else the journal references a
  missing migration. Resolve ordering with whoever owns the newsletter work before the
  Phase 1 push.
- **Kanban risk:** Tom is unsure a board fits his head. Mitigation baked into the design —
  the strip carries the workflow regardless; the board is orientation only.
