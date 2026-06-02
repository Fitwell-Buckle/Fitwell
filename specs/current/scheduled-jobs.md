# Scheduled Jobs

Last updated: 2026-05-31

All cron jobs run as Vercel Cron serverless functions. Schedules defined in `vercel.json`.

## Job Inventory

| Job | Path | Schedule | Frequency | Description |
|-----|------|----------|-----------|-------------|
| Extract Shopify | `/api/cron/extract-shopify` | `15 */2 * * *` | Every 2h at :15 | Sync orders + customers since last run |
| Extract GA4 | `/api/cron/extract-ga4` | `30 6 * * *` | Daily 6:30 UTC | Previous day's traffic data |
| Extract Google Ads | `/api/cron/extract-google-ads` | `45 6 * * *` | Daily 6:45 UTC | Previous day's ad spend/conversions |
| Extract GSC | `/api/cron/extract-gsc` | `0 7 * * *` | Daily 7:00 UTC | Search data (3-day lag) |
| Extract PostHog | `/api/cron/extract-posthog` | `0 */3 * * *` | Every 3h | Aggregate event counts |
| Extract Klaviyo | `/api/cron/extract-klaviyo` | `30 7 * * *` | Daily 7:30 UTC | Campaign + flow performance, list growth |
| Health Check | `/api/cron/health` | `0 */4 * * *` | Every 4h | Verify DB, API connections |
| Production deadline alerts | `/api/cron/production-deadline-alerts` | `0 13 * * *` | Daily 13:00 UTC | Email owner + suppliers re: items due/overdue, complete POs ready to receive |
| Lead follow-up nudges | `/api/cron/lead-followups` | `0 14 * * *` | Daily 14:00 UTC | Draft a 2nd follow-up for leads whose first follow-up was sent ≥N days ago with no reply. N (default 14) + an on/off toggle are configured in Settings → Lead follow-ups (`lead_followup_settings`); disabled = no-op |
| Scheduled sends | `/api/cron/send-scheduled` | `*/15 * * * *` | Every 15 min | Send `outbound_message` rows with `status='scheduled'` whose `scheduled_at` has passed, via the scheduler's Gmail (`created_by_user_id`), then mark them sent. Rows with no sender/recipient are skipped (stay scheduled, fixable) |
| Lead reply alerts | `/api/cron/lead-replies` | `*/5 * * * *` | Every 5 min | Check active leads' owner Gmail (bounded concurrency) for new inbound replies; raise an admin notification ("X replied"). De-duped via `lead.replies_notified_at`. ~50 lightweight Gmail list calls/run. Needs the Gmail API enabled |
| Customer messages | `/api/cron/customer-messages` | `*/15 * * * *` | Every 15 min | Scan each connected team inbox's recent inbound (≤25 msgs, `newer_than:7d`), match senders to stored customers/companies by email, record new `customer_message` rows (dedup on gmail id), raise a `customer_message` notification per match. Needs the Gmail API enabled |

## Lead follow-up nudges — Detail

0. Read the rule from `lead_followup_settings` (single row, id=`default`;
   `getFollowupSettings()`). If `enabled=false`, the cron no-ops and returns
   `{disabled:true}`. Otherwise `nudge_after_days` (default 14) is the wait
   period below. Both are edited in **Settings → Lead follow-ups**.
1. Find candidate leads (`findLeadsNeedingNudge(nudgeAfterDays)`): an initial
   follow-up (`outbound_message` `sequence_step=1`) was marked **sent**
   ≥`nudge_after_days` ago, the lead is `active`, `replied_at` is null, and no
   `sequence_step>=2` message exists yet. Capped at 25 per run.
2. For each, check whether the lead emailed back: Gmail
   `from:<lead email> after:<sent date>` via the lead owner's (fallback:
   capturer's) stored Google token (`src/lib/gmail/inbound.ts`).
   - Reply found → set `lead.replied_at`, skip (no nudge).
   - No reply (or Gmail not connected → "not checked") → draft a gentle
     second follow-up (`draftFollowupEmail({isNudge:true})`) and queue it as
     a `sequence_step=2` `outbound_message` (status `draft`).
3. Drafts are reviewed/sent from **Customers → Next Steps** — the cron never
   sends email itself.
4. Returns `{candidates, drafted, skippedReplied, failed}`.

> A general, multi-rule + AI-assisted follow-up engine is planned to replace this
> single rule — see `specs/work-plans/todo/lead-followup-rule-engine.md`.

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
