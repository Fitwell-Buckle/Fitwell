# Integrations

Last updated: 2026-05-28

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

### Customer Addresses (`customer_address` table)
`upsertCustomer` (`src/lib/shopify/sync.ts`) also calls `syncCustomerAddresses`, which **delete-and-replaces** every address from the Shopify payload (`addresses[]`, falling back to `default_address` alone if the array isn't present). Identifies the default by either `default: true` on a row or matching `default_address.id`. Surfaced on the B2B customer page (`/customers/brands/[id]`), default first. One-time backfill of all existing customers: `npx tsx scripts/backfill-customer-addresses.ts` (sequential, rate-limit-aware via the Shopify client; ~25 min for ~15K customers; idempotent).

---

## Gmail (admin's mailbox; per-admin OAuth)

**Purpose**: (1) Surface known contact emails when adding a supplier login / contact. (2) CRM: detect lead replies, list a lead's replies (Replies tab), and **send** follow-up emails from "Messages to Send" via the admin's own Gmail.

| Detail | Value |
|---|---|
| Library | Direct REST (`gmail.googleapis.com/gmail/v1`) — no SDK |
| Auth | The signed-in admin's stored Google OAuth token (DrizzleAdapter's `account` row, `provider='google'`). Refreshed via `refresh_token` on demand and persisted back. Shared token helper: `src/lib/gmail/token.ts` |
| Scopes | `gmail.readonly` (search + read replies) **and** `gmail.send` (send follow-ups) — both added to the Google provider in `src/lib/auth.ts`. Adding a scope needs one sign-out + sign-in per admin to re-consent (see below) |
| Server libs | `src/lib/gmail/search.ts` (`searchAdminGmailContacts`), `src/lib/gmail/inbound.ts` (`hasInboundEmailFrom`, `listInboundFrom` — reply detection + Replies tab), `src/lib/gmail/send.ts` (`sendGmail` — RFC-822 → base64url → `users/me/messages/send`) |
| Parser | `src/lib/gmail/parse-addresses.ts` — pure RFC-5322-ish header parser (6 vitest cases) |
| API routes | `GET /api/gmail/search?q=…`; `GET /api/leads/[id]/replies` + `POST /api/leads/[id]/replies-seen`; `POST /api/messages/[id]/send` — all admin-only |
| UI | `<GmailContactSearch>` (supplier forms); lead-detail **Replies** tab; **Send via Gmail** in Messages to Send |

### Auth: tokens are not auto-refreshed on subsequent sign-ins

A nuance worth remembering: NextAuth's `DrizzleAdapter` only calls `linkAccount` on a user's **first** Google sign-in. Subsequent sign-ins just create a session — they do not refresh `access_token` / `refresh_token` / `scope` / `expires_at`. So adding a scope to the Google provider config silently fails to apply to already-linked admins. The `signIn` callback in `src/lib/auth.ts` works around this by force-writing the fresh tokens onto the `account` row on every Google sign-in.

After this fix lands, any future scope addition takes effect with one sign-out + sign-in per admin. Before it, scope additions are stuck forever on existing admins.

### Setup: enable the Gmail API on the OAuth client's GCP project ⚠️ REQUIRED

**Every Gmail feature (contact search, lead reply detection, the Replies tab,
and Send via Gmail) needs the Gmail API enabled on the OAuth client's Google
Cloud project.** Granting the OAuth scopes is NOT enough — the API itself must
be turned on. Until it is, all Gmail calls return 403:

> "Gmail API has not been used in project <project_number> before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=<n> then retry."

The project is the one tied to `AUTH_GOOGLE_ID` — currently **`992120641760`**
(separate from `fitwell-496020`, used by the Google Ads / GA4 service account).
Enable it here, then wait ~1–2 min:
**https://console.cloud.google.com/apis/api/gmail.googleapis.com/overview?project=992120641760**

The app distinguishes this case: `sendGmail` parses the 403 body and the Send
route shows *"The Gmail API isn't enabled for this Google Cloud project…"*
(rather than a misleading "re-consent" message). Owner: coordinate with Greg —
this is a one-click Console toggle on the project that owns `AUTH_GOOGLE_ID`.

### Diagnostic: confirm a stored token is actually usable

If a Gmail feature 403s with the token present and scope granted (confirm the
stored `scope` includes `gmail.send`/`gmail.readonly` by querying the
`account` row), the cause is almost always "Gmail API not enabled on the OAuth
project" — fix above. A one-shot probe (bypasses the app — direct token →
Gmail API): pull `access_token` from the `account` row for `provider='google'`,
then `curl https://gmail.googleapis.com/gmail/v1/users/me/messages?q=test -H "Authorization: Bearer $token"`. Google's response body names the missing API directly.

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
| Verified domain | `portal.fitwellbuckle.co` |
| `EMAIL_FROM` (Vercel prod) | `Fitwell Buckle Co. <info@portal.fitwellbuckle.co>` |
| `RESEND_API_KEY` | Set in Vercel prod; if missing, every sender's `process.env.RESEND_API_KEY` check fails and the call is logged to the server console instead of sending (deliberate dev fallback) |
| Server entry | `src/lib/email/resend.ts` — `sendEmail({ to, subject, html, … })` thin wrapper around the Resend SDK |

### Use Cases (all live)
- **Supplier-portal magic-link sign-in** (`src/lib/email/magic-link.ts`)
- **PO handoff + activity notifications** (`src/lib/production/notifications.ts`) — stage handoff, note/document posts; routed to admins for supplier-side actions, to supplier contacts for internal posts
- **B2B invoice send** (`src/app/api/invoices/[id]/send`) — emails the invoice document; CC'd to the sending admin
- **Production deadline alert cron** (`src/app/api/cron/production-deadline-alerts`)
- Future: post-purchase emails, review requests (deferred)

### Watchpoints
- Brand-new sending domains often land in spam for the first while; check the Resend dashboard's Emails log to confirm "Delivered" before debugging the app
- `EMAIL_FROM` must be on the verified domain. The code defaults to `hello@fitwellbuckle.co` if unset, which is the apex domain (not verified) — sends would be rejected; we explicitly set `EMAIL_FROM` in Vercel to the `portal.` subdomain to avoid this

---

## Vercel Blob

**Purpose**: File storage for customer- and PO-attached documents.

| Detail | Value |
|--------|-------|
| Store name | `fitwell-attachments` (Vercel → Storage → Blob; team `fitwellbuckle`) |
| Access | `public` (per-blob URLs use `addRandomSuffix: true` so they're not enumerable) |
| Region | `iad1` (US East, matches the Neon DB region) |
| Auth | `BLOB_READ_WRITE_TOKEN` (auto-injected when the store is connected to a project environment) |
| SDK | `@vercel/blob` |

Used by:
- `POST /api/production/po/[id]/attachments` and `POST /api/invoices/[id]/attachments` for uploads
- `DELETE /api/production/attachments/[id]` and `DELETE /api/invoices/attachments/[id]` for removals (best-effort blob delete + always-on DB row delete)

Upload routes return a clean **503 "Blob storage not configured"** when `BLOB_READ_WRITE_TOKEN` is missing — the feature degrades gracefully rather than crashing. Same env-var name in dev `.env.local` (the `vercel blob create-store` CLI writes it there automatically when run from a linked project).

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
