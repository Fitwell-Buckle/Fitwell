# Grapevine Survey Integration

> **Status (2026-06-06):** Phases 1–3 shipped to production. Live state:
>
> - **Phase 1** — webhook live at `/api/webhooks/grapevine`; Shopify Flow
>   workflow on; smoke-tested via curl + verified DB write.
> - **Phase 2** — 258 historical survey responses backfilled from CSV to
>   prod. 178 linked to orders; 80 orphan (pre-Shopify-sync orders).
> - **Phase 3** — `/admin/attribution/survey` view live; `commitAttribution`
>   merge function (survey-first, UTM fallback); `link_method='self_report'`
>   backfilled to 169 prod orders; `attribution.md` updated.
>
> **Still pending:**
>
> - **Phase 4** (this file, §Phase 4 below) — aggregate dashboard,
>   "Other" free-text normalization via Claude API. Not blocking; nice
>   to have once live workflow has accumulated post-Phase-2 data.
> - **Grapevine UI cleanup** (§"Grapevine-side cleanup" below) — Tom to
>   merge `WatchChris` / `Watch Chris` duplicate options in Grapevine
>   Admin so future responses don't split the same creator across two
>   buckets. Pure config, no engineering.
> - **UTM linking gap** — filed separately at
>   [[utm-linking-gap]]. Once that's fixed, Phase 3 can grow the
>   `(platform_hint + utm) → committed funnel.md channel` refinement
>   noted in `attribution.md`.
>
> Don't move this file to `completed/` until Phase 4 ships AND the
> Grapevine UI cleanup is confirmed done.

## Context

Fitwell runs **Grapevine Surveys** (Shopify post-purchase survey app,
grapevine-surveys.com) on the storefront. The survey asks a single
"how did you hear about us?" question with multiple-choice options
plus an "Other" free-text bucket. Responses currently live only in
Grapevine's dashboard — they are not in our DB, not joined to
orders, not in any dashboard, and not part of the attribution
engine.

Connecting this data unlocks three things:

1. **Per-order self-reported attribution** — the customer literally
   tells us their introducer channel. For orders with a response,
   this is higher-confidence than the first-touch UTM guess we make
   today (`specs/invariants/attribution.md` Capture Rule 4).
2. **Aggregate channel mix** — extrapolate the channel distribution
   across all orders (with response-rate disclosure). Directly
   attacks the PRIORITIES.md "Catalog of Unknowns" entry *"how is
   Google traffic actually finding us — branded search post-ad,
   organic, referral, post-creator?"*
3. **UTM-vs-survey delta as a compound-path signal** — when UTM
   claims `branded_search_organic` but the customer says "Instagram",
   that delta *is* the compound-path evidence the funnel doc asks
   for in its open question *"What share of `branded_search_organic`
   is `post_creator_branded_search` in disguise?"*
   (`specs/strategy/funnel.md` Open Questions).

The survey is one question for now; the schema is designed
multi-question-ready so we can layer a second "what made you decide
to buy" question later without a migration if we want a closer
signal too.

Reference:
[[../../current/integrations.md]],
[[../../current/scheduled-jobs.md]],
[[../../current/schema.md]],
[[../../invariants/attribution.md]],
[[../../strategy/funnel.md]],
[[../../ops/PRIORITIES.md]].

## Dependencies

- Grapevine account access (Tom).
- Shopify Flow access to configure the trigger (Tom, via Shopify
  Admin).
- Env var: `GRAPEVINE_WEBHOOK_SECRET` (Vercel production + each dev
  `.env.local`) — shared secret sent as a header from Shopify Flow's
  HTTP request action so we can verify inbound webhook authenticity.
- One Drizzle migration adding `attribution_survey_response` (single
  new table; no edits to existing tables in Phase 1).
- Greg sign-off (Critical Rule 5) before Phase 1 starts.

## Scope

### Included

- Webhook endpoint receiving Grapevine "Response Completed" events
  via Shopify Flow → HTTP request action.
- `attribution_survey_response` table (one row per response, designed
  multi-row-per-order safe for future questions).
- Answer-to-channel mapping module that translates Grapevine
  multiple-choice labels into canonical channel IDs from
  `specs/strategy/funnel.md`.
- Historical backfill — exact path depends on whether Grapevine is
  configured to tag orders (decision deferred to start of Phase 2).
- Aggregate channel-mix admin view + extrapolation logic.
- Attribution-engine integration: `self_report` as a third
  `link_method` alongside `pixel` and `email_match`.

### Explicitly Out

- Multi-question survey UI in Grapevine — adding new questions is a
  Grapevine-side config change, not engineering work, deferred until
  the one-question data has informed whether a closer-side question
  is worth asking.
- Klaviyo flow targeting based on response — adjacent to
  [[klaviyo-integration]] which has its own gating and would consume
  this table once both ship.
- B2B / wholesale order survey responses — Grapevine runs on the
  D2C storefront only; B2B uses `specs/strategy/b2b-pipeline.md`
  CRM flow.
- Survey response editing / deletion UI in admin — read-only for
  now; corrections happen in Grapevine if needed.

## Architecture

```
Customer submits Grapevine survey on Shopify thank-you page
  │
  ▼
Grapevine "Response Completed" event
  │
  ▼
Shopify Flow trigger (configured in Shopify Admin)
  │
  ▼
Flow action: Send HTTP request → POST admin.fitwellbuckle.co/api/integrations/grapevine/webhook
  - Header: x-grapevine-secret: <GRAPEVINE_WEBHOOK_SECRET>
  - Body: JSON with surveycode, customerid, customeremail, orderid, ordername,
          responsedate, plus answer fields exposed via Flow trigger variables
  │
  ▼
Our webhook handler:
  1. Verify x-grapevine-secret matches env
  2. Validate payload with Zod
  3. Resolve order by shopifyId → order.id (FK target)
  4. Upsert attribution_survey_response keyed on (provider_response_id)
  5. Run answer → channel_hint mapping; persist
  6. Return 200 quickly (Flow retries on non-2xx)
```

### Schema (Phase 1)

```ts
// src/lib/schema.ts (new table; place near utm_attribution at L216)
export const attributionSurveyResponse = pgTable(
  "attribution_survey_response",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Idempotency key from Grapevine — same response delivered twice = same row
    providerResponseId: text("provider_response_id").notNull().unique(),
    provider: text("provider").notNull().default("grapevine"),
    surveyCode: text("survey_code"),
    surveyName: text("survey_name"),
    // FK into existing order table (Critical Rule 6 — reuse, don't parallel)
    orderId: text("order_id").references(() => order.id),
    // Fallback identifiers when order resolution fails (timing race, email-only response)
    shopifyOrderId: text("shopify_order_id"),
    customerEmail: text("customer_email"),
    // Question identifier — designed for the multi-question future even though we're
    // currently single-question. Default 'where_first_heard' for the current survey.
    questionKey: text("question_key").notNull(),
    // The chosen multiple-choice label exactly as Grapevine sent it
    rawAnswer: text("raw_answer"),
    // True when respondent picked "Other" and provided free-text
    isOtherText: boolean("is_other_text").default(false),
    // Mapped to canonical channel ID from specs/strategy/funnel.md.
    // Nullable: "Other" free-text rows stay null until normalized in Phase 4.
    channelHint: text("channel_hint"),
    respondedAt: timestamp("responded_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("asr_provider_response_id_idx").on(t.providerResponseId),
    index("asr_order_id_idx").on(t.orderId),
    index("asr_shopify_order_id_idx").on(t.shopifyOrderId),
    index("asr_channel_hint_idx").on(t.channelHint),
    index("asr_responded_at_idx").on(t.respondedAt),
  ],
);
```

Note on `order.linkMethod` — already declared as `text` at
`src/lib/schema.ts:183`. The current comment lists `'pixel' |
'email_match' | null`. Phase 3 expands this to include
`'self_report'`. **Comment-only change** to the schema field;
`specs/invariants/attribution.md` Capture Rule 4 is the source of
truth and is updated in the same Phase 3 PR.

### Survey metadata (live as of 2026-06-05)

- Survey name: **Post purchase survey**
- Survey Code: `698cc69eca3e5`
- Question Code: `698cc7deb2467`
- Question type: Single choice
- Question text: *"Where did you first discover Fitwell?"*
- Surfaces: `Checkout app block` (thank-you page), `POS: Fitwell South`, `POS: Fitwell North`
- 30-day baseline (verified in Grapevine dashboard): 53 responses on
  159 unique impressions = **33.33% response rate**, 100% completion
  (single-question survey)

### Channel-mix snapshot (last 30d, 2026-06-05)

This is the first data point for the
[[../../strategy/funnel.md]] *"how is Google traffic actually finding
us"* open question, captured *before* any engineering work:

| Self-reported introducer | Responses | Share |
|---|---|---|
| Social Media: Instagram | 19 | 35.85% |
| Social Media: TikTok | 7 | 13.21% |
| Social Media: Facebook | 5 | 9.43% |
| Search Engine: Google | 4 | 7.55% |
| YouTube Video: WatchChris (+ "Watch Chris" duplicate) | 3 + 1 | 7.55% |
| Other | 3 | 5.66% |
| Watch Forum: WatchUSeek | 2 | 3.77% |
| YouTube Video: Fitwell YouTube Video | 2 | 3.77% |
| Single-response options | 1 each | 1.89% × 7 |

Headline: **Meta-family (IG + FB + TikTok) = ~58% of self-reported
introduction.** Google as self-reported introducer is only ~7.55% —
much lower than its share of converting traffic, which is the
post-creator-branded-search compound path showing up directly. This
is the kind of finding the Phase 3 UTM-vs-survey delta report will
quantify across the whole order base.

### Answer mapping

`src/lib/grapevine/channel-mapping.ts` — a single function:

```ts
// Maps Grapevine multiple-choice labels to canonical channel IDs
// from specs/strategy/funnel.md Channel Entry Points.
// Unknown labels return null (kept as raw text; surfaced for review).
export function mapAnswerToChannel(rawAnswer: string): ChannelId | null
```

Complete mapping for current Grapevine answer set:

| Grapevine label | Canonical channel ID | Notes |
|---|---|---|
| Social Media: Instagram | `organic_meta` | UTM context refines to `paid_meta_cold` when ad UTMs present |
| Social Media: TikTok | `organic_tiktok` | UTM context could refine to `paid_tiktok` once that channel exists |
| Social Media: Facebook | `organic_meta` | Same parent as IG per funnel.md |
| Social Media: X (formerly Twitter) | `organic_social_other` | **No entry in funnel.md** — see "funnel.md gaps" below |
| Search Engine: Google | `branded_search_organic` | UTM/landing-site context refines to `category_search_organic` or `paid_search_branded` |
| Search Engine: DuckDuckGo | `organic_search_other` | **No entry in funnel.md** |
| YouTube Video: WatchChris | `creator_partnerships` | Specific creator — also store creator name in `channelDetail` for per-creator rollup |
| YouTube Video: Watch Chris | `creator_partnerships` | **Duplicate of WatchChris** — Grapevine UI cleanup needed (merge options) |
| YouTube Video: Watch bros | `creator_partnerships` | |
| YouTube Video: Don't remember | `creator_partnerships` | High-value signal — captures creator touches the customer can't name |
| YouTube Video: Fitwell YouTube Video | `organic_youtube_shorts` | Our own content — *not* a creator partnership |
| Watch Forum: WatchUSeek | `forum_reddit_organic` | Funnel.md lumps watch forums under this ID |
| Watch Forum: Reddit | `forum_reddit_organic` | |
| Watch Forum: Korea Watch Community (와치홀릭) | `forum_other` | **No entry in funnel.md** — international forum |
| A Friend or Family Member | `in_person_sighting` | Validates this channel at low volume |
| Other | `null` | Free-text bucket, normalized in Phase 4 |

When the UTM context could refine the mapping (Instagram organic vs.
paid, branded vs. category Google search), we keep `channelHint` at
the survey's coarser bucket and let the attribution engine merge
`channelHint` with the order's stored UTM to make the finer call.

### Creator-level detail capture

The survey already captures *which creator* (WatchChris, Watch bros,
Fitwell's own YouTube) and *which forum* (WatchUSeek, Reddit, KWC) —
finer than `funnel.md`. To preserve this without polluting the
`channelHint` enum, add a sibling column `channelDetail` (text,
nullable) for the specific creator/forum identifier. Then Phase 4
dashboards can group by creator without us having to build any of
the creator-tracking infrastructure in
[[creator-program]] up front.

### funnel.md gaps to address (separate doc PR, not blocking)

Three answer options don't have a clean home in
[[../../strategy/funnel.md]]:

- **Social Media: X (Twitter)** — no entry exists.
- **Search Engine: DuckDuckGo** — only Google-coded variants exist.
- **Watch Forum: Korea Watch Community** — international; `forum_reddit_organic` is closest but inaccurate.

**Don't add these to funnel.md yet.** They're 1 response each at
this volume. Map them in Phase 1 as `organic_social_other`,
`organic_search_other`, and `forum_other` respectively. Promote to
first-class channels in funnel.md only if volume warrants.

### Grapevine-side cleanup (config, not code)

- [ ] Merge "YouTube Video: WatchChris" and "YouTube Video: Watch
      Chris" into a single option in Grapevine before Phase 1 ingests
      — otherwise the typo's split persists in our data permanently.
- [ ] Sanity-check: is "Fitwell YouTube Video" the right label for
      our own channel, or should it be `organic_owned_youtube` to
      distinguish from creator-partner YouTube?

## Implementation Phases

### Phase 1: Live ingestion

- [ ] Add `GRAPEVINE_WEBHOOK_SECRET` to `.env.example` and Vercel
      (production + each dev environment).
- [ ] Migration: add `attribution_survey_response` table per schema
      above (`npm run db:generate`; review SQL; `npm run db:migrate`).
- [ ] `POST /api/integrations/grapevine/webhook` route:
  - Verify `x-grapevine-secret` header against env (constant-time
    compare).
  - Zod-validate payload.
  - Resolve `order.id` from `shopifyOrderId`; persist
    `shopifyOrderId` even when resolution fails (handles timing
    race where survey response arrives before Shopify webhook does).
  - Upsert by `providerResponseId`.
  - Apply `mapAnswerToChannel`; store result.
- [ ] Configure Shopify Flow in Shopify Admin: trigger =
      Grapevine "Response Completed"; action = Send HTTP request to
      the new endpoint with the shared secret header.
- [ ] Tests:
  - Webhook signature validation (right secret, wrong secret, missing
    header).
  - Zod rejection of malformed payloads.
  - Idempotent re-delivery (same `providerResponseId` twice = one
    row).
  - Order-resolution race: response received before order sync;
    later sync still joinable.
  - Unknown answer → `channelHint = null`, row still persists.
- [ ] Update `specs/current/integrations.md` and
      `specs/current/scheduled-jobs.md` (no new cron — Phase 1 is
      webhook-driven; Phase 2 may add a backfill script).

### Phase 2: Historical backfill (CSV import)

Decision locked 2026-06-05: **Path B (CSV)**. Grapevine's app-level
Settings has no order-tag configuration (verified in screenshot),
and the Integrations panel shows no tag-pusher integration enabled.
Even if a per-answer tag-action exists in the survey editor, it's
not configured today, so there are no historical tags to scrape. We
go straight to CSV.

- [ ] Export full response history from Grapevine via **Downloads**
      tab in the Grapevine app sidebar. Confirm the CSV includes
      `order_id`, `customer_email`, `responded_at`, the question
      identifier, and the chosen answer.
- [ ] Write `scripts/grapevine-backfill-from-csv.ts` that ingests
      the CSV with the same row shape as the webhook handler:
      synthesize `provider_response_id` as
      `csv-backfill:<order_shopify_id>:<question_code>` to maintain
      the idempotency invariant if the same CSV is re-imported.
- [ ] Run against dev branch first; verify row counts and a few
      spot-checks match the Grapevine dashboard; run against prod.
- [ ] Update PRIORITIES.md / scorecards with first-cut channel-mix
      numbers once data is in. The 30-day baseline already captured
      in the "Channel-mix snapshot" section above is the headline;
      full history likely strengthens (not weakens) it given the
      33% response rate.

**Future consideration (not blocking):** per-answer Shopify order
tagging is a Grapevine config option that could be enabled later if
useful for surfacing survey responses in Shopify Order Admin
at-a-glance. It's not needed for the data pipeline — the webhook
delivers the same payload structurally — so this is a UX decision,
not an attribution one.

### Phase 3: Attribution-engine integration

- [ ] `specs/invariants/attribution.md` Capture Rule 4: add
      `link_method = 'self_report'` as the **first** priority before
      `pixel` and `email_match`. Update the rule prose; bump the
      "Last updated" date.
- [ ] Update the comment on `order.linkMethod` in
      `src/lib/schema.ts:183` to reflect the three values.
- [ ] Logic update in the order ↔ attribution linker: when an
      `attribution_survey_response` exists for an order, set
      `order.linkMethod = 'self_report'` and treat the response's
      `channelHint` as authoritative first-touch.
- [ ] Add a UTM-vs-survey delta report
      (`/admin/attribution/utm-vs-survey`): rows = orders with both
      UTM and survey response; columns = UTM channel, survey
      channel, count, last 30d trend. This is the artifact that
      answers the funnel.md `post_creator_branded_search` open
      question.
- [ ] Update `specs/strategy/funnel.md` Open Questions table — mark
      the `branded_search_organic` question as "instrumented; see
      utm-vs-survey report."

### Phase 4: Aggregate dashboard + "Other" normalization

- [ ] Admin view `/admin/attribution/grapevine`:
  - Response rate (responses / total orders, by month).
  - Channel mix across responders (donut + table).
  - Extrapolated channel mix across all orders (with confidence
    flag based on response rate).
  - Per-persona overlay if/when persona tagging on orders lands
    (out of scope for this plan; placeholder column).
- [ ] "Other" normalization job — nightly or on-write Claude API
      call that buckets free-text into the canonical channel set.
      Persist the normalized bucket in `channelHint`; keep the
      `rawAnswer` for audit.
- [ ] Tests for extrapolation math; tests for the normalization
      mapper (golden set of free-text inputs → expected channel).
- [ ] Update `specs/current/components.md` with the new view; update
      `specs/current/routes.md` with the new route.

## Notes

- **Question expansion is config, not code.** Once the one-question
  data is in, if we want to add "What made you decide to buy?"
  (closer signal), it's a Grapevine UI change plus a new
  `question_key` value. The schema and webhook already support
  multiple rows per order.
- **Order-resolution race.** Grapevine fires when the customer
  submits on the thank-you page, which can briefly precede our own
  Shopify order webhook. Handler must persist the
  `shopifyOrderId` even when `order.id` is null at write time; a
  nightly resolver pass (or a hook on Shopify order create) backfills
  `orderId` when the order lands.
- **Why `self_report` outranks `pixel`.** Pixel-stitched first-touch
  is our best *inference* of where the customer came from. The
  survey is the customer telling us directly. Where they disagree,
  the customer is usually right about awareness, and the pixel is
  right about the *last* pre-purchase touch — which is why the
  delta itself is a high-value signal worth its own report (Phase
  3).
- **Free-text bias.** "Other" responses are higher-quality data
  than the multiple-choice for any channel we forgot to list. Tom
  should review the first ~20 "Other" responses before the Phase 4
  normalizer ships to check whether any answer is common enough to
  promote into the Grapevine multiple-choice options (config, not
  code).
- **Response-rate disclosure.** Any aggregate dashboard must show
  the response rate alongside the channel mix — extrapolating a
  channel split from a non-representative sample is the obvious
  failure mode. If response rate is low (<20%), flag the
  extrapolation as low-confidence.
- **Privacy / PII.** `customer_email` is duplicated on the survey
  row to support late-arriving orders; no new PII category beyond
  what we already store on `customer` and `utm_attribution`.

## Open Questions

| Question | Why it matters | Resolution path |
|---|---|---|
| Does Grapevine currently write Shopify order tags? | Determines Phase 2 path | **Resolved 2026-06-05: No.** Path B (CSV) locked. |
| What are the exact current multiple-choice options? | Drives the `mapAnswerToChannel` table | **Resolved 2026-06-05.** See "Answer mapping" section above. |
| What's the current response rate? | Determines extrapolation confidence | **Resolved 2026-06-05: 33.33% over last 30d.** Strong baseline. |
| Should "Other" be aggressively bucketed or kept verbose? | Trade-off between channel-mix clarity and surfacing genuinely new channels | After Tom reviews first ~20 Other rows |
| Multi-question expansion: add closer question now or wait? | Closer signal would attack a different open question in funnel.md | Defer until Phase 1 data informs |
