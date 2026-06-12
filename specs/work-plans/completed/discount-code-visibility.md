# Discount-Code-Name Visibility

**Status:** in progress — Greg signed off 2026-06-10 (Tom relayed); open questions answered
**Estimate:** ~½ day
**Origin:** follow-up #3 of `specs/strategy/sessions/2026-06-09-retention-led-recal.md`

## Context

The retention-led recalibration (2026-06-09) made discount-code names a
measurement dependency: 32.5% of first orders use a discount, and we need
to split that band into **welcome-flow vs creator-code vs review-code**
redemptions to quantify the C1 leakage channel of the signup-lift
workstream (360-campaign W5 §6). It also unlocks per-creator revenue
attribution ahead of the creator program's own tracking landing.

Today we store only the aggregate `order.total_discounts` (cents). The
code *names* are already in every payload we receive —
`ShopifyOrder.discount_codes: Array<{ code, amount, type }>`
(`src/types/shopify.ts:65`) — and `upsertOrder()`
(`src/lib/shopify/sync.ts:179`) drops them on the floor. No GraphQL work
needed; this is a capture-and-persist gap, not an API gap.

**Bucketing convention (decided 2026-06-09):**
- All Judge.me review codes roll up into one **"review-leaver"** bucket
  (each reviewer gets a unique code; individually meaningless).
- Creator codes stay **per-creator** (`watchbros15`, `watchchris20`, …),
  tagged with a `creator` family for rollups.

## Dependencies

- None for go-forward capture + 60-day backfill (orders REST API cap).
- **Full-window backfill (back to Feb 2024) rides on the `read_all_orders`
  scope deploy** (Greg queue #3, top of `specs/ops/PRIORITIES.md`).
  `scripts/import-history.ts` already flows through `syncRecentOrders` →
  `upsertOrder`, so if this plan ships *first*, the history import
  backfills codes for free — a reason to land this before Greg runs the
  import.
- **Coordination with `creator-program.md` Phase 4** (not a blocker):
  that plan creates a `discount_code` table for *generated* creator codes
  with `uses_count` / `attributed_revenue_cents`. This plan stores
  *redemptions* per order. Join key is the code string (normalized
  lowercase). Don't duplicate its aggregates here — when its table lands,
  its counters can be derived from this table's rows.

## Scope

**In:**
- Persist per-order discount code redemptions (code, amount, type).
- Backfill (60-day now; full window via history import).
- Pure classifier mapping code → family (`welcome` / `creator` /
  `review` / `other`) computed at query time.
- Surface the first-order discount split (the C1 measurement) in the
  admin.

**Out:**
- Generating discount codes (creator-program Phase 4).
- Klaviyo flow attribution grain (`klaviyo-integration.md` Phase 0.5).
- Any storefront/popup changes (those are W5 §6 experiments, gated on
  this measurement).

## Implementation Phases

### Phase 1: Capture (schema + sync) — ✅ code-complete 2026-06-10
- [x] New table `order_discount_code` in `src/lib/schema.ts`:
      `id`, `order_id` FK → `order` (cascade delete), `code` (stored
      normalized lowercase; original casing in `code_raw` if it differs),
      `amount_cents`, `type` (Shopify's `fixed_amount` / `percentage` /
      `shipping`), unique index on `(order_id, code)` for idempotent
      upserts. **No stored `family` column** — classification rules
      evolve (new creators); a stored family is denormalized drift
      waiting to happen (cf. the two already-broken denormalized
      customer fields). Compute at query time.
- [x] `npm run db:generate` → `0058_flawless_big_bertha.sql` (reviewed:
      table + FK + 2 indexes only), `npm run db:migrate` applied to dev
- [x] Extend `upsertOrder()` — delete-and-reinsert mirroring the line-item
      pattern; codes normalized lowercase, raw casing kept
- [x] Tests: classifier unit tests (`src/lib/discount-codes.test.ts`) +
      integration test for replace-not-duplicate and normalization
      (`sync.integration.test.ts`; skips without TEST_DATABASE_URL like
      the rest of the suite). `npm run check` green (732 tests)
- [x] Update `specs/current/schema.md`

### Phase 2: Backfill — ✅ done on dev 2026-06-10 (prod pending deploy)
- [x] Re-run the order sync over the available window — 800 orders
      synced, 0 errors, into Tom's dev branch (PostHog key stripped per
      the import recipe). **Prod backfill = re-run after deploy.** Note:
      sync keys on `updated_at`, so recently-touched older orders got
      codes too — earliest captured code is on a 2026-01-07 order.
- [x] When Greg runs the Feb-2024 history import, codes backfill
      automatically — verify row counts after (noted in PRIORITIES)
- [x] Sanity query: 40.6% of all orders in the last 60 days carry a code;
      first orders specifically: 28.2% — consistent with the 32.5% band
      (which measured a different window). Top codes: sf15 (109),
      welcome15 (35), watchbros15 (32), then CS make-goods.

### Phase 3: Classification + surfacing — ✅ code-complete 2026-06-10
- [x] Pure `classifyDiscountCode(code): { family, creatorSlug? }` util +
      unit tests (`src/lib/discount-codes.ts`). Final families (two added
      from backfill data with Tom's sign-off): `welcome` (welcome15,
      pinned), `creator` (prefix seed: watchbros, watchchris), `review`
      (`^jm-` **or** `^review-` — see Notes), `service` (CS make-goods +
      manual staff discounts), `event` (sf15 = Windup SF, geneva15),
      `other`
- [x] First-order discount split card on `/funnel/strategy` —
      ROW_NUMBER seq=1 convention shared with the channel breakdown's
      position filter; pure aggregation
      (`aggregateFirstOrderDiscountSplit`) unit-tested; multi-code orders
      count once under the most marketing-specific family (creator >
      welcome > review > event > service > other). Card shows the
      no-code share as the C1 headline + a coverage caveat until the
      full-history import runs.
- [x] Update `specs/current/routes.md`
- [x] `npm run check` green (738 tests)

**First real C1 read (dev DB, 2026-04-10 → 06-10, 397 first orders):**
71.8% no code · event 10.1% (Windup SF) · welcome 8.8% · creator 7.6%
(all watchbros — zero watchchris first-order redemptions) · review 0.5%.
Re-read on prod after deploy + backfill.

### Phase 4: Ship to production — ✅ done 2026-06-10
- [x] `npm run db:migrate:prod` — 0057 + 0058 applied together, prod at
      59/59 verified before push
- [x] Committed (`314cd8b`) + pushed; prod backfill run (802 orders, 0
      errors, import-history recipe with PostHog key stripped)
- [x] Prod C1 read (2026-04-10 → 06-10, 399 first orders): **71.9%
      no-code** · event 10.0% (Windup SF) · welcome 8.8% · creator 7.5%
      (all watchbros, zero watchchris) · review 0.5% · service 1.0%.
      Matches the dev read within 0.1pp. Registries extend as new codes
      ship (ongoing, not a phase).

**Plan complete 2026-06-12.** Takeaway for W5 §6: the headline "32.5%
of first orders use a discount" was hiding the Windup SF event — true
*online signup* capture is only ~9% of first orders (welcome15), which
strengthens the signup-lift case. Full history backfill still rides on
the Feb-2024 import (`read_all_orders`), which will auto-populate codes
through the shared `upsertOrder()` path.

## Notes

- **Judge.me code pattern:** Tom reported `JM-xxxxxxx` (2026-06-10), but
  the 60-day backfill shows `review-xxxxxxx` — format presumably changed
  at some point. Classifier accepts both prefixes.
- **Welcome-flow code (confirmed in data):** `welcome15`, pinned in
  `WELCOME_CODES`.
- **sf15 (109 uses, top code):** Windup Watch Fair SF event code —
  everyone who bought there got 15% via it (Tom 2026-06-10). Spawned the
  `event` family with geneva15.
- **Why a table and not a jsonb column on `order`:** the consuming
  queries are GROUP BY code/family rollups (per-creator revenue, C1
  split). Rows + indexes keep that in Drizzle; jsonb pushes it into raw
  SQL.
- Migration pre-flight (Critical Rule 2) applies: schema + migration
  commit together; `db:migrate:prod` before push.
