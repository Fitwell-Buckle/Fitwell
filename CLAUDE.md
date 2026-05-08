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
```

## Path Alias

`@/*` maps to `./src/*`

## Full Context

Read **AGENTS.md** for context-loading rules, critical invariants, and session protocol.
