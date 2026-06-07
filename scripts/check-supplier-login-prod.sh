#!/usr/bin/env bash
# Wrapper for `check:supplier-login:prod` — pulls prod env from Vercel, runs
# the diagnostic script against prod with forwarded args, then deletes the
# temp env file regardless of exit status.
#
# Needs its own shell file because npm's `--` arg-forwarding appends to the
# tail of the script string; without a wrapper, args land on the cleanup
# `rm` instead of on the node script.

set -e
trap 'rm -f .env.production.local' EXIT

npx --yes vercel \
  --global-config ~/.vercel-fitwell \
  env pull .env.production.local \
  --environment=production \
  --yes

dotenv -e .env.production.local -- \
  node --import tsx/esm scripts/check-supplier-login.ts "$@"
