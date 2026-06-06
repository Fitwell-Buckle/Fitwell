# Work Plan: Editable production stages (add / delete / reorder)

## Context

The POs & Production "Setup" modal currently only **renames** the 9 fixed
stages. Oliver wants to **add new stages, delete stages, and reorder** them.

The 9 stages are currently a Postgres enum (`production_stage`) and a hardcoded
ordered tuple (`STAGES` in `src/lib/production/stages.ts`). Arbitrary add/delete
is impossible against an enum, so stages must become a dynamic, ordered DB
table. This is a structural change → **coordinate the migration with Greg before
applying to production** (per AGENTS.md rule #4).

## Decisions (confirmed with Oliver, 2026-05-26)

- **All stages editable** — including the opening + terminal states. The system
  no longer special-cases the keys `supplier_po` / `complete`; instead it treats
  **position 0 = opening** (where POs open + sub-PO routing kicks off) and **the
  last position = terminal** (reaching it triggers the Shopify receive). Guardrail:
  cannot drop below **2 stages**.
- **Deleting a stage with items in it → prompt forward or back.** The editor
  shows how many line items sit in that stage and moves them all to the next or
  previous stage (only the valid direction(s) offered at the ends) before delete.
- **History stays intact (soft delete).** A removed stage's row is retained
  (`active = false`); old PO timelines still render its name. It just leaves the
  live pipeline. New stages start with no cycle-time sample → default ETA.

## Dependencies

- `src/lib/production/stages.ts` (STAGES/STAGE_LABELS → defaults/seed)
- `production_stage` enum + `current_stage` / `stage` columns (3 tables)
- `production_stage_label` table (migration 0018) — folded into the new table
- Pure logic: cycle-time.ts, stage-owners.ts, sub-po.ts, raw-blank.ts
- service.ts, receive.ts, alerts.ts, cycle-time-data.ts
- ~12 UI files using STAGES / "complete" / "supplier_po"
- The stage-labels provider/hook added earlier this session

## Scope

**In:** dynamic stage table + resolver; data-driven pipeline logic (first/terminal
by position); editor UI (add / rename / delete / reorder + stranded-item move);
API; migration (hand off application).
**Out:** per-stage cycle-time *defaults* editing (new stages just use the global
default); making the raw-blank heuristic configurable (stays keyed to the seeded
stamping/edm keys, degrades gracefully); changing sub-PO routing semantics.

## Implementation Phases

### Phase 1: Data model + migration
- [ ] `production_stage_def` table: key (PK), label, position, active, timestamps
- [ ] Convert `current_stage` / `stage` (line item, event, assignment) enum → text
- [ ] Seed the 9 current stages; migrate any 0018 label overrides; drop `production_stage_label`
- [ ] Generate + review migration; `/tmp` idempotent apply script (Greg applies prod)

### Phase 2: Data-driven pure logic + tests
- [ ] `ProductionStage = string`; keep STAGES/STAGE_LABELS/DEFAULT_STAGE_DAYS as defaults
- [ ] `nextStage(order, s)`, `isTerminal(order, s)`, first/terminal helpers
- [ ] cycle-time, stage-owners, sub-po take the ordered list
- [ ] Update stages/cycle-time/stage-owners/sub-po unit tests

### Phase 3: Server resolver + service/receive/alerts
- [ ] `getStages()` / `getStageOrder()` (cached, tag-invalidated); `getStageLabels()` reads the table
- [ ] Thread order through service.ts, receive.ts, alerts.ts, cycle-time-data.ts

### Phase 4: UI consumers
- [ ] Extend the provider with `useStages()`; replace STAGES / "complete" / "supplier_po"
- [ ] Server pages pass the resolved order

### Phase 5: Editor + API
- [ ] Stage editor: add / rename / delete / reorder, stranded-item forward/back prompt
- [ ] `GET/PATCH/POST/DELETE /api/production/stages` (admin); revalidate tag
- [ ] `npm run check`; update specs/current/schema.md + routes.md

## Notes
- Migration application is hand-off (no DB writes from the agent), same as 0016–0018.
- Keep the dead `production_stage` enum type in place (harmless) to reduce migration risk.
