# Meta Ads Integration

## Context
- Fitwell may run Facebook/Instagram ads targeting watch enthusiasts and luxury accessory buyers
- We need to extract campaign spend and conversion data to calculate cross-platform ROAS alongside Google Ads
- Data lands in a new meta_ads_daily staging table and feeds the campaign dashboard
- Reference: specs/current/integrations.md, specs/current/schema.md, specs/current/scheduled-jobs.md

## Dependencies
- Google integrations work plan completed (establishes the analytics extraction pattern)
- Meta Business account with ad account access
- Meta Marketing API access token (long-lived system user token preferred)
- Database migration for meta_ads_daily table
- Env vars: META_AD_ACCOUNT_ID, META_ACCESS_TOKEN

## Scope

### Included
- Meta Marketing API client (Graph API v21.0)
- Daily campaign performance extraction (spend, impressions, clicks, conversions, CPA, ROAS)
- Ad set and ad-level breakdown (optional drill-down)
- Cron extraction job
- Integration into campaign dashboard alongside Google Ads data
- Historical backfill (last 30 days)

### Excluded
- Ad creation or management (read-only)
- Creative asset analysis
- Audience management
- Instagram organic analytics
- Pixel/CAPI setup (done in Meta Business Manager)

## Implementation Phases

### Phase 1: Database & API Client
- [ ] Add meta_ads_daily table to schema (date, campaignName, campaignId, adSetName, impressions, clicks, spend in cents, conversions, conversionValue, reach, frequency, cpm, cpc, ctr)
- [ ] Generate and apply migration
- [ ] Build Meta Marketing API client in src/lib/analytics/meta-ads.ts
- [ ] Implement long-lived token refresh handling (tokens expire every 60 days — log warning at 50 days)
- [ ] Add rate limiting (Meta allows 200 calls/hour per ad account for standard access)

#### Tests
- Unit: API response parsing
- Unit: token expiry warning calculation

### Phase 2: Daily Extraction
- [ ] Implement daily campaign insights extraction using /act_{ad_account_id}/insights endpoint
- [ ] Fields: campaign_name, campaign_id, impressions, clicks, spend, actions (filter for offsite_conversion.fb_pixel_purchase), action_values, reach, frequency
- [ ] Breakdowns: none (campaign-level daily)
- [ ] Date range: single day (yesterday)
- [ ] Convert spend to cents (Meta returns as decimal string)
- [ ] Upsert into meta_ads_daily (dedup on date + campaign_id)
- [ ] Wire up /api/cron/extract-meta-ads route
- [ ] Add cron schedule to vercel.json (daily at 7:15 AM UTC)
- [ ] Add historical backfill script: scripts/backfill-meta-ads.ts (last 30 days)

#### Tests
- Unit: spend decimal-to-cents conversion
- Unit: actions array parsing (extracting purchase conversions)
- Integration: extract one day, verify DB state

### Phase 3: Dashboard Integration
- [ ] Add Meta Ads data to /api/admin/campaigns alongside Google Ads
- [ ] Unified campaign view: platform column (Google vs Meta), normalized metrics
- [ ] Add Meta spend to overall ad spend summary on dashboard
- [ ] Cross-platform ROAS comparison widget
- [ ] Add Meta-specific metrics (reach, frequency, CPM) to campaign detail view

#### Tests
- Unit: cross-platform metric normalization
- E2E: campaigns page shows both Google and Meta data

### Phase 4: Monitoring
- [ ] Add Meta extraction to /api/cron/health checks
- [ ] Token expiry monitoring — warn in health check if token expires within 14 days
- [ ] Log extraction runs (success/failure, row count)
- [ ] Update specs/current/integrations.md with Meta Ads section

#### Tests
- Unit: token expiry detection

## Notes
- Meta API returns spend as a decimal string ("12.34") — convert to cents integer (1234)
- Actions array is complex — filter for the specific action type (offsite_conversion.fb_pixel_purchase) to get conversion count
- action_values contains revenue data — same filtering needed
- Meta access tokens expire every 60 days even for system users — build monitoring and document the refresh process
- Consider storing ad set-level data in a separate table if we need that granularity later
- Meta's attribution window defaults have changed (7-day click, 1-day view) — document which window we're using
- If Fitwell isn't running Meta ads yet, this work plan can be deferred — but the schema and extraction pattern should be ready
