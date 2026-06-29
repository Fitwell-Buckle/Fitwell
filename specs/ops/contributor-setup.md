# Contributor Setup

Last updated: 2026-05-27

First-time setup for a new contributor machine. Covers every service the platform touches plus the CLIs you'll log in to. Assumes you're one of the three contributors (Oliver, Tom, Greg) — all three have (or should have) access to everything below.

## Quick checklist

- [ ] §1 GitHub — clone repo, push works
- [ ] §2 Node / npm — version 20+, `npm install`, `npm run check` passes
- [ ] §3 Vercel CLI — `npm run vc whoami` returns your email
- [ ] §4 Neon CLI + dev branch — your `<name>-dev` branch exists and you can connect
- [ ] §5 Shopify Partners CLI — `shopify app versions list` shows Fitwell Admin versions
- [ ] §6 Shopify Store admin — you can log into `fitwell-buckles.myshopify.com/admin`
- [ ] §7 Local `.env.local` — populated with your dev `DATABASE_URL` and pulled Vercel secrets
- [ ] `npm run dev` boots on `http://localhost:30100`

If a step fails, see the per-service notes below.

## Current access (as of 2026-05-27)

| Service | Oliver | Tom | Greg | Granted by |
|---|---|---|---|---|
| GitHub (`Fitwell-Buckle/Fitwell`) | write | write | write | Repo admin |
| Vercel project (`fitwellbuckle/fitwell`) | Member | Member | Member | Greg |
| Neon org (`org-fancy-night-97982234`) | Member | Member | Member | Greg |
| Shopify Partners org (owns "Fitwell Admin" app) | Developer | Developer | Owner | Greg |
| Shopify Store (`fitwell-buckles.myshopify.com`) | Store owner | Administrator | Administrator | Oliver |

If you don't have one of these, ask the listed grantor.

---

## 1. GitHub

```bash
git clone git@github.com:Fitwell-Buckle/Fitwell.git
cd Fitwell
npm install
```

Verify: `git push --dry-run` returns no permission error.

If denied: ask the repo admin to add you as a collaborator with write access.

## 2. Node / npm

Node 20+ required.

```bash
node --version    # >= 20
npm install
npm run check     # tsc + vitest, ~2s — passes on a fresh clone
```

If you don't have Node, use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm).

## 3. Vercel CLI

Project uses a per-project config dir (`~/.vercel-fitwell`) so logging in here doesn't disturb other Vercel projects on your machine. All `vercel` commands go through the `npm run vc` alias (defined in `package.json`).

```bash
npm install -g vercel
npm run vc login          # opens browser
npm run vc link           # pick fitwellbuckle / fitwell when prompted
```

Verify:
```bash
npm run vc whoami         # prints your email
```

If your account isn't in the Vercel project, ask Greg to invite you to the `fitwellbuckle` team.

## 4. Neon CLI + your dev branch

Each contributor gets a copy-on-write branch off production, named `<name>-dev` (`greg-dev`, `tom-dev`, `oliver-dev`). You only run schema migrations against your own branch; production is migrated separately (AGENTS.md §8).

```bash
npx neonctl auth          # opens browser
npx neonctl branches list \
  --project-id quiet-cell-94455140 \
  --org-id org-fancy-night-97982234
```

If your `<name>-dev` branch doesn't exist yet, create it:
```bash
npx neonctl branches create \
  --project-id quiet-cell-94455140 \
  --org-id org-fancy-night-97982234 \
  --name <name>-dev \
  --parent production
```

Get its connection string (you'll paste this into `.env.local` in §7):
```bash
npx neonctl connection-string <name>-dev \
  --project-id quiet-cell-94455140 \
  --org-id org-fancy-night-97982234
```

If you can't see the org: ask Greg to invite you to `org-fancy-night-97982234`.

## 5. Shopify Partners CLI

Two distinct Shopify accesses — Partners (this section) and Store admin (§6). Partners membership is what lets you run `shopify app deploy` / `shopify app release` against the "Fitwell Admin" app (client_id `baf6c9cee6ec6d1d64f15a820241b49f`). It is *not* the same as Shopify Store admin.

```bash
npm install -g @shopify/cli
shopify auth login        # device-code flow, opens browser
```

Verify:
```bash
shopify app versions list # from repo root; should list Fitwell Admin versions
```

If "no apps found" or you can't see Fitwell Admin: you're either logged in with the wrong Partner account or not in the Partner org that owns the app. Ask Greg to invite your Partner email, then re-run `shopify auth login`.

For the deploy/release workflow itself, see [`specs/current/shopify-app-config.md`](../current/shopify-app-config.md).

## 6. Shopify Store admin

Separate from §5. This is staff-level access to `https://fitwell-buckles.myshopify.com/admin` — needed for:
- Clicking "Approve" on the re-auth banner when scopes change (see `shopify-app-config.md` → Merchant re-authorization)
- Viewing orders / customers / products in the Shopify UI

Verify: log into `https://fitwell-buckles.myshopify.com/admin`.

Granted by Oliver (Store owner). If you don't have access, he can add you under **Settings → Users and permissions**.

## 7. Local `.env.local`

Do this after §3 (Vercel link) and §4 (Neon dev branch) are working.

```bash
cp .env.example .env.local
npm run vc env pull .env.local --environment=development
```

Then **overwrite `DATABASE_URL`** in `.env.local` with the connection string for your `<name>-dev` Neon branch from §4. The Vercel pull will have populated it with the production URL — that's wrong for local dev.

Verify:
```bash
npm run db:pending        # "no pending migrations" or a list
npm run db:studio         # browser UI against YOUR dev branch
npm run dev               # boots on http://localhost:30100
```

### Assistant read-only role (one extra step)

The in-portal AI assistant (`/assistant`) runs model-generated SQL through a
dedicated **read-only** Postgres role — never your `DATABASE_URL`. After your dev
branch + `.env.local` work, provision the role on your branch and wire
`DATABASE_URL_READONLY`:

```bash
node --env-file=.env.local --import tsx/esm scripts/setup-readonly-role.ts
```

This creates `fitwell_assistant_ro` on your branch (idempotent), smoke-tests that
reads work and writes are **denied**, and appends `DATABASE_URL_READONLY` to
`.env.local`. Until it's set the assistant returns a clear "DATABASE_URL_READONLY
is not set" error; the rest of the app is unaffected. Production is already
provisioned (same role on the prod branch + the Vercel env var); runbook is
`scripts/create-readonly-role.sql`. Background: `specs/current/integrations.md` →
*AI Assistant*.

---

## 8. Permissions cheat sheet

What each action requires, for when something fails:

| Action | Needs |
|---|---|
| Edit `shopify.app.toml` | Repo write |
| Run `shopify app deploy && shopify app release` | Partner org membership (§5) |
| Approve scope re-auth in Shopify Admin | Store admin/owner (§6) |
| Run `npm run db:migrate:prod` | Vercel env access (§3) |
| Use the AI assistant locally (`/assistant`) | `DATABASE_URL_READONLY` set — run `scripts/setup-readonly-role.ts` (§7) |
| Push to `main` (auto-deploys to Vercel) | Repo write |
| Trigger a Vercel redeploy (e.g. to flush cached Shopify token) | Vercel project member (§3) |

Most days you only need §1–§4 + §7. The Shopify and prod-migration ones come up when you're touching `shopify.app.toml` or schema changes.

## See also

- [`specs/current/shopify-app-config.md`](../current/shopify-app-config.md) — Shopify app deploy workflow (post-CLI-setup)
- [`AGENTS.md`](../../AGENTS.md) §8 — Database / Neon migration workflow
- [`AGENTS.md`](../../AGENTS.md) §12 — Deployment
- [`specs/ops/ROLES.md`](ROLES.md) — Who's who
