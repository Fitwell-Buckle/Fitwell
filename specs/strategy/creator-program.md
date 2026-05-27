# Creator Management System

## Context

Fitwell sends product samples to watch/EDC creators on Instagram, YouTube, and TikTok in hopes they post about us and send back edited content we can re-use in paid social. Today this is tracked in spreadsheets and DMs — which means:

- Stats drift constantly (creator follower counts, engagement)
- Follow-ups get missed; ghosters get re-contacted months later
- Sample shipments aren't linked to outreach (no idea who got what)
- Posts that happen go uncounted unless someone manually spots them
- Edited deliverables sit in random Drive folders with no rights tracking
- Attribution to revenue is invisible (we use discount codes but never tie them back to creator)

We've already validated the data side: a research pass produced `Fitwell_Creators_CrossPlatform.csv` with 735 unique creators, 104 multi-platform (IG+YT), full bio/stats/engagement/email coverage. That dataset is the seed import for this system.

References:
- `specs/strategy/creator-scoring.md` — formulas for `watch_score`, `fit_score`, `cross_platform_fit`, and `mentioned_us` detection. Phase 1's import script and Phase 6's stats refresh cron both depend on this.
- `specs/current/integrations.md` — Shopify and platform API patterns
- `specs/current/contributing.md` — admin section conventions, schema rules
- `specs/current/schema.md` — existing `customer`, `order`, `order_line_item`, `campaign` tables (reuse, don't duplicate)
- `AGENTS.md` §3 rule 4 — this plan requires Greg sign-off before Phase 1 begins (new tables + new external integration)

## Greg decisions required before Phase 1

These need explicit alignment before we start writing schema:

1. **Asset storage**: S3 bucket vs. Vercel Blob vs. just storing Drive/Dropbox URLs as pointers (recommendation: pointers for MVP, S3 later if rights enforcement becomes real)
2. **IG stats refresh path**: use Apify (~$1–2/month at expected volume) for nightly bulk profile pulls. No Meta app review needed — feed posts are what matter as the creator deliverable, and Apify catches those reliably. Stories not in scope (Tom gets phone notifications directly on @fitwellbuckle).
3. **TikTok scope**: manual entry only for v1, or do we apply for TikTok Research API now (slow approval)?
4. **Outreach mailbox**: do we send DMs/emails from this app (needs Resend domain + Gmail OAuth) or just log responses to outbound sent elsewhere? Recommend: log-only for v1.
5. **Discount code generation**: auto-create unique Shopify codes per creator from this app (needs Shopify Admin write scope) or manually create + log? Recommend: auto-create.
6. **Asset rights model**: do we enforce usage windows in the UI (e.g., flag when a 30-day paid social window expires), or just record the terms as free-text?

## Dependencies

- NeonDB schema migration capability (existing)
- Shopify Admin API with **write** scope for discount codes (currently read-only — needs scope upgrade)
- YouTube Data API v3 key (have one, needs rotation + env storage; current quota 10K units/day is sufficient for ~500 tracked creators)
- Apify account (existing; $5 free credit covers 6+ months at expected refresh cadence)
- Resend domain (existing for transactional email) — only if Greg decision 4 = "send from app"
- Cron infrastructure (existing `vercel.json` cron config)
- NextAuth session (existing, used to gate admin routes)

## Scope

### Included
- Creator database with per-platform stats and refresh history
- Outreach pipeline (status, log, follow-up reminders, burned list)
- Sample shipment tracking linked to Shopify $0 orders
- Discount code creation + redemption tracking
- Auto-detected platform posts (YouTube polling + IG polling via Apify on a scheduled cron)
- Manual asset capture (edited deliverables) with rights metadata
- Per-creator dashboard view (timeline of all interactions)
- Bulk CSV import for the existing 735-creator dataset
- Stats refresh job (nightly per-platform) so follower/engagement data doesn't go stale

### Excluded (defer to later phase or never)
- Sending outreach from within the app (DMs, emails) — log responses only
- AI-generated outreach copy
- TikTok auto-detection (Research API blocked) — manual post entry only
- Influencer payment processing (Stripe Connect or similar) — discount codes are the only attribution v1
- IG real-time webhooks (Stories, Mentions) — Tom monitors @fitwellbuckle notifications on his phone directly; the creator deliverable is the feed post, which polling catches
- Meta Graph API integration — no app review needed; Apify covers the IG bulk-stats refresh use case
- Carrier delivery confirmation via UPS/USPS APIs — manual "mark delivered" toggle for v1
- Public-facing creator portal (creator self-serve)
- Multi-brand support — this is Fitwell-only

## Implementation Phases

### Phase 1: Schema & Data Import

Define and migrate the core tables, import the existing research CSV.

- [ ] Add tables to `src/lib/schema.ts`:
  - `creator` — id, primary_name, primary_platform, fit_score, watch_score, notes, status (active/burned/archived), burned_until_date, created_at, updated_at
  - `creator_platform` — creator_id FK, platform (ig/yt/tt), handle, profile_url, is_business_account, is_verified, external_url, bio, last_refreshed_at — unique on (platform, handle)
  - `creator_stats_daily` — creator_platform_id FK, snapshot_date, followers, engagement_rate_pct, avg_likes, avg_comments, last_post_date, posts_in_window
  - `creator_email` — creator_id FK, email, kind (business/personal/manager), source (ig/yt/manual), verified_at — for multi-email creators (manager + creator addresses)
  - `outreach_thread` — creator_id FK, channel (email/ig_dm/yt_comment/manager), status (no_reply/replied/negotiating/committed/declined/ghosted/burned), terms, first_contact_at, last_contact_at, next_followup_at
  - `outreach_event` — outreach_thread_id FK, occurred_at, direction (in/out), summary, body (text, optional)
  - `sample_shipment` — creator_id FK, shopify_order_id FK (nullable for legacy), tag, shipped_at, delivered_at (nullable, manual), tracking_number, carrier, returned (bool), notes
  - `creator_post` — creator_platform_id FK, sample_shipment_id (nullable), post_url, posted_at, caption, likes, comments, views, mentioned_us (bool), used_code (bool), detected_at, source (api_poll/webhook/manual)
  - `creator_asset` — creator_id FK, sample_shipment_id (nullable), received_at, storage_url, asset_type (raw/edited/both), rights_tier (organic_only/paid_30d/paid_90d/perpetual), rights_expires_at (computed), usage_notes, uploaded_by
  - `discount_code` — creator_id FK, code, shopify_price_rule_id, percent_off, uses_count, attributed_revenue_cents, created_at, expires_at (nullable)
- [ ] Generate migration (`npm run db:generate`) and review
- [ ] Apply to dev DB (`npm run db:migrate`)
- [ ] Build `scripts/import-creators-csv.ts` that reads `Fitwell_Creators_CrossPlatform.csv` and populates `creator`, `creator_platform`, `creator_stats_daily` (initial snapshot), `creator_email`. Run idempotently (dedup on platform+handle).
- [ ] Update `specs/current/schema.md` with the new tables

#### Tests
- Unit: unique constraint on (platform, handle); FK cascade behavior for creator→creator_platform→creator_stats_daily
- Unit: import script idempotency (run twice → same row counts)
- Integration: import full CSV → verify ~735 creator rows, ~840 platform rows (104 multi-platform × 2 + 631 single-platform × 1)

### Phase 2: Admin UI — Read Views

Make the imported data browsable in the admin app.

- [ ] Route `/admin/creators` — list view with sortable table:
  - Columns: name, primary platform, total followers, ER%, fit score, last post date, outreach status, has email
  - Filters: platform (IG/YT/TT/multi), follower band, fit score range, has email, outreach status, watch score band
  - Default sort: cross_platform_fit DESC
  - Server component with URL-based filter state (deep-linkable)
- [ ] Route `/admin/creators/[id]` — detail view:
  - Header: name, primary handle, platforms, total reach
  - Stats panel per platform: followers, ER%, last post, days since post, post cadence
  - Outreach timeline (Phase 3 will populate)
  - Sample shipment list (Phase 4 will populate)
  - Posts feed (Phase 5 will populate)
  - Assets list (Phase 6 will populate)
  - Notes field (editable)
- [ ] Add to admin nav (`src/components/nav/`)
- [ ] Update `specs/current/routes.md` and `specs/current/components.md`

#### Tests
- Unit: filter URL params → SQL query construction
- Integration: list view renders, filters narrow results correctly
- Playwright: load list, click into a creator, verify detail page renders

### Phase 3: Outreach Pipeline

Track who's been contacted, where the thread stands, when to follow up.

- [ ] CRUD UI for outreach_thread on creator detail page:
  - Inline form: channel, status, terms, free-text note → creates outreach_thread + initial outreach_event
  - Status transitions logged as new outreach_event rows
  - Followup date auto-set when status changes (no_reply → +7d, replied → +3d, etc. — table of rules)
- [ ] Route `/admin/creators/followups` — dashboard view of all threads with `next_followup_at <= today`, sorted by oldest first
- [ ] Burned list logic: when status set to `burned` or `ghosted`, set `creator.burned_until_date = today + 12 months`. Hide burned creators from default list view (toggle to show).
- [ ] Auto-burn rule: cron checks for threads with status `no_reply` AND `last_contact_at < 60 days ago` → auto-burn with note
- [ ] Update `specs/current/scheduled-jobs.md` with the burn-check cron

#### Tests
- Unit: status transition → next_followup_at calculation
- Unit: burn logic correctly filters list view
- Integration: full thread lifecycle (created → status changes → burned)
- Playwright: log an outreach, change status, verify followup date appears in dashboard

### Phase 4: Shopify Sample Integration

Wire $0 Shopify orders tagged `sample` to creator records, plus discount code creation/tracking.

- [ ] Extend Shopify webhook handler (`src/app/api/webhooks/shopify/route.ts`) to detect `sample` tag on incoming `orders/create` and `orders/updated`:
  - Look for creator handle in order note or `creator_handle` metafield
  - Upsert `sample_shipment` row linked to creator + shopify_order
  - Set `shipped_at` when `fulfillment_status` becomes `fulfilled`
- [ ] Backfill script `scripts/backfill-sample-shipments.ts` — scan existing orders with `sample` tag, populate sample_shipment table
- [ ] Add "Send sample" action on creator detail page:
  - Form: collect mailing address (or use existing customer record)
  - Creates Shopify draft order with $0 line item + `sample` tag + creator_handle metafield
  - Links to creator
  - Address is stored on the Shopify order, not duplicated locally
- [ ] Add "Mark delivered" toggle (manual MVP — no carrier API integration)
- [ ] **Discount code generation** (requires Shopify Admin write scope, see Dependencies):
  - "Generate code" action on creator detail page → POST to Shopify Admin API to create price rule + discount code
  - Default: 15% off, single-use-per-customer, no expiry
  - Store code in `discount_code` table linked to creator
- [ ] Shopify webhook for `orders/create` → check if any line item used a tracked discount code → increment `discount_code.uses_count`, sum into `attributed_revenue_cents`
- [ ] Update `specs/current/integrations.md` with sample tag convention

#### Tests
- Unit: tag detection in webhook payload
- Unit: handle extraction from order note (various formats)
- Integration: webhook simulation creates sample_shipment + links to creator
- Integration: discount code creation against Shopify dev store (skip in CI)

### Phase 5: Post Detection

Auto-detect when tracked creators post — link to sample shipments when timing matches.

- [ ] YouTube polling cron (nightly at 04:00 UTC, add to `vercel.json`):
  - For each creator with a YT platform record: pull last 5 video titles + descriptions via Data API
  - Compare against `creator_post` table — insert new ones
  - Set `mentioned_us = true` if "fitwell" or "@fitwellbuckle" appears in title/description
  - Look up sample_shipment for creator with `delivered_at` within last 30 days → link via `sample_shipment_id`
- [ ] IG polling cron (every 6h, add to `vercel.json`):
  - For each creator with an IG platform record and an active outreach thread (status in negotiating/committed) OR a sample_shipment within last 60 days: trigger Apify run for that creator's recent posts
  - Insert new posts not already in `creator_post`
  - Same `mentioned_us` detection and sample_shipment matching logic
  - Throttle: max 50 creators per 6h cycle to keep Apify cost predictable
- [ ] Manual post entry form on creator detail page (for TikTok or anything missed)
- [ ] Backfill: scan existing IG dataset's `latestPosts` for any "fitwell" mentions → insert as `creator_post` with `source = backfill`
- [ ] Update `specs/current/scheduled-jobs.md`

#### Tests
- Unit: post deduplication by post_url
- Unit: sample_shipment matching by date + creator
- Unit: mention detection (`fitwell` case-insensitive, with/without @)
- Integration: simulated webhook → creator_post created and linked

### Phase 6: Asset Capture, Stats Refresh, Polish

Close the loop on edited deliverables and keep platform stats fresh.

- [ ] Asset upload form on creator detail page:
  - Inputs: storage URL (paste Drive/Dropbox link), asset_type, rights_tier, usage_notes, optional sample_shipment link
  - `rights_expires_at` auto-computed from rights_tier
  - List view shows all assets per creator with rights status (active / expiring-soon / expired)
- [ ] Daily stats refresh cron (06:00 UTC, add to `vercel.json`):
  - For each `creator_platform` row, refresh followers + ER + last_post_date via platform API
  - Insert new `creator_stats_daily` snapshot
  - Update `creator_platform.last_refreshed_at`
  - Rate-limit aware (YT: batch 50 channels per call; IG: throttle if using free endpoint, no limit if using Apify or Graph API)
- [ ] Stats chart on creator detail (last 90 days of followers + ER)
- [ ] "Rights expiring soon" dashboard widget (anything within 14 days)
- [ ] Final QA pass:
  - Manual end-to-end test: create creator → log outreach → send sample → detect post → upload asset → verify timeline shows all events
  - Update `specs/current/routes.md` and `specs/current/components.md` with all new components
  - Make sure all new routes appear in the docs site (`/docs`)

#### Tests
- Unit: rights_expires_at computation per tier
- Unit: stats snapshot diffing (only insert if values changed)
- Integration: full creator lifecycle from import → posted → asset received
- Playwright: e2e flow on the detail page

## Notes

### Open questions
- Do we want a "creator score change" alert when followers drop >20% (signals account in decline / not worth pursuing)?
- Manager/agency tracking: at what scale do we need a separate `creator_contact` table for agents vs treating it as a "manager" email kind?
- Should we surface "creators of creators followed by other creators" as a discovery loop, or is that scope creep?

### Risks
- **Shopify discount code race condition**: if multiple orders use the same code simultaneously the uses_count may undercount briefly. Mitigation: webhook is eventually consistent; we'll do a nightly reconcile against Shopify's price_rule.usage_count.
- **YouTube quota**: 10K units/day default. 500 channels × 1 unit/channel/day = 5K. We have headroom but stay aware.
- **Asset rights enforcement**: if we store only Drive URLs, we can't actually prevent paid social use after rights expire — we just display the warning. Acceptable for MVP, real enforcement would require moving assets into S3 with signed URLs.

### Alternatives considered
- **Third-party CRM (Modash, Phyllo, Aspire)**: $500–2000/month. Faster setup but recurring cost and no integration with our Shopify-side attribution. Rejected for MVP; revisit if our needs outgrow what we can build.
- **Build into Shopify directly via apps**: would tie us to Shopify lock-in. Rejected.
- **Notion/Airtable as the system of record**: works for <50 creators, doesn't scale to 735+ with stats refresh. Rejected.

### Phased rollout strategy
Phases 1–2 deliver immediate value (browsable creator DB) even if Phases 3–6 slip. Each phase is independently shippable behind a feature flag if needed. Recommendation: ship Phase 1+2 first; Phases 3+ can be iterative based on what we learn from actually using the read views.

### Out-of-band: rotate the YouTube API key
The current key (`AIzaSyBOu7CNUwztedr-mPY1d3snDt_-OllccW8`) was used in research and is in chat transcripts. Before Phase 1, generate a fresh key in `fitwell-ops` GCP project, restrict to YouTube Data API v3 + the production Vercel deployment IPs, store as `YOUTUBE_API_KEY` env var.
