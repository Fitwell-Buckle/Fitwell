# Shopify App Configuration

Last updated: 2026-05-28

How we change the Shopify app — scopes, embed flag, app URL, declared webhooks. For *runtime* Shopify integration (endpoints, sync, webhook verification), see [integrations.md](integrations.md).

## TL;DR

- Source of truth: `shopify.app.toml` at the repo root
- Anyone with repo access can edit it
- Greg deploys via `shopify app deploy && shopify app release --version <name> --allow-updates` on his laptop
- A merchant must re-authorize the app afterward whenever scopes change — manual, in Shopify Admin
- **Never** edit the same fields in the Shopify Dev Dashboard UI; they'll be overwritten on the next deploy

## What lives in the toml

| Field | Editable? | Notes |
|---|---|---|
| `client_id` | No | Set by `shopify app config link`; don't hand-edit |
| `name` | No | Display name of the app |
| `application_url` | Yes | Where merchants land when launching the app |
| `embedded` | Yes | **Must stay `false`** — see [Embed trap](#embed-trap) |
| `[access_scopes].scopes` | Yes | Comma-separated. Adding any scope triggers merchant re-auth |
| `[access_scopes].optional_scopes` | Yes | Unused today |
| `[auth].redirect_urls` | Yes | Empty — we don't use OAuth |
| `[webhooks].api_version` | Yes | API version for declared webhook subscriptions |

## What's *not* in the toml

- **Runtime Admin API credentials.** `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` are env vars (Vercel + `.env.local`) used by the *running app* to call Shopify's Admin API. These are a different token type from the Partner CLI token used by `shopify auth login`.
- **Active webhook subscriptions.** Existing webhooks (`orders/create`, `orders/updated`, `customers/update`) are registered runtime-side, not declared under `[webhooks.subscriptions]`. Moving them into the toml is possible but separate work.
- **Per-store install state.** The toml describes the *app*; install / re-auth state lives on the merchant store.

## First-time CLI setup

Only the person who deploys needs the CLI. Today that's Greg. Tom and Oliver can PR toml changes without installing anything.

```bash
npm install -g @shopify/cli        # @shopify/app is bundled in as of CLI v3.59
shopify auth login                 # device-code flow; opens a browser
shopify app config link --client-id <SHOPIFY_CLIENT_ID from .env.local>
```

`config link` writes `shopify.app.toml` reflecting the current Dashboard state. We only do this once — after that the toml is the source of truth.

If `shopify app config link` is run from a non-TTY shell (Claude Code's `!` prefix, CI), pass `--client-id` to skip the interactive "create new vs. link existing" prompt.

## Day-to-day workflow

```
edit shopify.app.toml  →  PR review  →  merge to main
                                            ↓
                                Greg: shopify app deploy
                                            ↓
                          (a new version appears in Dashboard)
                                            ↓
                  Greg: shopify app release --version <name> --allow-updates
                                            ↓
                       Merchant approves re-auth in Shopify Admin
                                            ↓
                              New scopes / config are live
```

### The two-stage deploy

CLI v4 split what v3 did in one shot:

1. **`shopify app deploy`** — creates a new app *version* (a config snapshot) in the Partner Dashboard. Not yet active for merchants. Prompts to confirm config diffs unless you pass `--allow-updates` or `--no-release`.
2. **`shopify app release --version <name> --allow-updates`** — activates that version for merchants. After release, the merchant's next admin app load shows a re-auth prompt.

### Preview mode (no merchant impact)

```bash
shopify app deploy --no-release --message "preview: <what's changing>"
```

Creates a draft version visible in the Dashboard but doesn't roll it out. Useful for validating the toml against Shopify's schema. The draft sits there until you either release it or replace it with a newer deploy.

`--no-release` and `--allow-updates` are mutually exclusive — `--no-release` already skips the prompt.

### Promoting a draft to released

```bash
shopify app release --version <name-from-dashboard> --allow-updates
```

The `--allow-updates` flag auto-confirms the config diff prompt; without it the command hangs in a non-TTY shell.

## Merchant re-authorization

Whenever the released version changes scopes (or any merchant-facing config), Shopify forces a re-grant. There's no API for this — only the merchant UI:

1. Merchant opens `https://fitwell-buckles.myshopify.com/admin/settings/apps`
2. Clicks into Fitwell Admin
3. Shopify shows an "update permissions" banner listing the new scopes
4. Click Approve

Until the merchant approves, the new scopes are *declared* but not *granted* — Admin API calls requiring them will still return `access denied`.

## Embed trap

The Dev Dashboard ships new apps with `embedded = true`. With embedding on, Shopify Admin tries to load `admin.fitwellbuckle.co` inside an iframe. Our app sets `frame-ancestors 'none'` (`next.config.ts`) and uses NextAuth — neither is compatible with embedding. Result: "refused to connect" inside the Shopify Admin app slot, and a half-stuck merchant install (this hit us 2026-05-24).

**Keep `embedded = false`.** Flipping back requires wiring App Bridge + Shopify session token auth across the admin, which we don't have today. Discuss with Greg before attempting.

## Why deploys aren't on CI / Vercel

- Partner CLI tokens are a different secret from the runtime Admin API credentials — would mean managing another secret in Vercel/GitHub
- Scope changes are rare (~monthly)
- Merchant re-auth is manual either way, so CI wouldn't remove the bottleneck
- Same shape as production database migrations (AGENTS.md §8) — fine to keep on Greg's laptop until volume justifies CI

If we ever do automate it, a GitHub Action triggered by `paths: [shopify.app.toml]` on `main` is the right shape — *not* coupling it to the Vercel build, since a Shopify config failure shouldn't fail a site deploy.

## Open scope questions

- **Store brand logo (`shop.brand.logo`).** Currently behind a fallback. `read_content` is in the toml as of 2026-05-26 on the theory it gates the `brand` field. If the logo still doesn't appear after merchant re-auth, try `read_online_store_pages` in a follow-up round and remove `read_content` if it's not actually doing anything.

## Recently resolved

- **`write_draft_orders` grant (2026-05-28).** The toml had it from 2026-05-26 but version `fitwell-admin-7` is the first released version that includes it. Merchant approved the "update permissions" banner on 2026-05-28; a `client_credentials` token exchange confirms `write_draft_orders` (plus `read_content`, `write_inventory`) is now in the granted scope set. Production was redeployed immediately to flush the 24h cached token on warm Vercel instances. End-to-end verified: a B2B invoice send creates the deposit draft order + payment link and stops hard-failing with 409. The same scope also unblocks the deposit/balance flow and influencer-gifting draft orders.

## Useful URLs

- Partner Dashboard: https://dev.shopify.com/dashboard/75387489/apps/360915140609
- Versions list: https://dev.shopify.com/dashboard/75387489/apps/360915140609/versions
- Merchant app settings: https://fitwell-buckles.myshopify.com/admin/settings/apps
- Shopify CLI command reference: https://shopify.dev/docs/api/shopify-cli/app
- Scope reference: https://shopify.dev/docs/api/usage/access-scopes

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App shows "admin.fitwellbuckle.co refused to connect" inside Shopify Admin | `embedded = true` + CSP `frame-ancestors 'none'` | Set `embedded = false`, deploy, release, merchant re-auths |
| `Failed to prompt: Create this project as a new app?` from `shopify app config link` | Non-TTY shell (Claude Code `!`, CI) with no toml yet | Pass `--client-id <id>` |
| `--allow-updates cannot also be provided when using --no-release` | Flags are mutually exclusive | Use one or the other; `--no-release` already skips the prompt |
| `Nonexistent flag: --force` | Removed in CLI v4 | Use `--allow-updates` for non-interactive runs |
| New scopes don't work after deploy | Merchant hasn't approved the re-auth | Have merchant load Shopify Admin → Apps → Fitwell Admin → Approve |
| Versions accumulate in Dashboard | Shopify doesn't autoclean | Cosmetic only — doesn't affect functionality |
