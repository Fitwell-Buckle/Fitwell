# Lead follow-up rule engine (general + AI-assisted)

> Status: **NOT STARTED — design phase.** Deferred by Oliver (2026-06) to work on
> together soon. The single editable rule (Settings → Lead follow-ups) shipped
> first; this plan generalizes it.

## Context

Today there is exactly **one** lead follow-up rule: "N days after the first
follow-up was sent with no reply → draft a second follow-up into Next Steps."
The wait period (default 14) and an on/off toggle are now editable in
Settings → Lead follow-ups (`lead_followup_settings` table, single row;
`src/lib/crm/followup-settings.ts`; cron `/api/cron/lead-followups`).

Oliver wants to (a) author **multiple** rules and (b) have **AI suggest
follow-up steps** rather than only firing a fixed cadence. The AI-suggestion
piece is the part whose schema we're unsure about and want to design together.

## Open design questions (resolve with Oliver before building)

- **What does "AI suggests follow-up steps" mean concretely?** Likely candidates:
  - AI proposes the *next step* per lead (e.g. "call them", "send case study",
    "wait 1 week then nudge") based on notes + history + reply state, and a human
    approves — vs. AI authoring whole rules. These need different schemas.
  - Is a "step" always an email draft (today's only action), or also tasks /
    reminders / stage changes? If non-email, we need an action taxonomy.
- **Per-lead suggestions vs. global rules.** A global rule engine (below) and a
  per-lead AI "next best action" are different features that may both be wanted.
- **Storage for AI suggestions:** a `lead_suggestion` table (leadId, kind,
  payload, status: suggested/accepted/dismissed, model, createdAt)? Or fold into
  `outbound_message` with a new status `suggested`?

## Candidate schema (the "general rule builder" we scoped, 2026-06)

Two tables — **run the data model past Greg (AGENTS.md #5) before migrating.**

- `lead_follow_up_rule`: id, name, enabled, position,
  `trigger_type` (`no_reply_after_sent` | `captured_no_followup` | `stale_in_stage`)
  + `trigger_days` + `trigger_stage`,
  optional filters (`filter_stage`, `filter_persona`, `filter_source_channel`),
  `action_type` (`draft_email` | `notify` | `set_stage`) + `action_stage`,
  timestamps.
- `lead_rule_run`: (rule_id, lead_id, fired_at) UNIQUE(rule_id, lead_id) — dedup
  ledger so each rule fires at most once per lead (replaces today's
  `sequenceStep >= 2` proxy).

Engine: `evaluateLeadRules()` in `src/lib/crm/rules.ts`; cron iterates enabled
rules → candidate query per trigger+filters minus `lead_rule_run` → re-check
Gmail reply for `no_reply_*` → perform action → record run. Seed a default rule
equal to today's 14-day nudge and backfill `lead_rule_run` from existing step-2
messages so nothing re-fires.

## Scope

- IN: multiple rules, trigger/filter/action taxonomy, dedup ledger, Settings
  manager UI, generic cron, AI suggestion mechanism (TBD above).
- OUT (for now): per-segment cadences beyond the simple filters; multi-channel
  (WhatsApp/SMS) actions.

## Dependencies

- `lead_followup_settings` (shipped) — migrate its single rule into the engine's
  seeded default, then retire the standalone table (expand/contract).
- `draftFollowupEmail` (`src/lib/ai/anthropic.ts`), `outbound_message`,
  `adminNotification`, lead stage/persona/channel fields.
- Greg sign-off on the new tables.

## Notes

- Keep stages/personas/channels as `text` (validated at API layer) per the CRM
  convention — no enums.
- Preserve the Gmail reply-recheck safety before any `draft_email` action.
