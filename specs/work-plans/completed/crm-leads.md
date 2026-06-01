# Work Plan: CRM leads + business-card capture

**Status:** Shipped 2026-05-31. All five phases complete; see end-of-file
notes for the carry-forward follow-ups (Playwright auth fixture, active-
tradeshow stickiness, "Capture another?" loop-back, voice notes).

## Context

We currently have no system for tracking B2B leads. They come from tradeshows
(WindUp, EPHJ, Watches & Wonders, Hong Kong Watch & Clock Fair) and other
sources, and the team needs to capture name/company/contact, take notes, and
follow up. The hero flow is **photograph a business card on a phone at the
booth → lead row pre-filled and saved in under 10 seconds**.

`specs/strategy/b2b-pipeline.md` already defines the conceptual model
(stages `prospect → lead → sample → pilot_order → recurring_order → partnership`,
seven B2B entry channels including two tradeshow channels, B1–B6 personas,
sample-status as the "central metric"). This work plan adds the schema and UI
to back it — without front-running into stalled-leads computation, ROI
dashboards, or activity logs that would be theater until real data lands.

## Decisions (confirmed with Oliver, 2026-05-31)

- **Migration blocker resolved** — `production_stage already exists` from the
  production-management work plan is no longer in the way; new migrations can
  go in.
- **Anthropic SDK is approved** as a new external integration (AGENTS.md
  rule 5). Add `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` to Vercel. Use
  **Claude Sonnet 4.5 vision** (`claude-sonnet-4-5`) for OCR — accuracy on
  noisy show-floor card photos beats the cost saving from Haiku.
- **Conversion semantics: wait for a real Shopify order before materializing
  a `customer` row.** A "converted" lead keeps its `companyId` FK (B2B side)
  but does not get a synthetic `customer` row with `shopify_id = null` — that
  would pollute the Shopify-synced table. The lead sits in a `converted`
  status until a Shopify order arrives and is naturally synced.

## Dependencies

- `src/lib/schema.ts` — new `lead` + `tradeshow` tables; FKs into existing
  `customer`, `company`, `user`.
- `src/app/api/production/po/[id]/attachments/route.ts` — pattern for the
  Vercel Blob upload route (multipart, 10 MB cap, `put()` with
  `addRandomSuffix`, returns URL).
- `src/lib/email/resend.ts` — pattern for the lazy-init AI client wrapper.
- `src/components/ui/{page-header,table,tabs,card,badge,button,input}` —
  reusable list + detail layout primitives (matches `customers/[id]`).
- `src/components/layout/admin-sidebar.tsx` lines 53–60 — nav insertion
  point under the **Customers** group.
- `src/lib/auth` — NextAuth v5 session; double-check pattern (layout + page
  both call `await auth()`).
- `specs/strategy/b2b-pipeline.md` — enum values, channel taxonomy, stage
  semantics, anti-patterns (a booth scan is `prospect`, not `lead`).
- `specs/strategy/personas.md` lines 205–332 — B1–B6 dropdown options.

## Scope

**In:** `lead` + `tradeshow` tables; Anthropic SDK wrapper; card-scan API
(Blob upload → Claude vision → Zod-validated extraction); admin list + detail
UI; mobile-first `/leads/capture` camera page with confidence rings; nav
entry under Customers; spec doc updates.

**Out:** `lead_activity` log table (notes are a text column for v1);
`lead_attachment` (one `cardImageUrl` column); voice notes / Whisper
transcription; stall computation (`stalledExpectedAt`); per-show ROI
dashboard; D2C reverse-attribution as a stored flag (derive at query time
if asked); email drip / sample-followup sequences; offline IndexedDB queue
+ service worker; bulk CSV import; dedup-on-email; assignment rules;
auto-promotion to `customer` (waits for Shopify order); persona auto-guess
from title heuristics (manual dropdown only).

## Implementation Phases

### Phase 1: Schema + AI client foundation ✅

- [x] `lead` table in `src/lib/schema.ts`: id, capturedAt, capturedByUserId
  (FK user), firstName, lastName, email, phone, title, companyName (text,
  pre-qualification), stage (text, default `'prospect'`, enum-in-code),
  personaTag (text, nullable, B1–B6), sourceChannel (text, one of the 7 B2B
  channels), tradeshowId (FK tradeshow, nullable), ownerUserId (FK user),
  notes (text), cardImageUrl, cardRawText, ocrConfidence (jsonb), companyId
  (FK company, nullable — set on conversion), customerId (FK customer,
  nullable — populated *only* when a Shopify order materializes), status
  (text default `'active'`), createdAt, updatedAt.
- [x] `tradeshow` table: id, name, location, startsOn, endsOn, channel
  (`'b2b_trade_shows_consumer'` | `'b2b_trade_shows_industry'`), createdAt.
- [x] `npm run db:generate` → `drizzle/migrations/0023_smart_firestar.sql`;
  reviewed; applied to oliver-dev via `npm run db:migrate`.
- [x] `npm install @anthropic-ai/sdk` (^0.100.1); `ANTHROPIC_API_KEY` added
  to `.env.example`. **Still TODO (human step):** add `ANTHROPIC_API_KEY`
  to Vercel production + preview before Phase 2 ships.
- [x] `src/lib/ai/anthropic.ts` — lazy-init client mirroring
  `src/lib/email/resend.ts`; exports `extractBusinessCard({imageBase64,
  mediaType})` which calls Claude Sonnet 4.5 vision via a forced
  `record_business_card` tool_use (strict JSON schema) and Zod-validates
  the result. Retries once on parse failure.
- [x] Unit tests in `src/lib/ai/anthropic.test.ts` (9 tests) covering Zod
  acceptance/rejection, happy path, retry-on-bad-input, retry-exhausted,
  and missing-tool_use-block. `npm run check` → 36 files / 331 tests
  passing.

### Phase 2: Lead + scan-card API ✅

- [x] `src/lib/crm/constants.ts` — `LEAD_STAGES`, `LEAD_SOURCE_CHANNELS`
  (7 channels), `LEAD_PERSONA_TAGS` (B1–B6), `LEAD_STATUSES`,
  `TRADESHOW_CHANNELS`. Server/client-safe (no db imports) so UI and API
  share one source of truth.
- [x] `src/lib/crm/service.ts` — Zod schemas (`createLeadSchema`,
  `updateLeadSchema`, `tradeshowSchema`) + CRUD (`createLead`,
  `updateLead`, `dropLead`, `getLead`, `listLeads`, `createTradeshow`,
  `listTradeshows`). `listLeads` defaults to `status='active'`;
  `createLead` refuses payloads with no identity (name/email/phone/company);
  search filter is case-insensitive across name/company/email.
- [x] `POST /api/leads/scan-card` — multipart, 10 MB cap, mime allowlist
  (jpeg/png/gif/webp). Uploads to Vercel Blob then calls
  `extractBusinessCard()`. Does **not** persist a lead. Surfaces 503 if
  either `BLOB_READ_WRITE_TOKEN` or `ANTHROPIC_API_KEY` is unset.
- [x] `POST /api/leads` — auth + role-gated, Zod-validated; defaults stage
  to `'prospect'` and owner to the capturing user.
- [x] `GET /api/leads` — filters via query string (stage, sourceChannel,
  tradeshowId, ownerUserId, status, search).
- [x] `GET /api/leads/[id]` (added — needed by the detail page in Phase 3)
  + `PATCH /api/leads/[id]` + `DELETE /api/leads/[id]` (soft-delete to
  `status='dropped'`, hard delete intentionally not exposed).
- [x] `GET /api/tradeshows` + `POST /api/tradeshows` — minimal CRUD.
- [x] Tests: 10 route-handler unit tests for scan-card (auth/mime/size/
  503/happy-path/error) mocking auth+Blob+Anthropic, plus 8 service-layer
  integration tests in `src/lib/crm/service.integration.test.ts`
  (self-skip without `TEST_DATABASE_URL`; will run against the team's
  test branch in CI). Full suite: 37 files / 341 tests passing.

### Phase 3: Admin list + detail UI ✅

- [x] `src/lib/crm/display.ts` — pure helpers: `stageLabel`,
  `stageBadgeClass`, `sourceChannelLabel`, `personaLabel`,
  `statusBadgeClass`, `leadDisplayName` (with full unit tests, 15 cases).
- [x] `/leads` page (server) — `PageHeader` + `DataTable`. Columns: name
  (link → detail), company, stage badge, source, captured. Filters
  (client component, query-string-backed): stage, source, tradeshow,
  status, search. "+ Add lead" button → `/leads/new`.
- [x] `/leads/new` page + client form for manual create. POST `/api/leads`;
  on success redirects to `/leads/[id]`.
- [x] `/leads/[id]` page (server) — fetches lead + tradeshows + companies.
  Renders `<LeadDetail>` client component: stage/status/persona badges at
  top, "Convert to company" picker + button, drop button (DELETE → soft-
  delete), DetailTabs (Overview: all editable fields + card-image preview
  via next/image; Notes: textarea + raw OCR text block when present).
- [x] Both pages call `await auth()` per the double-check convention.
- [x] Playwright spec at `e2e/tests/leads-flow.spec.ts` (first e2e in the
  repo): manual-create → change stage + persona → convert to company →
  verify on list view. **Self-skips without `E2E_SESSION_COOKIE`** — the
  team has no shared test-auth fixture yet. To run locally, sign in as
  admin, copy the `authjs.session-token` cookie, export it, then
  `npm run test:e2e`. Follow-up to land a fixture is captured below.
- [x] `npm run check` → 38 files / 356 tests passing.

**Phase 3 follow-ups (carry to a separate work plan):**
- Establish a Playwright auth fixture (test-only admin session cookie or a
  programmatic sign-in step) so e2e specs can run in CI without manual
  cookie setup. The leads-flow spec is ready to enable once this lands.

### Phase 4: Mobile capture flow ✅ (expanded scope per Oliver: three modes)

Expanded mid-Phase to a unified 3-mode capture page (photo / QR / manual)
per Oliver's ask. Active-tradeshow stickiness and live-status pill deferred
(see follow-ups) — current flow has the tradeshow selectable on the confirm
form via the existing dropdown.

- [x] `src/lib/crm/qr-parser.ts` + tests — pure parser for vCard 3.0/4.0,
  MeCard, mailto:, tel:, plain URL, naked email. Returns null on unknown
  payloads so the UI can surface "QR not recognized — type it in" rather
  than silently saving a blank. 14 unit tests.
- [x] `qr-scanner` (^1.4.2) dependency added — client-only, no external
  service; uses native `BarcodeDetector` when available.
- [x] `src/app/(admin)/leads/lead-form.tsx` — shared `<LeadForm>`
  refactored out of `<NewLeadForm>`. Accepts `initial`, `confidence`,
  `submitLabel`, `onSuccess`. Renders a per-field confidence dot
  (green ≥0.8 / amber 0.4–0.8 / red <0.4) only when `confidence` is
  provided.
- [x] `/leads/capture` page (server, auth + tradeshows fetch) + client
  state machine with three modes:
  - **Scan card** → hidden `<input type="file" capture="environment">` →
    `POST /api/leads/scan-card` → confirm form pre-filled with confidence
    rings + card image preview (collapsed into a `<details>` block).
  - **Scan QR** → `<QrScannerView>` (dynamic-imports `qr-scanner` so the
    library never lands in a server bundle) → first decode goes through
    `parseQrPayload` → confirm form pre-filled (no confidence rings).
  - **Type it in** → confirm form blank.
- [x] Error tolerant: scan failures return to mode picker with a banner;
  unrecognized QR payloads prompt user to try card or manual; capture
  flow never loses the user's input.
- [x] "Capture" CTA added to `/leads` header alongside the existing
  "+ Add lead" outline button.
- [x] `npm run check` → 39 files / 370 tests passing.

**Phase 4 follow-ups (defer until real tradeshow use):**
- Active-tradeshow stickiness (localStorage + per-user preference) so the
  capture flow can tag without an extra dropdown pick — needs real flow
  data to decide whether this is worth the migration.
- Save → "Saved. Capture another?" toast + auto-loop back to mode picker
  (currently goes to the lead detail page, which is fine for low-volume
  use but not for a hot show floor).
- Voice notes via Whisper (deferred at v1 scope).
- Playwright spec for the capture flow itself (blocked on the same auth
  fixture as the Phase 3 spec).

### Phase 5: Nav + docs ✅

- [x] Added `Leads` as the first child under the **Customers** group in
  `src/components/layout/admin-sidebar.tsx` (line 56).
- [x] `specs/current/routes.md` — admin section adds `/leads`, `/leads/new`,
  `/leads/capture`, `/leads/[id]`; new "CRM API" block documents `GET/POST
  /api/leads`, `GET/PATCH/DELETE /api/leads/[id]`, `POST
  /api/leads/scan-card`, and `GET/POST /api/tradeshows`.
- [x] `specs/current/components.md` — new "CRM / Leads" section documents
  the six new client components and notes the sidebar change.
- [x] `specs/current/schema.md` — new "CRM (leads + tradeshows)" section
  documents both tables, indexes, FK conversion semantics (no synthetic
  customer rows), and the scan-card pipeline.
- [x] `specs/strategy/b2b-pipeline.md` — new "Tooling" section above the
  anti-patterns describes the three capture modes and reinforces the
  prospect-default rule.
- [x] Work plan moved `todo/ → completed/`; entry added to
  `specs/ops/releases.yaml`.

## Notes

- **Migration order to prod**: per AGENTS.md, apply the new migration to
  prod via `npm run db:migrate:prod` **before** pushing the code that uses
  the new tables. Vercel deploys instantly on push.
- **No Anthropic SDK precedent exists** in the repo today — this work plan
  establishes the pattern. Future AI features should reuse
  `src/lib/ai/anthropic.ts`.
- **Stage transitions write no log yet** — when `leadActivity` is added in
  v2, backfilling stage-change history is impossible without it, so the
  earliest signals (sample-shipped dates, follow-up cadence) will be lost
  from the v1 window. Accepting that trade-off because the alternative is
  building activity infrastructure before we know what shape it needs.
- **Tradeshow seed data**: pre-populate with the four shows named in
  `personas.md` (WindUp, EPHJ, Watches & Wonders B2B, Hong Kong Watch &
  Clock Fair) plus any others Oliver/Tom know are upcoming.
- **`/leads/capture` is not a PWA** in v1 — bookmark on iPhone home screen
  is enough. Real PWA + offline queue waits until a show actually burns us
  on flaky wifi.
