#!/usr/bin/env bash
# Wrapper for `backfill:customer-addresses:prod` — pulls prod env from Vercel,
# runs the address backfill against prod with forwarded args (e.g. --b2b), then
# deletes the temp env file regardless of exit status.
#
# Repopulates customer_address from Shopify. Needed once after the neon-http
# db.batch fix (addresses previously never persisted). Idempotent — re-runs are
# delete-and-replace from whatever Shopify has now.
#
#   npm run backfill:customer-addresses:prod -- --b2b   # B2B-linked only (fast)
#   npm run backfill:customer-addresses:prod            # full customer base

set -e
trap 'rm -f .env.production.local' EXIT

npx --yes vercel \
  --global-config ~/.vercel-fitwell \
  env pull .env.production.local \
  --environment=production \
  --yes

dotenv -e .env.production.local -- \
  node --import tsx/esm scripts/backfill-customer-addresses.ts "$@"
