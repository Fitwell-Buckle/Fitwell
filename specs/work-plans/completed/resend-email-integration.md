# Resend Email Integration

**Status: shipped 2026-05-27.** Transactional email live in production. The
original "v1 scope" of digest/analytics emails is deferred (low priority
until the analytics pipeline is feeding data); what shipped:

- Magic-link sign-in for the supplier portal (`src/lib/email/magic-link.ts`)
- PO handoff + activity notifications (`src/lib/production/notifications.ts`)
- B2B invoice send (`src/app/api/invoices/[id]/send`)
- Production deadline-alert cron

Env: `RESEND_API_KEY` + `EMAIL_FROM="Fitwell Buckle Co. <info@portal.fitwellbuckle.co>"`
on the verified `portal.fitwellbuckle.co` domain. Senders gracefully fall back
to `console.log` when `RESEND_API_KEY` is unset (dev mode). See
`specs/current/integrations.md` → Resend for the live-state details.

Below is the original plan, preserved for context.

---

## Context
- We need transactional email capabilities for the admin platform: alerts, reports, and operational notifications
- Resend is our email provider (already in deps) with React Email for templates
- Shopify handles order confirmation and shipping emails — this covers everything else
- Reference: specs/current/integrations.md, specs/current/architecture.md

## Dependencies
- Resend account created with API key
- Domain verified for sending (fitwellbuckle.co or admin.fitwellbuckle.co)
- Env vars: RESEND_API_KEY, EMAIL_FROM

## Scope

### Included
- Resend client wrapper with error handling
- React Email templates for admin notifications
- Daily analytics digest email (summary of key metrics)
- Alert emails (sync failures, anomalous data, health check failures)
- Admin welcome/invite email
- Weekly performance report email

### Excluded
- Marketing email campaigns (Shopify/Klaviyo handles these)
- Customer-facing emails (Shopify handles order confirmations, shipping, etc.)
- Email list management or subscriptions
- Email tracking/analytics (use Resend's built-in dashboard)

## Implementation Phases

### Phase 1: Resend Client & Base Templates
- [ ] Configure Resend client in src/lib/email/resend.ts with RESEND_API_KEY
- [ ] Build sendEmail() wrapper with error handling, retry on 429, and logging
- [ ] Install react-email and @react-email/components as dev dependencies
- [ ] Create base email layout template (src/emails/layout.tsx) with Fitwell branding (clean, minimal — matching the precision/engineering brand)
- [ ] Create a test email template and verify sending works

#### Tests
- Unit: email client error handling (mock Resend API)
- Manual: send test email, verify delivery and rendering

### Phase 2: Admin Alert Emails
- [ ] Create alert email template (src/emails/alert.tsx) — severity level (urgent/warn/info), title, message, action link
- [ ] Create sync failure alert template — details of which sync failed, error message, last successful sync time
- [ ] Hook into /api/cron/health — send alert email when health check detects issues
- [ ] Hook into Shopify sync — send alert on consecutive sync failures (3+ in a row, not every single one)
- [ ] Add admin email recipients config (env var or DB setting: ADMIN_ALERT_EMAILS)
- [ ] Rate limit alerts: max 1 email per alert type per hour to avoid flooding

#### Tests
- Unit: alert dedup/rate limiting logic
- Unit: consecutive failure counting

### Phase 3: Analytics Digest Email
- [ ] Create daily digest template (src/emails/daily-digest.tsx) — key metrics summary:
  - Orders today / revenue today vs yesterday
  - New customers today
  - Top traffic sources (from GA4)
  - Ad spend today + ROAS (from Google Ads / Meta)
  - Any notable search queries (from GSC)
- [ ] Create /api/cron/send-digest route — runs daily at 8 AM UTC
- [ ] Add cron schedule to vercel.json
- [ ] Query staging tables for yesterday's data, format into email
- [ ] Make digest configurable (which sections to include, recipients)

#### Tests
- Unit: digest data aggregation queries
- Manual: verify email renders correctly with real data

### Phase 4: Weekly Report Email
- [ ] Create weekly report template (src/emails/weekly-report.tsx) — week-over-week comparison:
  - Revenue this week vs last week (% change)
  - Orders and AOV trends
  - Customer acquisition by channel
  - Ad spend and ROAS by platform
  - Top performing search queries
  - Notable trends or anomalies
- [ ] Create /api/cron/send-weekly-report route — runs Monday 9 AM UTC
- [ ] Add cron schedule to vercel.json

#### Tests
- Unit: week-over-week calculation logic
- Manual: verify email rendering

## Notes
- Resend free tier: 100 emails/day, 3,000/month — more than enough for admin notifications
- React Email templates should be simple and clean — no heavy HTML, just data presentation
- Always include an unsubscribe mechanism even for admin emails (Resend requires it)
- Consider adding email send logging to DB for audit trail (who received what, when)
- Domain verification: add Resend's DNS records (SPF, DKIM, DMARC) to fitwellbuckle.co
- If using a subdomain (admin.fitwellbuckle.co), it won't affect Shopify's email deliverability
- The digest and report emails depend on analytics staging tables being populated — these features only work after Google integrations are live
