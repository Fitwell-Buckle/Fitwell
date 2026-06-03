# Klaviyo Integration

> **Status:** awaiting Greg sign-off per Critical Rule 5 (new external
> integration, new API key, 3 new tables, new cron, write access to a
> live revenue channel). Do not start Phase 0 until that conversation
> happens. The read-side portion was previously scoped as Phase 3 of
> `funnel-strategy-next-iteration.md`; that section has been replaced
> with a pointer here.

## Context

Klaviyo is Fitwell's email platform. The welcome flow is the only
confirmed running flow (per Tom 2026-05-26) and drives a **+27.6%
LTV lift** ($92.06 vs $72.12) per
`scripts/klaviyo-acquisition-vs-retention.ts`. Post-purchase flows
are not running — measured post-purchase contribution is **$551
across 5 orders in the Nov 2025–May 2026 window**, effectively
zero. This is the largest gap in the 360 campaign
(`specs/strategy/360-campaign.md` Workstream 5).

This integration solves two problems:

1. **Read side — measurement.** Replace UTM heuristics with API-sourced
   truth for list growth, campaign performance, and flow attribution.
   Closes the H12 acquisition-vs-retention split flagged in
   `specs/strategy/hypotheses.md` and unblocks the
   `klaviyo_post_purchase` channel measurement in
   `specs/strategy/retention-loop.md`.
2. **Write side — authoring.** Claude drafts campaigns and flows as
   code in this repo; Tom reviews; Claude deploys them as **drafts**
   in Klaviyo; Tom approves activation/send in Klaviyo's UI. Removes
   the paste-shuffle for the post-purchase, win-back, and M4
   cross-sell flows the 360 plan needs and keeps email content under
   version control.

Reference: `specs/current/integrations.md`,
`specs/current/scheduled-jobs.md`, `specs/current/schema.md`,
`specs/strategy/360-campaign.md` (Workstream 5),
`specs/strategy/retention-loop.md`,
`specs/strategy/hypotheses.md` (H12).

## Dependencies

- Klaviyo account access + private API key with the appropriate
  scopes (read for Phase 0; campaigns:write, flows:write,
  templates:write for Phases 2 and 4).
- Env vars: `KLAVIYO_API_KEY` (Vercel production + dev `.env.local`).
  Consider a separate `KLAVIYO_API_KEY_READONLY` if Klaviyo's scoped
  keys make that practical — limits blast radius of the read cron.
- Database migration for `klaviyo_list_growth_daily`,
  `klaviyo_email_performance`, `klaviyo_flow_attribution`.
- Greg sign-off (Critical Rule 5) before Phase 0 starts.

## Scope

### Included
- Klaviyo API client (read + write) with auth, retry, rate limiting
- Daily extraction cron + dashboard widgets (read side)
- MJML → HTML template pipeline with per-asset UTM injection
- Campaign authoring + draft deployment from repo
- Flow authoring as YAML + draft deployment from repo
- Hard safety guard: `managed-flows.ts` allowlist; welcome flow is
  not on it and cannot be modified by this code

### Excluded
- Audience/segment management (Klaviyo UI is the source of truth)
- A/B test orchestration inside flows (Klaviyo handles natively;
  read perf out via Phase 0)
- Profile/customer sync (Shopify's native Klaviyo integration
  already pushes profiles)
- Bidirectional drift sync between repo and Klaviyo UI (Phase 5,
  only if drift becomes a real problem)
- Automated sending of campaigns (campaigns deploy as drafts only;
  send is a manual action in Klaviyo's UI)

## Implementation Phases

Phase 0 ships independent value. Phases 1 + 2 ship together. Phase 3
is a gate; its outcome reshapes Phase 4. Phase 5 is defer-until-needed.

### Phase 0: Read side + shared client foundation (~1–2 days)

The previously-scoped Phase 3 of `funnel-strategy-next-iteration.md`,
moved here so the full Klaviyo surface lives in one plan.

- [ ] Add schema:
  - `klaviyo_list_growth_daily` — date, subscribers, new_subscribers, unsubscribes
  - `klaviyo_email_performance` — campaign_id, sent_at, sends, opens, clicks, conversions, revenue_cents
  - `klaviyo_flow_attribution` — flow_id, customer_id, order_id, attributed_revenue_cents, touched_at
- [ ] Generate + apply migration. Apply to prod before push per Critical Rule 2.
- [ ] Add `KLAVIYO_API_KEY` to `.env.example` and Vercel
- [ ] Create `src/lib/klaviyo/client.ts` — auth, exponential-backoff retry, rate-limit awareness (Klaviyo returns `429` with `Retry-After`). Read methods used now; write methods stubbed and used in later phases.
- [ ] Create `/api/cron/extract-klaviyo/route.ts` — daily sync to populate the three tables. Idempotent upserts keyed on `(date)` / `(campaign_id, sent_at)` / `(flow_id, order_id)`.
- [ ] Register cron in `vercel.json` (daily, ~07:30 UTC after other extractions)
- [ ] Add Klaviyo widgets to `/funnel/strategy`:
  - List growth sparkline near the top
  - Per-flow attribution as a row in the channel breakdown (replacing the UTM-heuristic split)
  - Welcome-flow vs. post-purchase split as a small visualization in the retention-loop section
- [ ] Update `specs/current/integrations.md` with Klaviyo section
- [ ] Update `specs/current/scheduled-jobs.md` with the new cron
- [ ] Update `specs/current/schema.md` with the three new tables

#### Tests
- Unit: Klaviyo API response → schema mapping (fixture-based)
- Unit: rate-limit retry / backoff behavior on mocked 429
- Integration: cron run populates the three tables against a mocked client; row counts match fixture

### Phase 1: MJML template pipeline (~1 day)

Local-only build step; no Klaviyo writes yet. Reusable across Phase 2
(campaigns) and Phase 4 (flow emails).

- [ ] Add `mjml` to dependencies. Lock the version.
- [ ] Create `src/lib/klaviyo/templates.ts`:
  - `compileMjml(source: string): { html: string; warnings: string[] }`
  - `injectUtms(html: string, params: { campaign: string; content: string }): string` — rewrites every `https://fitwellbuckle.co/*` link to add `utm_source=klaviyo&utm_medium=email&utm_campaign=<campaign>&utm_content=<content>`; preserves existing query strings; leaves non-Fitwell links alone.
- [ ] Decide on the on-disk convention. Default:
  ```
  klaviyo/
    templates/<slug>/template.mjml
    campaigns/<slug>/{template.mjml, config.yaml}
    flows/<name>.yaml
  ```
- [ ] Add a `klaviyo/README.md` documenting the directory layout, the build command, and the UTM convention.

#### Tests
- Unit: `injectUtms` covers absolute, relative, already-tagged, non-Fitwell, and anchor-only links; preserves query strings.
- Unit: `compileMjml` golden test against a fixture template (snapshot the HTML output).

### Phase 2: Campaign write (~2–3 days)

Tom: "draft a campaign for the Collector's Bundle to the
multi-watch-owner segment." Claude writes
`klaviyo/campaigns/2026-06-collectors-bundle/{template.mjml,
config.yaml}`, runs the draft script, draft appears in Klaviyo, Tom
reviews + sends from Klaviyo's UI.

- [ ] Define `config.yaml` schema (Zod): `subject`, `preview_text`, `from_email`, `from_name`, `segment_id` or `list_id`, `send_strategy` (defaults to manual review in Klaviyo)
- [ ] Implement campaign draft methods in `src/lib/klaviyo/client.ts`:
  - `createTemplate({ name, html })`
  - `createCampaign({ name, audiences, template_id, subject, ... })`
- [ ] Create `scripts/klaviyo-draft-campaign.ts` — CLI: `npm run klaviyo:campaign:draft <slug>`. Compiles MJML, injects UTMs (`utm_campaign=<slug>`), creates template + campaign as drafts in Klaviyo, prints the Klaviyo URL.
- [ ] Idempotency: if a campaign with the same `name` already exists in draft state, update it in place rather than creating a duplicate.
- [ ] **Never** auto-send. Sending is always a manual action in Klaviyo's UI.
- [ ] Update `specs/current/integrations.md` with the draft-campaign workflow.

#### Tests
- Unit: `config.yaml` Zod schema validates required fields, rejects extras.
- Integration: against a mocked Klaviyo client, verify that running the draft script for a fixture campaign produces the expected `createTemplate` + `createCampaign` call shapes.
- Manual: draft one real campaign to Klaviyo; visually verify the rendered email matches the MJML preview.

### Phase 3: Flow API derisking spike (~half day, hard gate to Phase 4)

Before committing to Phase 4 scope, confirm that the patterns we need
from Klaviyo's flow API actually work via API and aren't UI-only.

- [ ] Build the smallest possible flow via the Klaviyo flow API directly (no YAML compiler yet):
  - Trigger: `metric` (placed-order event) or `segment` add — whichever the post-purchase flow needs
  - 1 time-delay step
  - 1 send-email step with a Phase 1 template
  - 1 conditional split (e.g., based on customer property like `total_spent`)
- [ ] Document findings in this file under `Notes > Spike findings`:
  - Which trigger types are accessible via API
  - Which split/branch features are accessible via API
  - JSON shape gotchas
  - Whether flows must be created in the UI first before API can modify them, or whether they can be created end-to-end via API
  - Rate limits and quirks
- [ ] Write a brief go/no-go for Phase 4 based on what works. If significant features are UI-only, Phase 4 scope drops to "Claude generates JSON; Tom pastes" rather than full programmatic deployment.

#### Tests
- Manual: the spike flow runs end-to-end in a Klaviyo sandbox account against a test profile; the test profile receives the email.

### Phase 4: Flow write production (~1 week, revised post-spike)

**Approach changed from the original plan** — see `Spike findings`
below. We no longer try to POST a flow from scratch. Instead, Tom
creates the flow skeleton in Klaviyo's UI (trigger, step count,
conditional-split topology), we pull its definition into the repo as
YAML keyed by stable Klaviyo action IDs, Claude iterates content in
the YAML, and the deploy script PATCHes each action's `data` block.
Wiring (`id`, `type`, `links`) is **never mutated** — only
content/config.

- [ ] Implement flow read + patch methods in `src/lib/klaviyo/client.ts`:
  - `getFlowDefinition(id)` — already shipped in Phase 3 spike
  - `listFlows()` — already shipped in Phase 3 spike
  - `patchFlowAction(actionId, data)` — `PATCH /api/flow-actions/{id}` with new `data` block
  - `getFlowStatus(id)` / `setFlowStatus(id, status)` — for draft↔live transitions if we want them; otherwise leave activation as a UI action
- [ ] Define flow YAML schema (Zod). Schema mirrors what the Klaviyo definition exposes:
  - `flow.id` — Klaviyo flow ID this YAML manages
  - `flow.name` — for verification (refuse to deploy if name on disk doesn't match Klaviyo)
  - `actions: { <klaviyo_action_id>: { content } }` — content keyed by the stable Klaviyo ID, not a repo-local slug
  - send-email content: `subject`, `preview_text`, `template_mjml_path` (path to MJML in `klaviyo/templates/`), UTM `content` override
  - time-delay content: `unit`, `value`, optional `delay_until_weekdays`
  - conditional-split content: `condition_groups` (passed through verbatim to Klaviyo's filter shape)
- [ ] Implement `src/lib/klaviyo/flow-deployer.ts` — pure orchestrator: load YAML, verify it matches the live flow's wiring, compile each managed action's content, PATCH per action.
- [ ] Create `src/lib/klaviyo/managed-flows.ts` — **hard-coded denylist** by name:
  - `Welcome Flow - DTC First Purchase Discount` (UL2AFA — the +27.6% LTV live flow)
  - `Welcome Flow - Dec 2025` (RcGm73 — alternate welcome draft)
  - Any name matching `/welcome/i`
  - Any name matching `/abandoned checkout reminder/i` (WunfeH — currently live, may be replaced by the 5-email sequence)
  - Pull command refuses to pull these into the repo; deploy command refuses to PATCH them.
- [ ] Create `scripts/klaviyo-flow-pull.ts` — CLI: `npm run klaviyo:flow:pull <flow_id>`. Fetches the definition, serializes editable parts to `klaviyo/flows/<slug>.yaml` + dumps the full original definition to `klaviyo/flows/<slug>.snapshot.json` for diff reference.
- [ ] Create `scripts/klaviyo-flow-deploy.ts` — CLI: `npm run klaviyo:flow:deploy <slug>`. Supports:
  - `--dry-run` (default): GET current state, compute per-action diff vs. YAML, print, no writes
  - `--apply`: PATCH each managed action's `data` block; never touches wiring
  - Hard refusal if the flow's current status is `live` unless `--update-live` is also set
  - Hard refusal if YAML's `flow.name` doesn't match the live flow's name (defensive — catches accidental rename or ID swap)
- [ ] Ship the three flows the 360 plan calls for, in this order:
  - Post-purchase — highest-leverage gap (no live post-purchase flow exists today)
  - Win-back 90d
  - M4 cross-sell
  - For each: Tom creates skeleton in UI → `npm run klaviyo:flow:pull <id>` → Claude iterates YAML → `npm run klaviyo:flow:deploy <slug> --apply`
- [ ] Per-step UTMs auto-injected as `utm_campaign=<flow-name-slug>&utm_content=<step-id>` so the Phase 0 `klaviyo_flow_attribution` table can break down by step.
- [ ] Update `specs/current/integrations.md` with the flow pull/deploy workflow + safety model.

#### Tests
- Unit: flow YAML schema validation (Zod) rejects malformed flows / unknown action IDs.
- Unit: managed-flows denylist blocks pull AND deploy on denylisted names.
- Unit: name-mismatch guard (YAML's `flow.name` ≠ Klaviyo's current name → refuse).
- Unit: `--update-live` requirement enforced when target flow is `live`.
- Unit: deployer never includes `id`, `type`, or `links` in the PATCH body (defensive — even if YAML accidentally contains them).
- Integration: against mocked client, `--apply` issues the expected per-action `patchFlowAction` calls; `--dry-run` doesn't.
- Manual: pull → edit a non-critical existing draft flow → deploy → verify the change shows in Klaviyo UI.

### Phase 5: Polish (defer — add when pasting friction reappears)

- In-admin diff visualization for flow deploys (vs. terminal text diff)
- Per-step performance metrics surfaced alongside the YAML in the admin UI
- A/B variant support inside flow YAML
- Bidirectional drift detection (warn or pull-back when someone edits a managed flow in Klaviyo's UI)

## Notes

### Approval workflow

The whole integration relies on Klaviyo's own draft/published gate as
the approval surface. We do **not** build a custom approval UI.

- Campaigns: Claude creates a **draft campaign** in Klaviyo; Tom
  reviews in Klaviyo's UI; Tom hits send.
- Flows (first deploy): Claude creates an **inactive draft flow** in
  Klaviyo; Tom activates manually.
- Flows (updates to live): Claude updates the live flow only when
  invoked with `--update-live`. Without that flag, any change to a
  flow already in `live` status errors out.
- Welcome flow: not on the managed-flows allowlist. Cannot be touched
  by this code at all.

### Open questions

- **Per-flow vs per-step attribution granularity in `klaviyo_email_performance` and `klaviyo_flow_attribution`?** Per-flow is simpler; per-step is more honest about which email drove the order. Decide during Phase 0 based on what the Klaviyo API surfaces cleanly.
- **One API key or two?** Klaviyo supports scoped private keys. If Phase 0 ships first, a read-only key lowers the blast radius until Phase 2 needs write scopes. Worth one extra key in env vs. one fewer scope review.
- **Refund handling in `klaviyo_flow_attribution`** — does a refunded order count toward attributed revenue? Probably keep as recorded and surface refund status separately so the dashboard can choose what to show.
- **MJML rendering parity** — Klaviyo's own template editor renders slightly differently from MJML's reference renderer in some clients. After Phase 1, send one test email through every major client (Gmail web, Gmail iOS, Apple Mail, Outlook) before committing to the pipeline.
- **What happens if a `flow-compiler` upgrade changes JSON output for an already-live flow?** Treat the next deploy as a real update — `--dry-run` will surface the diff and `--update-live` is required to apply. Document this in `integrations.md`.

### Risks

- **Klaviyo flow API gaps (highest risk).** Some triggers and conditional features may be UI-only. Phase 3 spike exists specifically to find this out cheaply. If the spike reveals dealbreakers, Phase 4 drops to "Claude generates JSON, Tom pastes."
- **Welcome flow is the cash cow.** +27.6% LTV lift is the live measured contribution. The managed-flows allowlist must be a physical gate — not a comment, not a convention. Belt and suspenders: the deploy script validates against the allowlist *and* refuses any flow whose Klaviyo `name` matches a hard-coded `WELCOME_FLOW_NAMES` denylist.
- **Rate limits.** Klaviyo's API limits vary by endpoint; daily read syncs are fine, but a Phase 4 deploy that touches multiple flows in sequence could hit them. Client should respect `Retry-After` and back off.
- **Template rendering across clients.** MJML mitigates most of this but doesn't eliminate it. Schedule one cross-client manual QA pass at end of Phase 1.
- **Spike rot.** If Phase 3 happens long before Phase 4, the spike findings may go stale (Klaviyo ships API changes). Phase 4 should re-validate the spike's key assumptions at kickoff.

### Alternatives considered

- **Write side via paste-only forever.** Rejected: the explicit ask is to remove the paste-shuffle, and post-purchase + win-back + M4 cross-sell will all need iteration. Paste cost compounds.
- **React Email instead of MJML.** Viable. MJML wins on email-client compatibility maturity and its tooling is more battle-tested for transactional/marketing emails specifically; React Email is more code-friendly but younger. Revisit if MJML's developer ergonomics frustrate.
- **Skip flow YAML, author JSON directly.** Fewer abstractions, but JSON is hard to review in PRs and harder for Claude to author reliably. Compiler is cheap insurance.
- **Custom approval workflow in the admin app.** Rejected: Klaviyo's own draft/published gate already gives us this. Building our own duplicates the surface for no gain.
- **Bidirectional drift sync from day one.** Rejected as Phase 5: sounds clean, historically becomes a swamp. Skip unless drift becomes a real operational problem.

### Phased rollout strategy

- **Phase 0** ships independently; everything else can wait. Closes the H12 measurement gap and the `klaviyo_post_purchase` channel-status flip in `retention-loop.md` regardless of write-side timing.
- **Phases 1 + 2** ship together — the template pipeline isn't useful without a target.
- **Phase 3** runs as a half-day spike before scoping Phase 4. If the API gaps are bad enough, Phase 4 scope contracts.
- **Phase 4** ships flow-by-flow, not all-at-once. Post-purchase first (largest 360 gap), win-back second, M4 cross-sell third.
- **Phase 5** is opportunistic — only when the friction it removes is observable.

### Spike findings

Ran 2026-06-03 against the live Klaviyo account using a read-only
`scripts/klaviyo-flow-spike.ts` (subcommands: `list`, `get <id>`,
`get-welcome`). All findings from GETs only — no writes.

#### Account inventory

11 flows total: **6 live, 5 draft.** Live flows include the welcome
flow (`UL2AFA - Welcome Flow - DTC First Purchase Discount`, the
+27.6% LTV cash cow), abandoned-checkout reminder (`WunfeH`), back-in-stock,
two Geneva-segment broadcasts, and an email-signup no-purchase flow.
**No live post-purchase, win-back, or M4 cross-sell** — confirms the
360 gap is real. Drafts include a 5-email AC sequence (`YqCvHv`,
multi-step + conditional splits — good shape sample), three duplicate
"Essential Flow Recommendation_" drafts (cleanup candidate, not
blocking), and a "Welcome Flow - Dec 2025" draft (`RcGm73`, possibly
a planned welcome replacement).

#### Flow definition shape — confirmed via UL2AFA + YqCvHv

```
definition: {
  triggers: [{ type: "list" | "metric", id }],   // observed both types
  profile_filter: { condition_groups: [...] },   // top-level recipient filter
  entry_action_id,                                // pointer to first action
  actions: [...],                                 // flat list, wired by links
  reentry_criteria,                               // present on metric-triggered flows
}

action: {
  id,                          // stable Klaviyo-assigned, survives edits
  type: "send-email" | "time-delay" | "conditional-split" | ...,
  data: { ... type-specific ... },
  links: {                     // graph wiring — by action ID
    next?,                     // sequential
    next_if_true?,             // conditional-split true branch
    next_if_false?,            // conditional-split false branch
  },
}

send-email data:        { message: <ref>, status }
time-delay data:        { unit, value, secondary_value, timezone, delay_until_weekdays }
conditional-split data: { profile_filter: { condition_groups: [...] } }   // same shape as top-level filter
```

#### Implications for Phase 4

1. **Klaviyo's docs explicitly discourage programmatic flow creation:** *"Klaviyo does not recommend pre-creation of flows in customer accounts. The recommended workflow requires creating flows manually in Klaviyo first, then retrieving their definitions via GET /api/flows/:id?additional-fields[flow]=definition."* This is a hard signal — don't fight it.
2. **Wiring is linked-list-by-ID.** `links.next` for sequences, `links.next_if_true` / `links.next_if_false` for splits. Trivial to compile from YAML, but more importantly: **stable IDs let us PATCH content per action without rebuilding the graph.**
3. **`data` blocks are clean and self-contained.** Every action's `data` is the part that holds editable content (subject, copy reference, delay value, split condition). The wiring lives outside `data`. So PATCHing `data` only is safe.
4. **`profile_filter.condition_groups`** is the same shape at the flow-top-level and inside conditional-split actions. One filter schema covers both.

#### Phase 4 scope decision: **create-in-UI → pull-as-YAML → PATCH-content**

The original plan was POST-a-whole-flow-from-YAML. That's no longer
the play. The new model:

1. Tom creates the flow skeleton in Klaviyo UI (trigger, step count, conditional-split topology).
2. `npm run klaviyo:flow:pull <id>` fetches the definition and serializes the per-action content into `klaviyo/flows/<slug>.yaml`, keyed by stable Klaviyo action IDs.
3. Claude iterates the YAML — copy, subjects, delay values, condition criteria.
4. `npm run klaviyo:flow:deploy <slug>` PATCHes each action's `data` block via `PATCH /api/flow-actions/{id}`. Wiring (`id`, `type`, `links`) is never mutated.
5. Activation stays a manual UI action.

This is **lower-risk and faster to build** than the original plan. Phase 4 estimate revised from 1–2 weeks to ~1 week.

#### Open questions for Phase 4 implementation

- Can `PATCH /api/flow-actions/{id}` modify a flow whose status is `live`? Or does the flow need to be paused/draft first? (Test on a non-critical existing draft flow before committing the deploy script's behavior.)
- The `send-email` action's `data.message` field references a "message" object — confirm what we're allowed to PATCH on it (subject? from_label? template ID?) vs. what requires a separate `flow-message` endpoint.
- `reentry_criteria` only appeared on the metric-triggered flow, not the list-triggered welcome flow. May or may not be top-level on every flow — handle gracefully if absent.

### Where this lives

- This file: `specs/work-plans/todo/klaviyo-integration.md`
- Linked from `specs/ops/PRIORITIES.md` (active workstream)
- The previous Phase 3 in `funnel-strategy-next-iteration.md` now
  points here instead of duplicating the read-side scope
- Move to `specs/work-plans/completed/` when all phases (or all
  non-deferred phases) ship; add an entry to `specs/ops/releases.yaml`
