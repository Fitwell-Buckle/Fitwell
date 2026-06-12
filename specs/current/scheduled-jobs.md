# Scheduled Jobs

Last updated: 2026-06-12

All currently-running cron jobs are Vercel Cron serverless functions
with schedules defined in `vercel.json`. One exception (the daily
newsletter, see [newsletter-engine.md](newsletter-engine.md)) runs the
heavy lifting on GitHub Actions instead — serverless timeout ceilings
break a workload that needs proxied scraping, image processing, and
~14 LLM calls in a single run. **But its *timing* is driven by Vercel
Cron, not GitHub's `schedule:`** — `newsletter-trigger` (below) fires a
GitHub `workflow_dispatch` on time, because GitHub batches scheduled
workflows and runs them hours late (observed 3h+), whereas dispatches
start within seconds. The GitHub `schedule:` cron is kept only as a
late fallback that no-ops if the Vercel path already sent the brief.

## Job Inventory

| Job | Path | Schedule | Frequency | Description |
|-----|------|----------|-----------|-------------|
| Extract Shopify | `/api/cron/extract-shopify` | `15 */2 * * *` | Every 2h at :15 | Sync orders + customers since last run |
| Extract GA4 | `/api/cron/extract-ga4` | `30 6 * * *` | Daily 6:30 UTC | Previous day's traffic data |
| Extract Google Ads | `/api/cron/extract-google-ads` | `45 6 * * *` | Daily 6:45 UTC | Previous day's ad spend/conversions |
| Extract GSC | `/api/cron/extract-gsc` | `0 7 * * *` | Daily 7:00 UTC | Search data (3-day lag) |
| Extract PostHog | `/api/cron/extract-posthog` | `0 */3 * * *` | Every 3h | Aggregate event counts |
| Extract Klaviyo | `/api/cron/extract-klaviyo` | `30 7 * * *` | Daily 7:30 UTC | Campaign + flow performance, list growth |
| Extract Judge.me | `/api/cron/extract-judgeme` | `45 7 * * *` | Daily 7:45 UTC | All published reviews; upserts the `review` table; drives the live advocate count on `/funnel/strategy` |
| Creator posts — YouTube | `/api/cron/extract-creator-posts-yt` | `0 4 * * *` | Nightly 4:00 UTC | Last 5 uploads per tracked YT channel (~2 quota units each); dedup on `post_url`, Fitwell-mention detection, links posts to gifting orders sent ≤30d prior. No-ops ("skipped") until `YOUTUBE_API_KEY` is set |
| Creator posts + stats — Instagram | `/api/cron/extract-creator-posts-ig` | `30 */6 * * *` | Every 6h at :30 | Apify profile scrape, ALL non-rejected IG creators, ≤50 profiles/cycle least-recently-refreshed first (full pool refreshes every ~3–4 days). One payload feeds post detection AND the stats/score refresh (followers, ER, last post, re-scored watch/fit). No-ops until `APIFY_TOKEN` is set |
| Creator stats — YouTube | `/api/cron/refresh-creator-stats` | `0 3 * * *` | Nightly 3:00 UTC | Fresh subscribers/ER/last-upload per YT channel (~4 quota units each), new `creator_stats_daily` snapshot, watch/fit scores recomputed from fresh text, `cross_platform_fit` updated (`score_boost` untouched — human judgment survives). No-ops until `YOUTUBE_API_KEY` is set |
| Creator actions | `/api/cron/creator-actions` | `30 13 * * *` | Daily 13:30 UTC | The "ping me" pass: follow-ups due, sample-delivered-no-follow-up (notification carries a ready-to-send draft — human approves, nothing auto-sends), expected-post-overdue nudges, auto-burn of 60-day-silent `no_reply` threads, paid-usage rights expiring ≤14d. Dedupes per (type, href) within 7 days |
| Creator discovery — YouTube | `/api/cron/discover-creators` | `0 5 * * 1` | Weekly Mon 5:00 UTC | Keyword search (5 watch queries, last-30d videos) → untracked channels with non-`none` watch confidence land as `unreviewed` prospects. Dedup on platform+handle means rejected creators never resurface. ~600 quota units/run. No-ops until `YOUTUBE_API_KEY` |
| Health Check | `/api/cron/health` | `0 */4 * * *` | Every 4h | Verify DB, API connections |
| Production deadline alerts | `/api/cron/production-deadline-alerts` | `0 13 * * *` | Daily 13:00 UTC | Email owner + suppliers re: items due/overdue, complete POs ready to receive |
| Supplier ETA reminders | `/api/cron/supplier-eta-reminders` | `0 15 * * *` | Daily 15:00 UTC | Email each supplier who still has line items they own without a Final ETA, no more often than every `eta_reminder_interval_days` days (per-supplier, off `supplier.eta_reminder_last_sent_at`). Recipients = contact email + `supplier_contact` logins. Gated by `production_settings.eta_reminder_enabled`; interval + toggle editable in Settings → Supplier ETA reminders. A supplier with no missing ETAs has its clock reset. Cadence logic is the unit-tested `isReminderDue` |
| Stage check-ins (positive control) | `/api/cron/stage-checkins` | `0 */6 * * *` | Every 6h | For each master-PO work stage a supplier currently owns, computes how far it is through its estimated duration (per-PO `production_po_stage_estimate`, else cycle-time avg, else fallback) and at each `stage_checkin_thresholds` % (default 50/75/95) prompts the owner to confirm on-track — platform notification (`stage_checkin_for_supplier`) + email — recording a `production_stage_checkin` row per threshold (once each, via the unique instance index). The supplier answers on the PO page (`/api/supplier/stage-checkin/[id]`). A flagged delay, or an overrun with no on-track confirmation, escalates to admins (`stage_checkin_overdue` notification + email). Gated by `production_settings.stage_checkin_enabled`; pure cadence/escalation logic is the unit-tested `stage-checkin.ts` |
| Sent follow-ups | `/api/cron/sent-followups` | `0 14 * * *` | Daily 14:00 UTC | Scan connected admins' Gmail **Sent** folders, match recipients to known leads/customers/suppliers (`sent_email`), and for any sent ≥N days ago with no reply, draft a **threaded** follow-up (reply in the original thread) into Next Steps. N (default 14) + on/off in Settings → Lead follow-ups (`lead_followup_settings`); disabled = no-op. Replaced the old platform-only `lead-followups` nudge. Needs the Gmail API enabled |
| Scheduled sends | `/api/cron/send-scheduled` | `*/15 * * * *` | Every 15 min | Send `outbound_message` rows with `status='scheduled'` whose `scheduled_at` has passed, via the scheduler's Gmail (`created_by_user_id`), then mark them sent. Rows with no sender/recipient are skipped (stay scheduled, fixable) |
| Lead reply alerts | `/api/cron/lead-replies` | `*/5 * * * *` | Every 5 min | Check active leads' owner Gmail (bounded concurrency) for new inbound replies; raise an admin notification ("X replied"). De-duped via `lead.replies_notified_at`. ~50 lightweight Gmail list calls/run. Needs the Gmail API enabled |
| Customer messages | `/api/cron/customer-messages` | `*/15 * * * *` | Every 15 min | Scan each connected team inbox's recent inbound (≤25 msgs, `newer_than:7d`), match senders to stored customers/companies by email, record new `customer_message` rows (dedup on gmail id), raise a `customer_message` notification per match. Needs the Gmail API enabled |
| Newsletter trigger | `/api/cron/newsletter-trigger` | `55 8 * * 1-5` | Weekdays 8:55 UTC | Reliable clock for the daily newsletter: fires a GitHub `workflow_dispatch` (`mode=send`, `scheduled=true`) for `newsletter-daily.yml` so the brief builds + sends ~09:00 UTC, instead of trusting GitHub's hours-late `schedule:`. Needs `GH_DISPATCH_TOKEN` (fine-grained PAT, Actions: read+write on `Fitwell-Buckle/Fitwell`) in Vercel env. Returns 500 (no dispatch) if the token is missing — the GitHub `schedule:` fallback at 10:00 UTC still covers that case |

## Sent follow-ups — Detail

0. Read the rule from `lead_followup_settings` (single row, id=`default`;
   `getFollowupSettings()`). `enabled=false` → no-op. `nudge_after_days`
   (default 14) is the wait. Edited in **Settings → Lead follow-ups**.
1. **Scan** (`scanSentEmails`): for each connected, Gmail-scoped admin inbox,
   list recent **Sent** mail (`in:sent newer_than:30d`), match each recipient
   (`To`) to a known lead/customer/supplier by email, and upsert a `sent_email`
   row (dedup on the Gmail message id) with thread id + RFC822 Message-ID.
2. **Generate** (`generateSentFollowups(nudgeAfterDays)`): for `sent_email`
   rows ≥`nudge_after_days` old with `replied_at` + `followup_queued_at` both
   null:
   - reply check via `hasInboundFromAnyMailbox(toEmail, sentAt)`. Reply → set
     `replied_at`, skip.
   - else draft (`draftFollowupEmail({isNudge:true})`) and queue an
     `outbound_message` (status `draft`, `sequence_step=2`) targeting that
     contact, with `thread_id` + `in_reply_to` set so the send **replies in the
     original thread**, attributed to the sender (`created_by_user_id`). Mark
     `followup_queued_at`.
3. Drafts are reviewed/sent from **Next Steps** (`/messages`) — the cron never
   sends; sending (or the scheduled-send cron) threads via `sendGmail`.
4. Returns `{scanned, inserted, candidates, drafted, skippedReplied}`.

> A general, multi-rule + AI-assisted follow-up engine is still planned — see
> `specs/work-plans/todo/lead-followup-rule-engine.md`.

## Authentication

All cron endpoints verify the `CRON_SECRET` header set by Vercel:
```
Authorization: Bearer ${CRON_SECRET}
```

Requests without valid secret return `401`.

## Extract Shopify — Detail

1. Read `last_synced_at` from a metadata/config store
2. Fetch orders with `updated_at_min = last_synced_at`
3. Paginate through all results (250 per page)
4. Upsert orders into `order` table (conflict on `shopify_id`)
5. Upsert line items for each order
6. Upsert customers referenced by new/updated orders
7. Recalculate customer aggregates (`order_count`, `total_spent`)
8. Update `last_synced_at`
9. Log summary (orders processed, customers updated, duration)

## Extract GA4 — Detail

1. Query GA4 Data API for yesterday's date
2. Dimensions: source, medium, campaign
3. Metrics: sessions, users, new users, pageviews, session duration, bounce rate
4. Insert rows into `ga4_daily` (no upsert — append only)

## Extract Google Ads — Detail

1. Query Google Ads API for yesterday's date
2. Campaign-level: impressions, clicks, cost, conversions, conversion value
3. Insert into `google_ads_daily`

## Extract GSC — Detail

1. Query Search Console API for date = 3 days ago (data lag)
2. Dimensions: query, page, country, device
3. Insert into `gsc_daily`

## Extract PostHog — Detail

1. Query PostHog events API for events since last extraction
2. Aggregate by event_name + page + date
3. Insert into `posthog_daily`

## Extract Klaviyo — Detail

1. Discover metric IDs by name (Placed Order / Subscribed to List / Unsubscribed) via `/api/metrics`
2. Discover the newsletter list — explicit `KLAVIYO_NEWSLETTER_LIST_ID` env var, else largest list (with a warning)
3. `POST /api/campaign-values-reports` for last 90 days; upsert into `klaviyo_email_performance` keyed on `campaign_id`
4. `POST /api/flow-values-reports` for last 90 days; delete today's aggregate rows, re-insert one row per flow with `customer_id`/`order_id` NULL
5. `POST /api/metric-aggregates` for Subscribed + Unsubscribed daily counts (last 90 days); upsert into `klaviyo_list_growth_daily` on `(date, list_id)`; snapshot list profile_count onto today's row only
6. Client retries `429` and `5xx` up to 3 times, honors `Retry-After`. Returns counts per table for logging.

## Health Check — Detail

1. Verify database connection (simple SELECT)
2. Verify Shopify API access (lightweight endpoint)
3. Check last sync timestamps — alert if stale (>6h for Shopify, >36h for daily jobs)
4. Report status to Sentry or log

## Error Handling

- All jobs wrapped in try/catch
- Failures reported to Sentry with job context
- Consecutive failures trigger alert email via Resend
- Jobs are idempotent — safe to re-run manually

## Open Questions

- [ ] Backfill strategy for missed cron runs?
- [ ] Vercel Cron has 60s timeout on Hobby plan — will extractions fit?
- [ ] Monitoring dashboard for job history and duration trends?
