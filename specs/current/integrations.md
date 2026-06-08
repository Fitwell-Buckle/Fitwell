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
| Embedded in Shopify Admin | No (`embedded = false`) — app runs standalone at `portal.fitwellbuckle.co` |

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

## WhatsApp (Meta Cloud API)

**Purpose**: pull WhatsApp messages from leads/customers into the CRM — surfaced
in the **Notifications** inbox (channel "WhatsApp") and matched to a contact by
**phone number** (vs Gmail's email match).

| Aspect | Detail |
|---|---|
| Provider | Meta WhatsApp Business Platform — Cloud API |
| Inbound | `GET/POST /api/webhooks/whatsapp`. GET = Meta's verify handshake (`hub.verify_token` ↔ `WHATSAPP_VERIFY_TOKEN`). POST = message events; HMAC-verified via `X-Hub-Signature-256` (`WHATSAPP_APP_SECRET`) |
| Matching | `lib/crm/phone-match.ts` (`normalizePhone` → last 10 digits; `matchPhone`) against `lead.phone` / `customer.phone`. Lead wins |
| Storage | `whatsapp_message` (dedup on `wa_message_id`); each new inbound raises an `admin_notification` (type `whatsapp_message`, `mailbox_label='WhatsApp'`) |
| Outbound | `lib/whatsapp/client.ts` `sendWhatsApp(toPhone, text)` → Cloud API `…/{PHONE_NUMBER_ID}/messages`. Note Meta's 24h customer-care window: outside it only approved templates send |
| Env | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` |

### Setup ⚠️ REQUIRED (inert until done)
1. Create a Meta app + add the **WhatsApp** product; add/verify a business phone number.
2. Set the env vars above (verify token is any random string you choose).
3. In the Meta app's WhatsApp → Configuration, add the **callback URL**
   `https://portal.fitwellbuckle.co/api/webhooks/whatsapp` with the same verify
   token, and **subscribe** to the `messages` field.
Until configured, the webhook 403s the handshake and no messages flow.
Weaving WhatsApp into the per-contact **Replies/Messages** views (alongside
email) lands with the unified detail-tabs work.

---

## Grapevine (post-purchase survey)

**Purpose**: capture self-reported attribution from the post-purchase survey
("Where did you first discover Fitwell?") and join it to specific Shopify
orders. Powers the `link_method = 'self_report'` path in
[attribution.md](../invariants/attribution.md) and the channel-mix dashboard.

| Aspect | Detail |
|---|---|
| Provider | Grapevine Surveys (Shopify app, grapevine-surveys.com) |
| Survey | "Post purchase survey", survey code `698cc69eca3e5`, single question (`where_first_heard`), surfaces: Checkout app block, POS Fitwell South, POS Fitwell North |
| Inbound | `POST /api/webhooks/grapevine`. Shared-secret auth via `x-grapevine-secret` header (constant-time compare against `GRAPEVINE_WEBHOOK_SECRET`). Refuses all traffic when env unset |
| Trigger path | Grapevine → Shopify Flow ("Response Completed" trigger) → "Send HTTP request" action → this endpoint |
| Payload contract | `src/lib/grapevine/ingest.ts` (`grapevineWebhookPayload` Zod schema). Includes `providerResponseId`, `answer`, `isOther`/`otherText`, `shopifyOrderId`, `customerEmail`, `respondedAt` |
| Storage | `attribution_survey_response` (idempotent on `(provider, provider_response_id)`); FK into `order` resolved via `shopify_id` lookup |
| Channel mapping | `src/lib/grapevine/channel-mapping.ts` maps Grapevine answer labels → canonical channel IDs from [funnel.md](../strategy/funnel.md). Unknown labels and "Other" free-text store with `channel_hint=null` for Phase 4 normalization |
| Order-resolution race | If a response arrives before the Shopify order webhook lands, `order_id` is null and `shopify_order_id` is kept; `backfillUnresolvedOrders` in `ingest.ts` resolves them after the next Shopify extract |
| Env | `GRAPEVINE_WEBHOOK_SECRET` |

### Setup ⚠️ REQUIRED (inert until done)
1. Generate a strong shared secret (`openssl rand -base64 32`) and set
   `GRAPEVINE_WEBHOOK_SECRET` in Vercel (Production + each dev env) and
   in each contributor's `.env.local`.
2. In Shopify Admin → **Apps → Flow → Create workflow**:
   - **Trigger**: Grapevine "Response Completed" (search "Grapevine").
   - **Action**: "Send HTTP request"
     - URL: `https://portal.fitwellbuckle.co/api/webhooks/grapevine`
     - Method: `POST`
     - Headers: `x-grapevine-secret: <same secret as the env var>` plus
       `content-type: application/json`
     - Body: JSON template that maps the Grapevine trigger variables into
       the payload contract above. The required key is
       `providerResponseId`; the rest are optional but should all be
       wired through.
3. Activate the workflow. The first real response will hit the webhook
   and show up in `attribution_survey_response`.

Backfill of historical responses (pre-webhook era) is the Phase 2 script
`scripts/grapevine-backfill-from-csv.ts` — see the work plan.

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

## Klaviyo

**Purpose**: Email/SMS platform. Welcome flow drives a measured +27.6% LTV lift; post-purchase + win-back + M4 cross-sell flows are in the 360 campaign plan. Phase 0 (read side) is live; write side (campaign + flow authoring from this repo) is Phase 2–4 of `specs/work-plans/todo/klaviyo-integration.md`.

| Detail | Value |
|--------|-------|
| Base URL | `https://a.klaviyo.com/api` |
| Auth | `Authorization: Klaviyo-API-Key <key>` (env: `KLAVIYO_API_KEY`) |
| API revision | `2026-04-15` (pinned in `src/lib/klaviyo/client.ts`) |
| Optional env | `KLAVIYO_NEWSLETTER_LIST_ID` — locks the list used for growth metrics; if unset, the cron picks the largest list and warns |
| Client | `src/lib/klaviyo/client.ts` |
| Extract | `src/lib/klaviyo/extract.ts`, cron at `/api/cron/extract-klaviyo` |

### Read endpoints used (Phase 0)

- `POST /api/campaign-values-reports` — per-campaign sends/opens/clicks/conversions/revenue
- `POST /api/flow-values-reports` — per-flow attributed revenue (aggregate)
- `POST /api/metric-aggregates` — daily Subscribed / Unsubscribed event counts
- `GET /api/lists` — list metadata + profile counts
- `GET /api/metrics` — discover the Placed Order conversion metric ID

### Rate limits

Reports endpoints: burst 1/s, steady 2/min, daily 225/req. Daily cron is well under, but the client retries on `429` with `Retry-After`.

### Data written

| Table | Granularity | Populated by |
|-------|-------------|--------------|
| `klaviyo_list_growth_daily` | One row per (date, list_id) | `extractListGrowth` |
| `klaviyo_email_performance` | One row per campaign (upsert on `campaign_id`) | `extractCampaignPerformance` |
| `klaviyo_flow_attribution` | One row per flow per sync (`customer_id` + `order_id` NULL); per-order grain is a Phase 0.5 follow-up | `extractFlowAggregates` |

### Write endpoints used (Phase 2 — campaign drafts)

- `POST /api/templates` + `PATCH /api/templates/{id}` — create or update an `editor_type=CODE` template from compiled MJML
- `POST /api/campaigns` — create a draft email campaign with one inline campaign-message; Klaviyo defaults new campaigns to `draft` status
- `PATCH /api/campaigns/{id}` — update an existing draft campaign in place (idempotency on re-run)
- `POST /api/campaign-message-assign-template` — bind the template into the campaign-message (Klaviyo clones the template; subsequent template edits don't auto-flow, so we re-bind on every run)
- Additional read for idempotency: `GET /api/templates?filter=equals(name,…)`, `GET /api/campaigns?filter=…name…`

Required scopes: `templates:write`, `campaigns:write` (on top of the read scopes above).

### Campaign drafts — workflow

Author one file per campaign in `klaviyo/campaigns/<slug>/`:
- `template.mjml` — the email body in MJML
- `config.yaml` — `subject`, `preview_text` (opt), `from_email`, `from_label`, `reply_to_email` (opt), and `audiences: { included: [...], excluded: [...] }`. Strict Zod schema; unknown keys fail loud.

Deploy as a draft to Klaviyo:

```
npm run klaviyo:campaign:draft <slug>
```

The script (`scripts/klaviyo-draft-campaign.ts`):
1. Validates the slug shape + reads both files.
2. `compileMjml` → HTML + warnings.
3. `injectUtms(html, { campaign: <slug>, content: "blast" })`.
4. Calls `draftCampaign` (`src/lib/klaviyo/draft-campaign.ts`) which upserts the template by name, upserts the campaign by name (PATCH if existing draft, refuse if already sent), and re-binds the template to the campaign-message.
5. Prints the Klaviyo edit URL.

**Hard invariants:**
- The script **never** sends. Klaviyo creates everything in `draft` status; sending is a manual action in Klaviyo's UI.
- Re-running with the same slug updates the existing draft in place — no duplicate campaigns.
- If a campaign with this slug has already been sent in Klaviyo, the script refuses to overwrite it. Rename the slug to iterate.

---

## Judge.me

**Purpose**: Product reviews on the Shopify storefront. Read-only sync of all published reviews so `/funnel/strategy`'s retention-loop section can promote the advocate stage from a 2026-05-26 snapshot count (9) to a live, drift-free count of outfitter customers who've publicly reviewed.

| Detail | Value |
|--------|-------|
| Base URL | `https://judge.me/api/v1` |
| Auth | `api_token` + `shop_domain` query params (env: `JUDGEME_API_TOKEN`, `JUDGEME_SHOP_DOMAIN`) |
| Client | `src/lib/judgeme/client.ts` |
| Extract | `src/lib/judgeme/extract.ts`, cron at `/api/cron/extract-judgeme` (daily 7:45 UTC) |

### Read endpoints used

- `GET /api/v1/reviews?api_token=…&shop_domain=…&page=…&per_page=100` — paginated list of all published reviews

### Data written

| Table | Granularity | Populated by |
|-------|-------------|--------------|
| `review` | One row per (source, external_id); upsert overwrites content fields so edits sync forward | `extractJudgeme` |

### Advocate-stage detection

`getRetentionLoop` joins `review.reviewer_email = customer.email` (lowercased, trimmed). A customer counts as an advocate iff they classify as outfitter (5+ units OR 3+ orders) AND their email matches a reviewer's. No stored advocate flag — recomputed each request so refunds, schema changes, and review syncs all reflect immediately.

### Watchpoints

- Judge.me may rate-limit aggressive pagination. Client sleeps 200ms between pages by default.
- The API exposes only published reviews; unpublished / hidden ones don't sync. Matches the personas.md "110+ reviews" frame which was based on the published CSV export.
- Some Judge.me clients return `rating` as a string; `normalizeReview` handles both numeric and string forms.

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
