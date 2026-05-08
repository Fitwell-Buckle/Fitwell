# Google Integrations (GA4 + Search Console + Google Ads)

## Context
- We need daily extraction of traffic, search, and ad performance data to build a unified analytics dashboard
- All three services authenticate via a Google service account with domain-wide delegation
- Data lands in staging tables (ga4_daily, gsc_daily, google_ads_daily) and powers the admin dashboard's campaign and attribution views
- Reference: specs/current/integrations.md, specs/current/scheduled-jobs.md, specs/current/schema.md

## Dependencies
- NeonDB with analytics staging tables migrated (ga4_daily, gsc_daily, google_ads_daily)
- Google Cloud project with service account created
- Service account granted access to GA4 property, GSC site, and Google Ads account
- Relevant env vars configured (GA4_PROPERTY_ID, GSC_SITE_URL, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)

## Scope
Included:
- Google service account JWT authentication (shared across all three)
- GA4 Data API: daily sessions, users, pageviews, bounce rate, source/medium breakdown
- Google Search Console API: daily queries, pages, impressions, clicks, CTR, position
- Google Ads API: daily campaign performance (impressions, clicks, cost, conversions, conversion value)
- Cron extraction jobs for each (matching vercel.json schedules)
- Historical backfill (last 90 days for GA4/GSC, last 30 days for Ads)
- Admin dashboard views for each data source

Excluded:
- Google Ads campaign management / bid changes (read-only for now)
- GA4 real-time data
- GA4 event configuration or custom dimensions
- Google Ads conversion setup (done in Google Ads UI)

## Implementation Phases

### Phase 1: Google Auth & Shared Infrastructure
- [ ] Implement Google service account JWT token generation using jose library (already in deps)
- [ ] Build token caching (tokens valid for 1 hour, cache and refresh)
- [ ] Create shared Google API fetch wrapper with error handling and retry
- [ ] Add a lib/google/auth.ts module for shared auth
- [ ] Test auth against one API endpoint

#### Tests
- Unit: JWT construction with correct claims and expiry
- Unit: token cache hit/miss behavior
- Integration: obtain access token and make a test API call

### Phase 2: GA4 Data API Integration
- [ ] Implement GA4 Data API client in src/lib/analytics/ga4.ts
- [ ] Daily extraction query: sessions, users, newUsers, screenPageViews, bounceRate, averageSessionDuration, grouped by date + source + medium
- [ ] Parse GA4 API response format (dimensionHeaders + metricHeaders + rows)
- [ ] Upsert into ga4_daily table (dedup on date + source + medium)
- [ ] Wire up /api/cron/extract-ga4 route to call extraction
- [ ] Add historical backfill function (last 90 days, paginated)
- [ ] Create scripts/backfill-ga4.ts for one-time historical import

#### Tests
- Unit: GA4 API response parsing
- Unit: upsert dedup logic
- Integration: extract one day of data, verify DB state

### Phase 3: Google Search Console Integration
- [ ] Implement GSC API client in src/lib/analytics/gsc.ts
- [ ] Daily extraction: searchAnalytics.query with dimensions [query, page, date]
- [ ] Metrics: impressions, clicks, ctr, position
- [ ] Filter to fitwellbuckle.co site URL
- [ ] Upsert into gsc_daily table (dedup on date + query + page)
- [ ] Wire up /api/cron/extract-gsc route
- [ ] Note: GSC data has 2-3 day lag — extract for date = today - 3 days
- [ ] Add historical backfill (last 90 days)
- [ ] Create scripts/backfill-gsc.ts

#### Tests
- Unit: GSC response parsing (rows with keys array)
- Unit: date lag calculation
- Integration: extract one day, verify DB

### Phase 4: Google Ads Integration
- [ ] Implement Google Ads API client in src/lib/analytics/google-ads.ts
- [ ] Use Google Ads Query Language (GAQL) for extraction
- [ ] Daily query: SELECT campaign.name, campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = 'YYYY-MM-DD'
- [ ] Convert cost_micros to cents (divide by 10000)
- [ ] Upsert into google_ads_daily table (dedup on date + campaign_id)
- [ ] Wire up /api/cron/extract-google-ads route
- [ ] Handle Google Ads API versioning (currently v18)
- [ ] Add historical backfill (last 30 days)
- [ ] Create scripts/backfill-google-ads.ts

#### Tests
- Unit: GAQL response parsing
- Unit: cost_micros to cents conversion
- Integration: extract one day, verify DB

### Phase 5: Admin Dashboard Views
- [ ] Wire /api/admin/campaigns to aggregate google_ads_daily data (spend, ROAS, CPA by campaign)
- [ ] Add traffic overview to dashboard using ga4_daily (sessions, users, bounce rate trends)
- [ ] Add search performance widget using gsc_daily (top queries, top pages, impressions/clicks)
- [ ] Add ad spend summary to dashboard (total spend, conversions, ROAS)
- [ ] Build campaign detail page showing daily trends (line charts via Recharts)
- [ ] Add date range picker component for filtering all analytics views
- [ ] Cross-reference Google Ads conversions with Shopify orders for true ROAS calculation

#### Tests
- Unit: ROAS calculation (revenue / ad spend)
- Unit: date range filtering queries
- E2E: navigate to campaigns page, verify charts render

### Phase 6: Monitoring & Maintenance
- [ ] Add extraction status tracking (last successful run, last error, row count)
- [ ] Include Google extraction health in /api/cron/health checks
- [ ] Alert if extraction hasn't run in expected window (e.g., no GA4 data for 48h)
- [ ] Document all Google API quotas and rate limits in specs/current/integrations.md
- [ ] Add extraction status to admin settings page

#### Tests
- Unit: staleness detection (last run > threshold)

## Notes
- Google service account private key is a PEM string — store in env var with \n escaped, unescape at runtime
- GA4 Data API has a 10,000 rows per response limit — paginate with offset for large date ranges
- GSC data has a 2-3 day processing lag — always extract for (today - 3 days)
- Google Ads cost is in micros (1/1,000,000 of currency) — convert to cents for consistency with Shopify amounts
- All three APIs have daily quota limits: GA4 (25,000 requests/day), GSC (25,000/day), Ads (15,000/day) — our daily cron is well within limits
- Consider adding a google_extraction_log table to track each run's success/failure/row count
- The shared auth module means if the service account key rotates, only one place needs updating
