# Portal AI Assistant ("Talk to your data")

## Status: LIVE IN PRODUCTION — Phases 1–5 (margin incl. shipping works; only Phase 6 catalog view + streaming remain)
Shipped to prod for internal use + evaluation. Prod read-only role + `DATABASE_URL_READONLY` (Vercel) provisioned; migration `0094` applied to prod; `/assistant` auth-gated and serving; live PostHog (Phase 3) answering visitor/funnel questions. Docs updated (Rule 11): `schema.md`, `routes.md`, `integrations.md`, `components.md`, `contributor-setup.md` (§7 read-only-role step). Remaining: streaming (deferred), Phases 4–6, and Greg/Oliver each running `scripts/setup-readonly-role.ts` on their own dev branch (now documented; can't be done for them).

## Context
- Tom wants to ask the portal questions about Fitwell's data in plain English and get answered by an LLM running inside the portal — e.g. *"how many people visited but didn't purchase in the last 90 days?"*, *"where's the most recent M1 production order and does it need follow-up?"*, *"did we hear back from the prototyper for the M5?"*, *"when did I last touch base with Harrison from Marathon?"*, *"what was our product margin for April?"*.
- The value is the **open-ended** question — the one nobody pre-built a report for. So this is a **tool-calling agent** that writes its own read-only queries, not a fixed library of canned metrics.
- **The assistant is also a discovery instrument (the catalog thesis).** Every question + generated query is cataloged. The most-asked / highest-value questions get **promoted** from "typed each time" into first-class UI — a saved one-click query first, then a proper dashboard widget. The chat tool earns its own replacement for high-frequency questions while remaining the catch-all for the long tail. **This makes query logging core infrastructure from day one, not an afterthought** — if we don't capture questions from first real use, we lose the data that drives the roadmap.
- Scoping diligence (2026-06-29) pressure-tested the three hardest question shapes — cross-source (visitors), judgment (production/CRM status), and calculation (margin). The design holds, with one hard rule that fell out of it: **the assistant must disclose data coverage and refuse to fabricate missing components** (see Notes → "Honesty is the feature").
- Not greenfield for the model layer: `@anthropic-ai/sdk` is already a dependency and `src/lib/ai/anthropic.ts` establishes the tool-use / Zod-validated pattern to reuse. There is no chat UI yet — that part is net-new.
- Reference: `src/lib/ai/anthropic.ts` (Anthropic client + tool pattern), `src/lib/admin/funnel.ts` (`runHogQL` live HogQL helper), `src/lib/cogs/` (existing COGS engine), `src/app/(admin)/layout.tsx` (admin auth gate), Recharts (already in stack, for charts), `specs/strategy/event-taxonomy.md` + `specs/strategy/funnel.md` (PostHog event names).

## Dependencies
- `ANTHROPIC_API_KEY` — already in env.
- **Read-only Postgres role + connection string** — NEW. A dedicated read-only role on the production Neon branch (and dev branches), exposed as `DATABASE_URL_READONLY`. Grants restricted to non-sensitive tables (must exclude NextAuth secret columns — `account.access_token`/`refresh_token`, `session.sessionToken`, `verificationToken`). The assistant connects ONLY through this role. **Needs Greg sign-off** (infra + role grants).
- **Schema migration** — NEW tables for conversation history + query catalog (`assistant_conversation`, `assistant_message`, `assistant_query`, optional `assistant_saved_query`). Generate + apply per the migration workflow; **needs Greg sign-off** (new tables in shared schema).
- `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` — already in env (used by `runHogQL`).
- Existing `src/lib/cogs/` engine (`getCogs`) — currently unwired; this becomes its first consumer.

## Scope

### Included
- Admin-only chat page at `src/app/(admin)/assistant/page.tsx` (inherits the `(admin)` auth gate).
- Backend at `src/app/api/admin/assistant/route.ts` with its own `auth()` 401 guard, streaming responses.
- A `query_database` tool: runs **read-only** SQL against Neon via `DATABASE_URL_READONLY`. Guardrails: SELECT-only validation, statement timeout, auto-`LIMIT`, single-statement only.
- A `describe_schema` tool: lists/describes tables on demand (the schema is 90 tables — introspect, don't dump the whole thing into context every call).
- A `query_posthog` tool: passes HogQL to `runHogQL` for live visitor/funnel questions.
- A domain glossary + business-rules system prompt (model codes, "order" = PO vs Shopify, `isSample`, cents, total-sales formula, COGS coverage rules).
- Model **toggle**: defaults to `claude-sonnet-4-5`, user can switch to Opus per-conversation for heavy reasoning.
- UI always surfaces the **generated SQL/HogQL + raw rows** alongside the natural-language answer.
- **Charts**: agent emits an optional structured chart spec (line/bar/pie + axes/series); rendered with Recharts, with a data table always available as fallback.
- **Multi-session history**: conversations persisted; sidebar to list, reopen, rename, and delete past chats. Revisit "that margin question from last Tuesday."
- **Query catalog + promotion loop**: every question + generated query is logged **per user**, self-tagged by category (revenue / customers / production / crm / margin / funnel / marketing / other) and source. The catalog view toggles between **"mine"** (personal recall) and **"everyone"** (team rollup), ranking questions by frequency/recency. **Promotion keys off team-wide demand** — questions many admins ask are the strongest dashboard-widget candidates. A "promote" action saves a question as a one-click pinned query and/or flags it as a dashboard-widget candidate for the build backlog.
- Surfacing the existing `getCogs` margin engine through the agent, with mandatory coverage + no-shipping-cost disclosures.

### Excluded
- Any write capability to business data — read-only by construction (no INSERT/UPDATE/DELETE/DDL via the agent). The assistant's *own* tables (history/catalog) are written by app code, not by the agent.
- Non-admin access (suppliers/companies). Admin-only.
- New data capture to close known gaps (carrier shipping cost, SKU→model master table) — noted as future projects, out of scope here.
- Auto-building dashboard widgets from promoted queries — v1 promotion produces a saved query + a backlog flag; turning a flagged query into a real dashboard component is a separate, human-reviewed build.

## Implementation Phases

### Phase 1: Foundation + read-only SQL agent — CODE COMPLETE (2026-06-29), pending live wiring
- [x] Create read-only Neon role + `DATABASE_URL_READONLY` — **LIVE on Tom's dev branch** via `scripts/setup-readonly-role.ts` (idempotent; reads verified, writes denied, secret-bearing auth tables revoked). Runbook for prod: `scripts/create-readonly-role.sql`. Still TODO: **Greg applies to production** + add `DATABASE_URL_READONLY` to Vercel env; document in `specs/ops/contributor-setup.md`.
- [x] Read-only db client in `src/lib/ai/assistant/readonly-db.ts` (neon-http via `DATABASE_URL_READONLY`; `statement_timeout` baked into the role; injectable executor test seam).
- [x] `query_database` tool: SQL guard (`sql-guard.ts`) validates single `SELECT`/`WITH`, rejects multi-statement + DML/DDL, injects `LIMIT`; returns rows + truncation flag.
- [x] `describe_schema` + `list_tables` tools (`schema-catalog.ts`, via `information_schema`; sensitive auth tables filtered).
- [x] System prompt: domain glossary + business rules + honesty rules (`glossary.ts`).
- [x] Agent loop (`agent.ts`; multi-turn tool use, step cap as cost guard; `client.ts` shares the Anthropic client + model map).
- [x] Model toggle: `claude-sonnet-4-5` default, Opus option threaded from the request.
- [x] API route `src/app/api/admin/assistant/route.ts` (auth guard, Zod-validated body). NOTE: non-streaming for v1 — streaming deferred as a follow-up.
- [x] Chat page `src/app/(admin)/assistant/page.tsx` + `assistant-chat.tsx` + sidebar nav entry; renders answer + collapsible "Show work" panel (SQL + rows table). Ephemeral this phase; persistence in Phase 2.

#### Tests
- [x] Unit: SQL validator accepts representative SELECTs; rejects INSERT/UPDATE/DELETE/DDL/multi-statement + comment-smuggling; auto-injects missing LIMIT (`sql-guard.test.ts`, 18 cases).
- [x] Unit: agent loop routes a tool call, returns answer + steps, and surfaces a guard rejection as a recoverable error (`agent.test.ts`, stubbed model + executor).
- [ ] Integration: API route 401 unauthenticated; a known question returns expected rows against a seeded read-only DB. (Deferred until the dev read-only role is wired.)

### Phase 2: Persistence — history + query catalog substrate — COMPLETE (2026-06-29) on dev
- [x] Schema: `assistant_conversation`, `assistant_message` (+ `steps_json` for replay, `stopped_at_step_limit`), `assistant_query` (userId denormalized; source, queryText, category, tablesTouched, rowCount, durationMs, error). Migration `0094_yellow_wolfsbane.sql` generated + **applied to dev** (prod = Greg, before any push).
- [x] `persistTurn` writes the user question, assistant answer (+ trimmed replay steps), and one `assistant_query` catalog row per `query_database` step (`persistence.ts`). Server-authoritative history rebuilt per turn.
- [x] Agent self-tags each query with a `category` (new tool input enum) + records `source` + parsed `tablesTouched` + `durationMs` (`tools.ts`, `catalog-helpers.ts`).
- [x] History sidebar: list / reopen / rename (inline) / delete (inline confirm) — `assistant-workspace.tsx`; reopening replays the saved answer + SQL panel from `steps_json`. CRUD routes under `api/admin/assistant/conversations`.

#### Tests
- [x] Unit: catalog helpers — category normalization, title derivation, `parseTablesTouched`, steps trimming (`catalog-helpers.test.ts`, 9 cases).
- [x] Live dev-DB smoke (run + removed): multi-turn persist → list → load-with-replay → catalog rows (category/tablesTouched) → rename → delete-cascade, all green.

### Phase 3: PostHog (live visitor/funnel questions) — COMPLETE (2026-06-29), live in prod
- [x] `query_posthog` tool + dedicated `posthog.ts` HogQL runner (captures column names, which `funnel.ts`'s helper drops; injectable executor test seam). Array-rows keyed by column for uniform rendering.
- [x] System prompt: PostHog event taxonomy + Postgres-vs-PostHog routing (person-level web behaviour → PostHog; business/aggregate → Postgres).
- [x] Source-disclosure rule: answers name source + unit (PostHog persons vs Postgres orders vs GA4 sessions) since they disagree. Catalog logs `source='posthog'`.

#### Tests
- [x] Unit: HogQL result shaping — array-rows → named columns, truncation, missing-columns fallback (`posthog.test.ts`, 3 cases).
- [x] Unit: agent routes a "visited but didn't buy" question to `query_posthog` and tags `source=posthog` (`agent.test.ts`).
- [x] Live verification: dev smoke returned 5,231 person-level non-buyers with correct source disclosure.

### Phase 4: Charts — COMPLETE (2026-06-29)
- [x] `render_chart` tool — agent emits a structured spec (type line/bar/area/pie, title, data, xKey, series). Validated/normalized in `chart.ts` (coerces string→number, caps 100 points). No migration: the spec rides in the existing `steps_json`.
- [x] Recharts renderer (`chart-view.tsx`) in the answer view; the "Show work" panel still shows the underlying query + a data table as the fallback. `render_chart` steps are excluded from the work list (shown as the chart instead).
- [x] Persisted with the message via `steps_json` → reopening a conversation re-renders the chart.

#### Tests
- [x] Unit: chart-spec validation/normalization — coercion, point cap, rejects bad type/empty/missing-key (`chart.test.ts`, 7 cases).
- [x] Unit: agent captures a `render_chart` step's validated spec on the turn (`agent.test.ts`).
- [x] Live dev smoke: "total sales by month" produced a valid bar-chart spec + concise text answer.

### Phase 5: COGS / margin — COMPLETE (2026-06-30), via the merged shipping-cost layer
The shipping-cost layer merged (separate work by Greg/Tom): `shipping_charge` table
(carrier cost *paid*, migration `0095_happy_drax`), a COGS engine with PO +
standard-cost fallback (`src/lib/cogs/cost-basis.ts`, `standard-cost.ts`), and the
margin rules baked into `glossary.ts`. The team chose a **glossary-driven SQL**
approach over a separate `product_margin` tool — the agent computes contribution
margin via `query_database` against the new tables. So Phase 5 was delivered by
that merge; this phase's work was wiring + verification:
- [x] Read-only role can read `shipping_charge` — confirmed on dev (live), and
  `GRANT SELECT ON ALL TABLES` re-run on prod as insurance for the new table.
- [x] Glossary encodes: per-channel (`source_name`), net revenue = `subtotal_price`,
  contribution = net revenue − COGS − carrier shipping − refunds, standard-cost
  fallback with coverage disclosure, B2B-approximate caveat.
- [x] Docs corrected: `integrations.md` now describes full contribution margin
  (the old "cannot answer margin including shipping" claim was stale).
- [x] UI: added a margin example prompt so the capability is discoverable.

#### Verification (live, dev)
- [x] "D2C contribution margin including shipping, last 3 months" → answered fully:
  net revenue (subtotal) − standard-cost COGS − actual `shipping_charge` carrier
  cost, per channel, with COGS coverage disclosed. The exact question the assistant
  *refused* in Phase 1 now answers truthfully — the data-gap loop closed.

> Note: margin is computed by the model's SQL guided by the glossary, not a
> deterministic tool. If we ever see wrong margin SQL in the catalog, revisit
> wrapping `src/lib/cogs/` as a `product_margin` tool for the canonical number.

### Phase 6: Catalog view + promotion loop
- [ ] Catalog page `src/app/(admin)/assistant/catalog/page.tsx`: **"mine" / "everyone" scope toggle**; questions ranked by frequency/recency, grouped by category, with the generated query + run stats. Team-rollup view shows per-question asker count (how many distinct admins asked it) to drive promotion decisions.
- [ ] `assistant_saved_query` table (id, question, queryText, source, category, pinnedBy, createdAt) — generate + apply migration.
- [ ] "Promote" action: save as a one-click pinned query (appears on the assistant page) AND flag as a dashboard-widget candidate (writes a backlog entry / note for human review).
- [ ] Cost guard (cap tool iterations; surface token spend per conversation) + hardened "honesty rules" in the system prompt.
- [ ] Docs: update `specs/current/routes.md`, `specs/current/components.md`, `specs/current/schema.md`, `specs/current/integrations.md`; add nav + `/docs` entry.

#### Tests
- Unit: frequency/category rollup over `assistant_query`; promotion writes a saved query + backlog flag.
- E2E: ask a question, see it appear in the catalog, promote it, confirm the pinned one-click query runs.

## Notes
- **Honesty is the feature.** The naive version, asked "margin including shipping," nets shipping *revenue* against COGS and returns a confident wrong number. Ours must disclose coverage, name the missing component, and offer a clear next step. The single most important behavioral requirement — encode it in the system prompt and test it.
- **The catalog is the strategy, not telemetry.** Logging exists to discover what the portal's reporting surface *should* be. Captured **per user** but rolled up **team-wide** — a question many admins ask is the strongest signal it deserves a real widget. High-frequency questions graduate: chat → pinned one-click query → real dashboard widget. The assistant is partly a transitional tool that tells us what to build to replace it for the common cases, while staying the catch-all for the long tail.
- **Why text-to-SQL over fixed metrics:** the highest-value questions (production status, "did we hear back," "last contact with Harrison") are open-ended and span obscure tables. A canned-report tool can't answer them; an agent over the full DB can.
- **Schema introspection, not schema dump:** 90 tables / ~3,600 lines would blow context and cost if dumped every call. The `describe_schema` tool keeps context lean while covering the whole DB.
- **Known data gaps (surface, don't paper over):** (a) outbound carrier shipping cost is absent — only shipping *charged* exists; (b) COGS is ex-works PO price (no inbound freight/duty) and only covers SKUs with a received/paid PO; (c) no structured model-code field — M1/M4 by text match, M5 absent; (d) GA4/PostHog/UTM give *different* visitor numbers by construction.
- **Future data-capture projects (out of scope):** pull carrier label cost from Shopify fulfillment for true margin-including-shipping; add a SKU→model master table for reliable model-level rollups.
- **Security:** admin-only + read-only role makes prompt injection low-risk (worst case is an expensive query, mitigated by timeout/LIMIT). Restrict the read-only role away from NextAuth secret tables so the agent can't surface session/access tokens. The assistant's own history/catalog tables are written by trusted app code, never by the agent.
- **Cost:** ~a few cents to ~15¢/question on Sonnet; Opus ~5×. Negligible for internal admin use; the toggle keeps everyday questions on Sonnet.
- **Open questions for Greg:** read-only role grants + whether it lives on production Neon or a dedicated branch; the new-tables migration (history + catalog); acceptable per-conversation iteration/cost cap.
