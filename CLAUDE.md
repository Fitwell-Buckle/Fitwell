# Fitwell Buckle Co.

Admin dashboard, analytics pipeline, and marketing pages for Fitwell Buckle Co. precision micro-adjust watch buckles.

## Tech Stack

Next.js 15 (App Router) | TypeScript | Drizzle ORM | NeonDB (Postgres) | Vercel | PostHog | GA4 | Google Ads | Shopify integration

## Commands

```bash
npm run dev          # Dev server on port 30100 (Turbopack)
npm run build        # Production build
npm run check        # tsc --noEmit && vitest run (~2s)
npm run test         # vitest run
npm run test:e2e     # Playwright (e2e/playwright.config.ts)
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply migrations
npm run db:studio    # Drizzle Studio (browser UI)
npm run vc           # Vercel CLI (uses ~/.vercel-fitwell config)
```

## Vercel

- Project: https://vercel.com/fitwellbuckle/fitwell
- Production URL: https://admin.fitwellbuckle.co (fallback: https://fitwell-ashy.vercel.app)
- Vercel CLI uses a separate config dir (`~/.vercel-fitwell`) for the greg@fitwellbuckle.co account. All `vercel` commands in this repo should use `npm run vc` or `vercel --global-config ~/.vercel-fitwell`.

## Path Alias

`@/*` maps to `./src/*`

## Full Context

Read **AGENTS.md** for context-loading rules, critical invariants, and session protocol.
