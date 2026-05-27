# Integrations

Last updated: 2026-05-26

## Shopify Admin API

**Purpose**: Source of truth for orders and customers.

| Detail | Value |
|--------|-------|
| Store | `fitwell-buckles.myshopify.com` (env: `SHOPIFY_STORE_DOMAIN`) |
| App | Fitwell Admin — Partner org `75387489`, app ID `360915140609` |
| Auth | Admin API client credentials (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`) |
| Webhook secret | `SHOPIFY_WEBHOOK_SECRET` |
| Protocols | REST API (orders, customers) + GraphQL (bulk queries) |
| Sync method | Cron polling (every 2h) + real-time webhooks |
| App config source | `shopify.app.toml` at repo root |
| Embedded in Shopify Admin | No (`embedded = false`) — app runs standalone at `admin.fitwellbuckle.co` |

### App configuration (scopes, embed, deploy)

App config — scopes, embed flag, app URL, declared webhooks — lives in `shopify.app.toml` at the repo root. The full workflow (CLI setup, deploy/release, merchant re-auth, troubleshooting, open scope questions) is documented in **[shopify-app-config.md](shopify-app-config.md)**. Don't edit the same fields in the Shopify Dev Dashboard UI — they'll be overwritten on the next deploy.

### Endpoints Used
- `GET /admin/api/2024-10/orders.json` — paginated order fetch with `updated_at_min`
- `GET /admin/api/2024-10/customers.json` — paginated customer fetch
- `POST /admin/api/2024-10/graphql.json` — bulk operations for full syncs

### Webhooks
- `orders/create` — new order notification
- `orders/updated` — order status changes (fulfillment, refund)
- `customers/update` — customer profile changes

### Webhook Verification
All incoming webhooks verified via HMAC-SHA256:
- Header: `X-Shopify-Hmac-Sha256`
- Secret: `SHOPIFY_WEBHOOK_SECRET`
- Compare `base64(hmac_sha256(body, secret))` against header value

### Sync Strategy
1. Cron fetches orders modified since last sync (`updated_at_min`)
2. Upserts into `order` table on `shopify_id` conflict
3. Recalculates customer aggregates (`order_count`, `total_spent`, `last_order_at`)
4. Webhooks handle real-time updates between cron windows

---

## PostHog

**Purpose**: Product analytics, event tracking, feature flags.

| Detail | Value |
|--------|-------|
| Host | `https://us.i.posthog.com` |
| Client SDK | `posthog-js` — auto-loaded via provider |
| Server SDK | `posthog-node` — used in API routes and cron |

### Usage
- **Landing pages**: Track pageviews, CTA clicks, scroll depth, UTM params
- **Admin dashboard**: Track admin feature usage (optional)
- **Feature flags**: Gate new features, A/B test landing page variants
- **Cron extraction**: Aggregate daily event counts into `posthog_daily` table

### Events Tracked
| Event | Trigger | Properties |
|-------|---------|------------|
| `$pageview` | Auto-captured | url, referrer, utm_* |
| `cta_click` | Button click on landing pages | button_id, page, variant |
| `comparison_view` | Comparison page load | slug, products |
| `brand_inquiry` | For-brands form submission | company_name |

---

## Google Service Account (shared auth for GA4, GSC, Google Ads)

**Service account**: `fitwell-analytics@fitwell-496020.iam.gserviceaccount.com`
**GCP Project**: `fitwell-496020` (under `fitwellbuckle.co` Workspace org)
**Auth module**: `src/lib/google/auth.ts` — JWT token exchange with 1-hour caching

Env vars: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### Setup Notes

**Org policy blocker (resolved 2026-05-12):** The `fitwellbuckle.co` Workspace org had `iam.disableServiceAccountKeyCreation` enforced by Google's "Secure by Default" policy. Oliver needed to grant himself Organization Policy Administrator at the ORG level (not project level) in GCP IAM, then override the policy. Steps: GCP Console → IAM (select org, not project) → Grant Access → Organization Policy Administrator → then Organization Policies → disable the constraint.

**GA4 UI bug (active as of 2026-05-13):** Google has a confirmed bug (since ~April 23, 2026) where the GA4 and Search Console UIs reject newly created service accounts with "This email doesn't match a Google Account." Service accounts created before that date work fine. 167+ reports, Google has acknowledged but not fixed.

**Workaround — use the Analytics Admin API via OAuth Playground:**
1. Go to https://developers.google.com/oauthplayground/
2. Authorize scope: `https://www.googleapis.com/auth/analytics.manage.users`
3. Sign in as a GA4 admin (e.g., `greg@fitwellbuckle.co`)
4. Exchange authorization code for tokens
5. POST to `https://analyticsadmin.googleapis.com/v1alpha/properties/{PROPERTY_ID}/accessBindings`
6. Body: `{"user":"SERVICE_ACCOUNT_EMAIL","roles":["predefinedRoles/viewer"]}`
7. 200 OK = success. The service account appears in GA4 access management.

**Search Console has no API for adding users** — it's UI-only. And the UI has the same bug (rejects new service accounts with "email not found"). GSC extraction is blocked until Google fixes this. Check periodically by trying to add the service account at: Search Console → Settings → Users and permissions → Add user.

---

## GA4 (Google Analytics 4)

**Purpose**: Website traffic analytics, audience insights.

| Detail | Value |
|--------|-------|
| Property ID | `GA4_PROPERTY_ID` |
| Measurement ID | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| Auth | Google service account |
| API | GA4 Data API (v1beta) |

### Extraction
Daily cron job at 06:30 UTC fetches previous day's data:
- Dimensions: `date`, `sessionSource`, `sessionMedium`, `sessionCampaignName`
- Metrics: `sessions`, `totalUsers`, `newUsers`, `screenPageViews`, `averageSessionDuration`, `bounceRate`
- Stored in `ga4_daily` table

---

## Google Search Console

**Purpose**: Organic search performance — keywords, rankings, CTR.

| Detail | Value |
|--------|-------|
| Site URL | `https://fitwellbuckle.co` |
| Auth | Google service account |
| API | Search Console API (v1) |

### Extraction
Daily cron at 07:00 UTC fetches data from 3 days ago (GSC data has ~3-day lag):
- Dimensions: `query`, `page`, `country`, `device`
- Metrics: `clicks`, `impressions`, `ctr`, `position`
- Stored in `gsc_daily` table

---

## Google Ads

**Purpose**: Paid search campaign performance and spend tracking.

| Detail | Value |
|--------|-------|
| Customer ID | `GOOGLE_ADS_CUSTOMER_ID` |
| Auth | Google service account + developer token |
| API | Google Ads API (v17) |

### Extraction
Daily cron at 06:45 UTC:
- Campaign-level metrics: impressions, clicks, cost, conversions, conversion_value
- Stored in `google_ads_daily` table

---

## Resend

**Purpose**: Transactional email delivery.

| Detail | Value |
|--------|-------|
| From address | `hello@fitwellbuckle.co` |
| Auth | `RESEND_API_KEY` |

### Use Cases
- Admin notifications (sync failures, anomaly alerts)
- Future: post-purchase emails, review requests

---

## Sentry

**Purpose**: Error tracking and performance monitoring.

| Detail | Value |
|--------|-------|
| Project | `fitwell` |
| SDK | `@sentry/nextjs` |
| DSN | `SENTRY_DSN` |

Captures unhandled errors in both client and server. Source maps uploaded during Vercel build.

---

## Vercel

**Purpose**: Hosting and infrastructure.

| Feature | Usage |
|---------|-------|
| Serverless Functions | All API routes and cron handlers |
| Edge Middleware | Auth checks and PostHog integration |
| Cron Jobs | Scheduled data extraction (see `vercel.json`) |
| Preview Deployments | PR-based previews |
| Speed Insights | Core Web Vitals monitoring |

## Open Questions

- [ ] Shopify GraphQL bulk operations for initial historical sync — how far back?
- [ ] PostHog feature flags vs environment variables for simple toggles?
- [ ] Google Ads API — do we need MCC-level access or single account?
- [ ] Meta/Facebook Ads integration for future paid social tracking?
