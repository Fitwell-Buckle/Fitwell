# Infrastructure & Environment Setup

## Context
- All integration work plans (Shopify, Google, Meta, Resend, PostHog) depend on having the deployment infrastructure and credentials in place
- This plan covers everything needed to go from "code in a repo" to "running app with a database and auth"
- This is the FIRST work plan to execute — everything else is blocked on it
- Reference: specs/current/architecture.md, specs/current/integrations.md, .env.example

## Dependencies
- GitHub repo exists (done: github.com/orowen/Fitwell)
- Shopify store exists (done: fitwellbuckle.co)
- A separate domain for the admin/marketing app (NOT a subdomain of fitwellbuckle.co — Shopify owns that domain). Check availability of: fitwellbuckle.io, fitwellbuckle.app, fitwellbuckle.dev, fitwell.io, or similar

## Scope

### Included
- NeonDB project and database creation
- Vercel project setup and deployment
- Google Cloud project with OAuth consent screen and credentials
- NextAuth configuration with Google OAuth
- Initial database migration (apply schema)
- Environment variables configured in Vercel
- Domain/subdomain setup for the admin app
- Sentry project creation
- CRON_SECRET for securing cron endpoints
- SSL/HTTPS verification

### Excluded
- Shopify API token (covered in Shopify integration work plan)
- Google service account for analytics APIs (covered in Google integrations work plan)
- PostHog project (covered in PostHog integration work plan)
- Resend account and domain verification (covered in Resend work plan)
- Meta Ads credentials (covered in Meta work plan)

## Implementation Phases

### Phase 1: NeonDB Setup
- [ ] Create NeonDB account/project (or use existing Neon org if one exists)
- [ ] Create a database named "fitwell" in the desired region (us-east-1 recommended for Vercel)
- [ ] Note the connection string (pooled and direct — pooled for the app, direct for migrations)
- [ ] Set DATABASE_URL in .env.local for local development
- [ ] Run `npm run db:generate` to generate initial migration from schema.ts
- [ ] Review the generated migration SQL
- [ ] Run `npm run db:migrate` to apply migration to the database
- [ ] Verify tables exist: connect via Neon console or psql and list tables
- [ ] Confirm all 13 tables created (user, account, session, verification_token, customer, order, order_line_item, utm_attribution, campaign, ga4_daily, gsc_daily, google_ads_daily, posthog_daily, customer_event)

#### Tests
- Manual: connect to DB, run `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`
- Run `npm run check` to verify schema.ts still typechecks after any adjustments

### Phase 2: Vercel Project Setup
- [ ] Create Vercel project linked to github.com/orowen/Fitwell
- [ ] Connect to the main branch for auto-deploy
- [ ] Set framework preset to Next.js
- [ ] Configure environment variables in Vercel dashboard:
  - DATABASE_URL (pooled Neon connection string)
  - AUTH_SECRET (generate with `openssl rand -base64 32`)
  - AUTH_URL (will be set after domain is configured)
  - CRON_SECRET (generate with `openssl rand -base64 32` — used to secure /api/cron/* endpoints)
  - NEXT_PUBLIC_APP_URL (will be set after domain is configured)
- [ ] Trigger initial deploy
- [ ] Verify deploy succeeds and /api/health returns { status: "ok" }
- [ ] Note the default Vercel URL (*.vercel.app) for initial testing

#### Tests
- Manual: visit deployed URL, verify homepage renders
- Manual: hit /api/health, verify JSON response
- Manual: verify cron jobs appear in Vercel dashboard (from vercel.json)

### Phase 3: Domain & DNS Configuration
- [ ] **Decision needed:** Pick a separate domain for this app (fitwellbuckle.co is Shopify — we don't want to conflict with it). Candidates: fitwellbuckle.io, fitwellbuckle.app, fitwellbuckle.dev, fitwell.io, etc. Check availability and register.
- [ ] **Domain strategy note:** Admin dashboard goes on this new domain immediately. SEO landing pages may later be served via subfolder proxy on fitwellbuckle.co for full domain authority inheritance — see specs/ops/domains/growth.md for trade-off analysis. This decision can be deferred until landing pages are ready to ship.
- [ ] Purchase/register the chosen domain
- [ ] Identify the DNS provider (Cloudflare, Namecheap, Route 53, Vercel DNS, etc.)
- [ ] Set up CLI access to the DNS provider for programmatic record management:
  - Cloudflare: `wrangler` CLI or Cloudflare API token
  - Namecheap: API access (requires whitelisted IP + API key)
  - Route 53: AWS CLI with IAM credentials
  - Vercel DNS: `vercel` CLI (if using Vercel as DNS provider — simplest option)
- [ ] Store DNS API credentials in .env.local and document in specs/current/integrations.md
- [ ] Add custom domain in Vercel project settings
- [ ] Configure DNS: add CNAME or A records pointing to Vercel (cname.vercel-dns.com or Vercel IP)
- [ ] Wait for SSL certificate provisioning (automatic via Vercel)
- [ ] Verify HTTPS works on custom domain
- [ ] Update AUTH_URL in Vercel env vars to the custom domain
- [ ] Update NEXT_PUBLIC_APP_URL in Vercel env vars
- [ ] Update .env.example with the production domain as reference
- [ ] Redeploy after env var changes

#### Tests
- Manual: visit custom domain, verify homepage renders over HTTPS
- Manual: verify SSL certificate is valid (check in browser)
- Manual: verify DNS CLI can list/create records programmatically

### Phase 4: Google Cloud OAuth Setup
- [ ] Create Google Cloud project (or use existing one) named "Fitwell Admin"
- [ ] Enable the "Google Identity" / OAuth APIs
- [ ] Configure OAuth consent screen:
  - App name: "Fitwell Admin"
  - User type: External (or Internal if using Google Workspace)
  - Authorized domains: add the custom domain
  - Scopes: email, profile, openid (defaults)
- [ ] Create OAuth 2.0 Client ID:
  - Application type: Web application
  - Authorized redirect URIs: https://{custom-domain}/api/auth/callback/google
  - Also add http://localhost:30100/api/auth/callback/google for local dev
- [ ] Copy Client ID and Client Secret
- [ ] Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in Vercel env vars
- [ ] Set same in .env.local for local development
- [ ] Configure admin email allowlist in src/lib/auth.ts (restrict login to authorized admin emails)
- [ ] Redeploy

#### Tests
- Manual: visit /auth/login, click Google sign-in
- Manual: verify OAuth flow completes and redirects to /dashboard
- Manual: verify non-admin email is rejected (test with a different Google account if available)
- Manual: verify session persists (refresh page, still logged in)

### Phase 5: Sentry Error Tracking
- [ ] Create Sentry project for "fitwell" (Next.js platform)
- [ ] Get DSN from Sentry project settings
- [ ] Set SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT in Vercel env vars
- [ ] Verify src/instrumentation.ts picks up the DSN and initializes
- [ ] Test error reporting: trigger a test error, verify it appears in Sentry dashboard
- [ ] Configure Sentry alert rules (email on new errors)

#### Tests
- Manual: throw a test error in a route, verify it appears in Sentry
- Manual: verify source maps upload (stack traces show original TypeScript)

### Phase 6: Local Development Environment
- [ ] Document complete .env.local setup in a checklist (which values to copy from where)
- [ ] Verify `npm run dev` starts on port 30100 with all env vars set
- [ ] Verify local Google OAuth redirect works (localhost:30100)
- [ ] Verify local DB connection works (can access Neon from local machine)
- [ ] Run `npm run check` — confirm typecheck passes
- [ ] Test the full local flow: start dev → login → see dashboard → hit /api/health
- [ ] Update specs/current/architecture.md with any setup details discovered during this process
- [ ] Update CLAUDE.md if any commands or conventions changed

#### Tests
- Manual: full local dev flow works end-to-end

## Notes
- NeonDB pooled vs direct connection: use pooled (port 5432 with ?sslmode=require) for the app runtime, direct for migrations (drizzle-kit needs direct connections for DDL)
- Vercel environment variables: set separately for Production, Preview, and Development environments if needed
- AUTH_SECRET must be the same across all environments to avoid session invalidation
- Google OAuth: if the consent screen is in "Testing" mode, only test users can log in — publish the app or add admin emails as test users
- CRON_SECRET: Vercel automatically sends this as a bearer token for cron jobs — the /api/cron/* routes must verify it
- CRON_SECRET is not yet listed in .env.example — add it when configuring (between SENTRY_PROJECT and NEXT_PUBLIC_APP_URL)
- Consider setting up Vercel preview deployments for PR review (automatic with Vercel GitHub integration)
- DNS propagation can take up to 48 hours but usually completes within minutes for CNAME records
- Keep .env.local out of git (.gitignore already handles this) — never commit secrets
