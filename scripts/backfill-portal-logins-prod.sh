#!/usr/bin/env bash
# Wrapper for `backfill:portal-logins:prod` — pulls prod env from Vercel,
# runs the backfill script against prod with forwarded args (e.g. --apply),
# then deletes the temp env file regardless of exit status.

set -e
trap 'rm -f .env.production.local' EXIT

npx --yes vercel \
  --global-config ~/.vercel-fitwell \
  env pull .env.production.local \
  --environment=production \
  --yes

dotenv -e .env.production.local -- \
  node --import tsx/esm scripts/backfill-portal-logins.ts "$@"
