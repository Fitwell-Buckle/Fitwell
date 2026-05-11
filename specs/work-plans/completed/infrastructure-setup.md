# Infrastructure & Environment Setup ✅

Completed 2026-05-11.

## What was set up

- **NeonDB**: Project `quiet-cell-94455140` in `aws-us-east-1`, 14 tables migrated, dev branching (`greg-dev`, others as needed)
- **Vercel**: Project `fitwellbuckle/fitwell`, auto-deploy from main, env vars configured (DATABASE_URL, AUTH_SECRET, CRON_SECRET, AUTH_URL, NEXT_PUBLIC_APP_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ADMIN_EMAILS)
- **Domain**: `admin.fitwellbuckle.co` — A record pointing to Vercel (76.76.21.21), SSL auto-provisioned
- **Google OAuth**: Cloud project with OAuth 2.0 client, redirect URIs for production + localhost, admin emails locked to greg@, tom@, oliver@fitwellbuckle.co
- **Vercel CLI**: Separate config at `~/.vercel-fitwell` for greg@fitwellbuckle.co account, `npm run vc` alias
- **Local dev**: Verified working — dev server, Google OAuth, Neon dev branch

## Descoped

- **Sentry**: Not needed for an admin-only app with 3 users. Can revisit if we add public-facing features.
