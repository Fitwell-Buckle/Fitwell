# Fitwell Buckle Co. — Agent Playbook

## 1. Project Overview

Fitwell Buckle Co. makes precision micro-adjust watch buckles. The Shopify store at fitwellbuckle.co handles e-commerce (catalog, cart, checkout, fulfillment). This repository handles everything around it:

- **Admin dashboard** — order analytics, customer insights, campaign performance
- **Analytics pipeline** — ETL cron jobs pulling from Shopify, GA4, Google Ads, GSC, PostHog
- **Marketing pages** — landing pages, campaign destinations, SEO content
- **Attribution engine** — connecting ad spend to orders through multi-touch attribution

Tech stack: Next.js 15 (App Router), TypeScript, Drizzle ORM, NeonDB, Vercel, PostHog, GA4, Google Ads, Shopify integration.

---

## 2. Context-Loading Table

Before starting work, read the relevant specs. This prevents re-inventing decisions that have already been made.

| Trigger | Read First |
|---------|------------|
| Adding a new admin section | `specs/current/contributing.md` |
| Changing database schema | `specs/current/schema.md` + `specs/current/contributing.md` (Schema Rules) |
| Adding/modifying API routes | `specs/current/routes.md` + `specs/current/contributing.md` (API Routes) |
| Shopify integration work | `specs/current/integrations.md` (Shopify section) |
| Analytics or tracking changes | `specs/current/integrations.md` + `specs/current/data-flows.md` |
| UI components | `specs/current/components.md` + `specs/current/contributing.md` (UI Components) |
| Adding marketing pages | `specs/current/routes.md` + `(marketing)` route group |
| Cron job changes | `specs/current/scheduled-jobs.md` + `vercel.json` |
| Deciding what to work on | `specs/ops/PRIORITIES.md` |
| Strategic context | `specs/ops/MISSION.md` + `specs/ops/SCORECARD.md` |
| Data sync behavior | `specs/invariants/data-sync.md` |
| Attribution logic | `specs/invariants/attribution.md` |

---

## 3. Critical Rules

1. **DO NOT commit or push** unless the user explicitly asks.
2. **Everyone works directly on `main`** — no feature branches or PRs. There are three contributors (Greg, Tom, Oliver), each with their own Neon database branch. Push when you have changes you're happy with. Pull before starting work (see Session Protocol).
3. **Read specs before building** — don't reinvent what's already been decided. Start with `specs/current/contributing.md` for new sections.
4. **Discuss major decisions with Greg before implementing** — new database tables, new external integrations, structural changes, and data model choices that affect multiple sections. See `specs/current/contributing.md` for the full list.
5. **One shared schema** — all tables live in `src/lib/schema.ts`. Reuse existing entities (`customer`, `order`, `order_line_item`, `campaign`) rather than creating parallel tables. FK into existing tables instead of duplicating data.
6. **All Shopify data sync must be idempotent** — use `shopify_id` as the dedup key.
7. **Never store raw payment/card data** — Shopify handles checkout entirely.
8. **Admin routes require authentication** — always check session via NextAuth.
9. **Marketing pages are public** — no auth required.
10. **Update docs with every major change** — when adding pages, tables, routes, or nav items, update the relevant specs (`specs/current/schema.md`, `specs/current/routes.md`, `specs/current/components.md`, etc.) in the same PR. These files render in the admin UI at `/docs` and are the team's shared reference. Don't let them drift.
11. **Tests ship in the same phase as code** — never defer testing to a later phase.
12. **Never use auto-memory for project state.** Blockers, follow-ups, decisions, technical context, and anything another team member might need must go into checked-in files (`specs/ops/PRIORITIES.md`, domain files, work plans, `AGENTS.md`). Auto-memory is invisible to other users and other machines. Only use it for genuinely user-personal preferences (collaboration style, not project facts).

---

## 4. Session Protocol

### Start of session
1. **Sync with main** — pull the latest changes before doing anything else. If there are uncommitted local changes, stash them first, pull, then reapply:
   ```bash
   git stash          # only if there are uncommitted changes
   git pull --rebase
   git stash pop      # only if you stashed
   ```
   If the stash pop conflicts, help the user resolve before proceeding.
2. **Check for pending migrations** — compare the migration files on disk against what's been applied to the local dev database:
   ```bash
   ls drizzle/migrations/*.sql   # see what migrations exist
   npm run db:migrate             # apply any unapplied migrations to local dev DB
   ```
   If new migration files arrived from the pull, tell the user what changed (e.g. "New migration adds columns X, Y to table Z — applied to your dev database").
3. Read `specs/ops/PRIORITIES.md`
4. Propose a focus area based on current priorities
5. Load relevant specs from the context-loading table

### End of session
1. Update `specs/ops/PRIORITIES.md` with dates, progress, and next steps
2. If a work plan was active, update its status

---

## 5. Work Plan Lifecycle

Work plans live in `specs/work-plans/` and follow this structure:

```
## Context
Why this work matters and what triggered it.

## Dependencies
Specs, services, or prior work this depends on.

## Scope
What's in and what's explicitly out.

## Implementation Phases

### Phase 1: [name]
- [ ] Task
- [ ] Task
- [ ] Tests for this phase

### Phase 2: [name]
- [ ] Task
- [ ] Tests for this phase

## Notes
Open questions, risks, alternatives considered.
```

### Lifecycle:
- **Create** in `specs/work-plans/todo/` with a descriptive filename
- **Work** through phases, checking off tasks as completed
- **Complete** by moving to `specs/work-plans/completed/` and adding an entry to `specs/ops/releases.yaml`

---

## 6. Database Rules

- **ORM**: Drizzle ORM for all queries — no raw SQL unless Drizzle cannot express it.
- **Schema source of truth**: `src/lib/schema.ts`
- **Generated reference**: `specs/generated/schema-reference.md` (when it exists)
- **Migration output**: `drizzle/migrations/`

### Migration workflow (for the person making the schema change):
1. Edit `src/lib/schema.ts`
2. `npm run db:generate` — creates migration SQL in `drizzle/migrations/`
3. Review the generated migration file
4. `npm run db:migrate` — apply to your local dev DB
5. Test thoroughly
6. Commit the schema change + migration file together, push to main
7. Apply migration to production before Vercel deploys the new code

### Receiving migrations (for everyone else):
When you pull and see new files in `drizzle/migrations/`, run `npm run db:migrate` to apply them to your local dev DB. The session startup protocol handles this automatically.

**Never run `drizzle-kit push` against production.** Always use the generate/migrate workflow.

### Neon database branches:

The project uses Neon branching to isolate environments. Each developer gets their own copy-on-write branch forked from production.

| Branch | Endpoint | Used by |
|---|---|---|
| `production` | `ep-divine-field-aqvgidm6` | Vercel production + preview deploys |
| `greg-dev` | `ep-solitary-dawn-aqdv9xxi` | Greg's local dev |
| `tom-dev` | (create before first session) | Tom's local dev |
| `oliver-dev` | (create before first session) | Oliver's local dev |

- **Neon project ID**: `quiet-cell-94455140`
- **Neon org ID**: `org-fancy-night-97982234`
- **Local `.env.local`** should point to your personal dev branch, never production
- **Vercel `DATABASE_URL`** points to the production branch (pooled endpoint: `ep-divine-field-aqvgidm6-pooler`)
- Create a new dev branch: `npx neonctl branches create --project-id quiet-cell-94455140 --org-id org-fancy-night-97982234 --name <name>-dev --parent production`
- Migrations: apply to your dev branch first, verify, then apply to production before deploying

---

## 7. Shopify Integration Rules

- **Webhook verification**: All incoming webhooks verified via HMAC-SHA256 using `SHOPIFY_WEBHOOK_SECRET`.
- **Sync is additive**: Never delete Shopify-sourced records. Update existing or soft-delete (set a `deleted_at` timestamp).
- **Dedup key**: `shopify_id` fields are unique indexes — use upsert patterns.
- **Money in cents**: Order amounts stored as integers (cents), not floats.
- **Customer refresh**: Customer data is refreshed on every order webhook — the latest order always carries the freshest customer info.
- **Cron extraction**: The `extract-shopify` cron runs every 2 hours (`vercel.json`) as a catch-all for missed webhooks.

---

## 8. Code Conventions

- **Path alias**: `@/*` maps to `./src/*`
- **API responses**: Return `{ data }` on success or `{ error }` on failure with appropriate HTTP status codes.
- **Input validation**: Zod for all external input (API request bodies, query params, webhook payloads).
- **Components**: Server components by default; add `'use client'` only when the component needs browser APIs or interactivity.
- **Styling**: Tailwind CSS for layout and styling, Radix UI for interactive primitives (dialog, dropdown, select, tabs, tooltip).
- **Utilities**: `clsx` + `tailwind-merge` via a `cn()` helper for conditional class names.
- **Icons**: Lucide React.
- **Charts**: Recharts.
- **Notifications**: Sonner for toast notifications.
- **Error tracking**: Sentry (`@sentry/nextjs`).
- **Auth**: NextAuth v5 with Drizzle adapter.
- **Email**: Resend for transactional email.

---

## 9. Testing

### Tiers
- **Tier 1 (fast, ~2s)**: `npm run check` — TypeScript compilation + Vitest unit tests
- **Tier 2 (full)**: `npm run test:e2e` — Playwright end-to-end tests

### What goes where
- Pure logic and utilities → unit test in `src/**/*.test.ts`
- API routes → integration test (test request/response cycle)
- User flows → Playwright spec in `e2e/tests/`

### Rules
- Every implementation phase includes its tests — never defer.
- Run `npm run check` before considering any phase complete.

---

## 10. Deployment

- **Platform**: Vercel, auto-deploys from `main` branch on every push.
- **Workflow**: Everyone works on `main`, pushes when ready. Vercel deploys automatically.
- **Cron jobs**: Defined in `vercel.json` — health check (every 4h), Shopify extract (every 2h), GA4/Google Ads/GSC extract (daily morning), PostHog extract (every 3h).
- **Environment variables**: Managed in Vercel dashboard, mirrored in `.env.example` for local dev.
- **Database migrations**: Applied manually to production before deploy. When pushing code with new migrations, apply to production first, then push (Vercel deploys immediately on push).
- **Speed insights**: `@vercel/speed-insights` included for performance monitoring.
