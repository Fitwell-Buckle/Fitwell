# Fitwell Buckle Co. — Agent Playbook

> **Editing this file?** Read `how-agents-md-works.md` first — it covers the `@` import mechanism and when to hard-load a doc vs. link it via the context-loading table.

## 1. Project Overview

Fitwell Buckle Co. makes precision micro-adjust watch buckles. The Shopify store at fitwellbuckle.co handles e-commerce (catalog, cart, checkout, fulfillment). This repository handles everything around it:

- **Admin dashboard** — order analytics, customer insights, campaign performance
- **Analytics pipeline** — ETL cron jobs pulling from Shopify, GA4, Google Ads, GSC, PostHog
- **Marketing pages** — landing pages, campaign destinations, SEO content
- **Attribution engine** — connecting ad spend to orders through multi-touch attribution

Tech stack: Next.js 15 (App Router), TypeScript, Drizzle ORM, NeonDB, Vercel, PostHog, GA4, Google Ads, Shopify integration.

---

## 2. Commands

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

Path alias: `@/*` maps to `./src/*`.

---

## 3. Context-Loading Table

Before starting work, read the relevant specs. This prevents re-inventing decisions that have already been made.

| Trigger | Read First |
|---------|------------|
| Adding a new admin section | `specs/current/contributing.md` |
| Changing database schema | `specs/current/schema.md` + `specs/current/contributing.md` (Schema Rules) |
| Adding/modifying API routes | `specs/current/routes.md` + `specs/current/contributing.md` (API Routes) |
| Shopify integration work | `specs/current/integrations.md` (Shopify section) |
| Changing Shopify scopes, embed flag, or anything in `shopify.app.toml` | `specs/current/shopify-app-config.md` |
| Analytics or tracking changes | `specs/current/integrations.md` + `specs/current/data-flows.md` |
| UI components | `specs/current/components.md` + `specs/current/contributing.md` (UI Components) |
| Adding marketing pages | `specs/current/routes.md` + `(marketing)` route group |
| Cron job changes | `specs/current/scheduled-jobs.md` + `vercel.json` |
| Deciding what to work on | `specs/ops/PRIORITIES.md` |
| Strategic context | `specs/ops/MISSION.md` + `specs/ops/SCORECARD.md` |
| Data sync behavior | `specs/invariants/data-sync.md` |
| Attribution logic | `specs/invariants/attribution.md` |
| Writing marketing copy or landing pages | `specs/strategy/personas.md` + `specs/strategy/funnel.md` + `specs/strategy/landing-page-goals.md` |
| Adding/modifying PostHog event tracking | `specs/strategy/event-taxonomy.md` + `specs/strategy/funnel.md` |
| Designing an A/B test or experiment | `specs/strategy/hypotheses.md` |
| Persona, positioning, or audience questions | `specs/strategy/personas.md` |
| Ad campaign creative or targeting | `specs/strategy/personas.md` + `specs/strategy/funnel.md` + `specs/strategy/hypotheses.md` |
| Adding or sizing a new acquisition channel | `specs/strategy/funnel.md` (Channel Entry Points) |
| B2B / wholesale outreach, sales pipeline, or partnership work | `specs/strategy/b2b-pipeline.md` + `specs/strategy/personas.md` (B-section) |
| Retention sequences, post-purchase email, outfitting campaigns | `specs/strategy/retention-loop.md` + `specs/strategy/personas.md` |
| Creator program / advocate outreach | `specs/strategy/creator-program.md` + `specs/strategy/creator-scoring.md` + `specs/strategy/retention-loop.md` (`advocate` stage) + `specs/strategy/personas.md` (Outfitter-reviewers table) |
| Anything that touches the current 360 campaign iteration (offer stack, paid channels, landing pages, content sprint, email, creator program — they share a current campaign plan that iterates over time) | `specs/strategy/360-campaign.md` (and the durable framework docs it consumes) |

---

## 4. Critical Rules

1. **DO NOT commit or push** unless the user explicitly asks.
2. **Before any commit or push, run the migration pre-flight check.** Inspect `git status` and `git diff --staged --name-only` (plus `git log @{u}..HEAD --name-only` before a push) for two soft-block conditions. If either is true, **stop and ask the user before proceeding** — explain *why* so they can make an informed call, don't just block silently:
   - **Schema edited without a generated migration** — `src/lib/schema.ts` is modified/staged but `drizzle/migrations/` has no new file. The schema file is the source of truth, but the database only knows about the generated SQL. Committing one without the other guarantees a code/DB mismatch for the next person who pulls. Ask: *"Should I run `npm run db:generate` first?"*
   - **New migration file in the change about to be pushed** — a `drizzle/migrations/*.sql` is staged, or sits in unpushed commits. Vercel auto-deploys from `main` the instant the push lands, so if the migration isn't already applied to the production Neon branch, the new code hits a database without the new columns/tables → production 500s until someone runs it manually. Before pushing, run `npm run db:pending:prod` to check — it pulls the prod env from Vercel, queries `drizzle.__drizzle_migrations`, and lists anything unapplied (exit 0 = clean, exit 1 = pending). If pending, ask: *"X migration(s) aren't applied to prod yet — should I run `npm run db:migrate:prod` first?"* Don't push until prod is at parity with the migrations being pushed.
3. **Everyone works directly on `main`** — no feature branches or PRs. There are three contributors (Greg, Tom, Oliver), each with their own Neon database branch. Push when you have changes you're happy with. Pull before starting work (see Session Protocol).
4. **Read specs before building** — don't reinvent what's already been decided. Start with `specs/current/contributing.md` for new sections.
5. **Discuss major decisions with Greg before implementing** — new database tables, new external integrations, structural changes, and data model choices that affect multiple sections. See `specs/current/contributing.md` for the full list.
6. **One shared schema** — all tables live in `src/lib/schema.ts`. Reuse existing entities (`customer`, `order`, `order_line_item`, `campaign`) rather than creating parallel tables. FK into existing tables instead of duplicating data.
7. **All Shopify data sync must be idempotent** — use `shopify_id` as the dedup key.
8. **Never store raw payment/card data** — Shopify handles checkout entirely.
9. **Admin routes require authentication** — always check session via NextAuth.
10. **Marketing pages are public** — no auth required.
11. **Update docs with every major change** — when adding pages, tables, routes, or nav items, update the relevant specs (`specs/current/schema.md`, `specs/current/routes.md`, `specs/current/components.md`, etc.) in the same PR. These files render in the admin UI at `/docs` and are the team's shared reference. Don't let them drift.
12. **Tests ship in the same phase as code** — never defer testing to a later phase.
13. **Never use auto-memory for project state.** Blockers, follow-ups, decisions, technical context, and anything another team member might need must go into checked-in files (`specs/ops/PRIORITIES.md`, domain files, work plans, `AGENTS.md`). Auto-memory is invisible to other users and other machines. Only use it for genuinely user-personal preferences (collaboration style, not project facts).
14. **Marketing work runs on the persona × funnel framework.** Every landing page, ad campaign, and PostHog event must declare a target persona and funnel stage. If you can't answer "which persona, which stage" for what you're about to build, read `specs/strategy/` first. Untagged events and unanchored pages create noise we can't analyze later.

---

## 5. Marketing & Funnel Framework

All marketing work — pages, copy, ads, tracking — sits on a shared persona × funnel matrix. Personas describe *who*; funnel stages describe *where they are in their journey*. Every artifact targets a specific cell.

The framework has a **durable conceptual layer** (the flow docs and registries below) plus a **current marketing iteration** (the active 360 campaign). The 360 cycles iterate as marketing plans (v3, v4, v5…); the framework docs evolve incrementally as data lands and outlive any single campaign.

**Current marketing iteration:**
- **`specs/strategy/360-campaign.md`** — the *active* 360 campaign. Names the current workstreams (offer stack, creator program, destination pages, content sprint, email, paid channels), decisions, sequencing, engineering scope, and measurement framework. Iterates — future versions will replace or restructure this doc. Each iteration consumes the framework docs below; learnings from each iteration feed back into them.

**Durable framework — flow docs:**
- **`specs/strategy/personas.md`** — current personas (P1–P5 consumer, B1–B6 B2B) + validated segment distribution from the Nov 2025–May 2026 D2C cohort.
- **`specs/strategy/funnel.md`** — D2C acquisition funnel. Six stages (`unaware`→`converting`), channel entry points as first-class objects with journey roles (introducer/accelerator/closer/all-purpose), per-persona expected paths.
- **`specs/strategy/b2b-pipeline.md`** — B2B sales pipeline. Sales-CRM stages (`prospect`→`partnership`), B2B-specific entry channels, per-B-persona pipeline paths.
- **`specs/strategy/retention-loop.md`** — post-purchase outfitting and advocacy. Loop stages (`first_buyer`→`advocate`), retention channels, per-persona outfitting patterns. Closes back into the funnel via advocacy outputs.

**Durable framework — supporting registries and programs:**
- **`specs/strategy/event-taxonomy.md`** — PostHog event names, each tagged with `(persona_hint, funnel_stage)`. Naming must be consistent across the site.
- **`specs/strategy/hypotheses.md`** — beliefs we hold vs. claims we want to validate, with test cost and status. Drives where we spend on variation testing.
- **`specs/strategy/landing-page-goals.md`** — every marketing page declares its target persona, funnel stage, and (if applicable) which hypothesis it's testing.
- **`specs/strategy/vocabulary-map.md`** — distinctive language per persona from the Judge.me review corpus.
- **`specs/strategy/creator-program.md`** — creator-management system work plan (schema, outreach pipeline, sample tracking, post detection). Powers Workstream 2 of the 360 campaign.
- **`specs/strategy/creator-scoring.md`** — scoring methodology (watch_score, fit_score, cross_platform_fit) used by the creator import + stats refresh.

When in doubt: read `360-campaign.md` for the current campaign context, then persona first, then which flow (funnel / pipeline / retention loop), then which stage, then build. The 360 tells you *what we're doing right now*; the framework docs tell you *how everything is supposed to fit together regardless of which iteration we're in*.

---

## 6. Session Protocol

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

## 7. Work Plan Lifecycle

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

## 8. Database Rules

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
6. **Apply the migration to production first**: `npm run db:migrate:prod`. This pulls the production env from Vercel (`vercel env pull --environment=production`), runs `drizzle-kit migrate` against it, and removes the temp env file. Do this *before* the push, not after — Vercel deploys the moment the push lands, so any gap is a window where production is serving 500s.
7. Commit the schema change + migration file together, push to main.

For destructive migrations (drop column/table, rename, NOT NULL on existing column), the pre-apply order breaks currently-deployed code that still references the old shape. Use expand/contract: ship the additive migration + new code first, then a follow-up migration removes the old shape after the new code is live. Discuss with Greg before pushing a destructive migration.

### Migration status commands:
- `npm run db:pending` — read-only check against your dev branch. Lists any migration files on disk not yet applied. Exit 0 = clean, exit 1 = pending.
- `npm run db:pending:prod` — same check against production. Pulls prod env from Vercel into a temp `.env.production.local`, queries `drizzle.__drizzle_migrations`, then deletes the temp file. Safe to run as often as you want — read-only.

Both scripts compare `drizzle/migrations/meta/_journal.json` against rows in `drizzle.__drizzle_migrations`. They assume migrations are applied in journal order (which Drizzle guarantees) and that migrations are append-only (don't edit or delete migration files after they've shipped).

### Pre-commit / pre-push gate (Critical Rule 2):
Before any commit or push that touches `src/lib/schema.ts` or `drizzle/migrations/`, the agent must soft-block and confirm with the user. See Critical Rule 2 in §4 for the exact conditions and prompts. Don't skip this — it exists because the team has been bitten by both code/migration-out-of-sync commits and push-before-apply prod outages.

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

## 9. Shopify Integration Rules

- **App config in code**: Shopify app configuration (scopes, embed flag, app URL, declared webhook topics) lives in `shopify.app.toml` at the repo root. Edit like any other file; Greg deploys via the Shopify CLI from his laptop after merge. Never make app-config changes directly in the Shopify Dev Dashboard — they'll be overwritten on the next deploy. **Full workflow in `specs/current/shopify-app-config.md`** — read it before changing scopes or anything else in the toml.
- **Not embedded**: The app runs standalone at `admin.fitwellbuckle.co`, not inside the Shopify Admin iframe (`embedded = false` in the toml, `frame-ancestors 'none'` in `next.config.ts`). Flipping either requires wiring App Bridge + Shopify session token auth — discuss with Greg before attempting.
- **Webhook verification**: All incoming webhooks verified via HMAC-SHA256 using `SHOPIFY_WEBHOOK_SECRET`.
- **Sync is additive**: Never delete Shopify-sourced records. Update existing or soft-delete (set a `deleted_at` timestamp).
- **Dedup key**: `shopify_id` fields are unique indexes — use upsert patterns.
- **Money in cents**: Order amounts stored as integers (cents), not floats.
- **Customer refresh**: Customer data is refreshed on every order webhook — the latest order always carries the freshest customer info.
- **Cron extraction**: The `extract-shopify` cron runs every 2 hours (`vercel.json`) as a catch-all for missed webhooks.

---

## 10. Code Conventions

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

## 11. Testing

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

## 12. Deployment

- **Platform**: Vercel, auto-deploys from `main` branch on every push.
- **Project**: https://vercel.com/fitwellbuckle/fitwell
- **Production URL**: https://admin.fitwellbuckle.co (fallback: https://fitwell-ashy.vercel.app)
- **Vercel CLI**: uses a separate config dir (`~/.vercel-fitwell`) for the greg@fitwellbuckle.co account. All `vercel` commands in this repo must use `npm run vc` or `vercel --global-config ~/.vercel-fitwell`.
- **Workflow**: Everyone works on `main`, pushes when ready. Vercel deploys automatically.
- **Cron jobs**: Defined in `vercel.json` — health check (every 4h), Shopify extract (every 2h), GA4/Google Ads/GSC extract (daily morning), PostHog extract (every 3h).
- **Environment variables**: Managed in Vercel dashboard, mirrored in `.env.example` for local dev.
- **Database migrations**: Applied manually to production before deploy. When pushing code with new migrations, apply to production first, then push (Vercel deploys immediately on push).
- **Speed insights**: `@vercel/speed-insights` included for performance monitoring.
