# Migrate primary domain: admin.fitwellbuckle.co → portal.fitwellbuckle.co

## Context
- The app is currently served at `admin.fitwellbuckle.co` (Vercel production domain). We want the primary URL to be `portal.fitwellbuckle.co`.
- "Portal" reads better than "admin" now that the app hosts the supplier portal (`/supplier`) and the B2B company portal (`/portal`) alongside the admin dashboard.
- **Key constraint:** `portal.fitwellbuckle.co` is *already in use* as the verified Resend email-sending domain (`EMAIL_FROM = "Fitwell Buckle Co. <info@portal.fitwellbuckle.co>"`, set in Vercel prod since 2026-05-27 — see `specs/current/integrations.md` and `specs/ops/PRIORITIES.md`). Reusing the same subdomain for web hosting is workable (web vs. email use different DNS record types), but the DNS coexistence must be verified before flipping so email deliverability isn't disturbed.
- The dynamic links largely take care of themselves: NextAuth builds callback + magic-link URLs from `AUTH_URL`, and the magic-link email derives its display host from that generated URL (`src/lib/email/magic-link.ts:23`). The only hardcoded absolute app URL anywhere is a Shopify inventory-adjustment `reference` string in `src/lib/production/receive.ts:96`.
- The highest-risk piece is Shopify: changing `application_url` in `shopify.app.toml` moves the OAuth/install entry point and requires a CLI deploy + possible merchant re-auth + webhook re-registration.

## Dependencies
- Vercel project access (`npm run vc` / `~/.vercel-fitwell` config) to add the domain and set `AUTH_URL`.
- DNS access for `fitwellbuckle.co` to add the `portal` A record alongside the existing Resend records.
- Resend dashboard access to confirm exactly which DNS records back the `portal.fitwellbuckle.co` sending domain (to rule out a record conflict).
- Google Cloud Console access (OAuth client, GCP project `992120641760`) to add the new authorized redirect URI + JS origin.
- **Greg**: Shopify app-config changes (`shopify.app.toml`) are deployed via the Shopify CLI from Greg's laptop and require coordination per AGENTS.md §9. This plan must not deploy Shopify config unilaterally.
- Reference: `specs/current/shopify-app-config.md`, `specs/current/integrations.md`, `AGENTS.md` §9 (Shopify) + §12 (Deployment).

## Scope
Included:
- Add `portal.fitwellbuckle.co` as the Vercel production domain (web hosting) without breaking the existing Resend email DNS.
- Point NextAuth (`AUTH_URL`) + Google OAuth at the new host.
- Update `shopify.app.toml` `application_url` + webhook registration to the new host (code edit here; CLI deploy by Greg).
- Update the one hardcoded app URL (`receive.ts`) and all UI/docs/spec copy that names the old host.
- Keep `admin.fitwellbuckle.co` as a 301 redirect → `portal.fitwellbuckle.co` so existing bookmarks, Shopify references, and links keep working.

Excluded:
- Moving email off `portal.fitwellbuckle.co` (it stays the sending domain; no change to Resend config).
- Any change to `NEXT_PUBLIC_APP_URL` — it points at the storefront (`https://fitwellbuckle.co`) for sitemap/robots, not the admin host.
- Switching the app to Shopify-embedded mode (still `embedded = false`; out of scope).
- Retiring the `admin.` redirect (a later cleanup once nothing references it).

## Implementation Phases

> Phases are ordered for **zero-downtime cutover** — each step adds the new host alongside the old before anything flips, so sign-in and Shopify never break mid-switch.

### Phase 1: DNS + Vercel domain (additive, no cutover yet)
- [ ] In the Resend dashboard, record exactly which DNS records back `portal.fitwellbuckle.co` (expected: SPF/DKIM TXT + MX on deeper subnames like `send.portal…`, `resend._domainkey.portal…`, `_dmarc.portal…`, leaving the apex free).
- [ ] Confirm the `portal.fitwellbuckle.co` apex has no record that would conflict with a web A record. If Resend put an MX/TXT directly on the apex, use an **A record** for Vercel (a CNAME cannot coexist with other records at the same name).
- [ ] Add A record `portal.fitwellbuckle.co → 76.76.21.21` (Vercel).
- [ ] Add `portal.fitwellbuckle.co` to the Vercel project (`npm run vc`); let Vercel auto-provision SSL. Do **not** yet make it the primary/redirect target.
- [ ] Verify: `https://portal.fitwellbuckle.co` serves the app (login page renders) AND a test email from Resend still sends/authenticates (SPF/DKIM pass).

#### Tests
- Manual: load `https://portal.fitwellbuckle.co/supplier/login` → renders, valid cert.
- Manual: send one transactional email (e.g. trigger a magic link to a test address) → delivered, DKIM/SPF still pass (email DNS undisturbed).

### Phase 2: Auth — point NextAuth + Google OAuth at the new host
- [ ] In Google Cloud Console (OAuth client, project `992120641760`): add `https://portal.fitwellbuckle.co/api/auth/callback/google` to Authorized redirect URIs and `https://portal.fitwellbuckle.co` to Authorized JavaScript origins. **Keep the existing admin entries** so admin keeps working until cutover.
- [ ] Set Vercel production `AUTH_URL = https://portal.fitwellbuckle.co`; redeploy.
- [ ] Verify Google sign-in and supplier/company magic-link sign-in on the portal host end-to-end.

#### Tests
- Manual: Google OAuth sign-in via `portal.` lands on `/dashboard`.
- Manual: request a supplier magic link → email subject/links show `portal.fitwellbuckle.co`, link signs in successfully.
- Manual (regression): confirm the magic-link host now follows `AUTH_URL` (no leftover `admin.` in the email).

### Phase 3: Shopify app config (code edit here; CLI deploy by Greg)
- [ ] Edit `shopify.app.toml:5` → `application_url = "https://portal.fitwellbuckle.co"` (keep `embedded = false`).
- [ ] Edit `scripts/shopify-cli.ts:368` webhook URL → `https://portal.fitwellbuckle.co/api/webhooks/shopify`.
- [ ] Coordinate with **Greg** to `shopify app deploy` + release from his laptop, then re-register webhooks at the new host (per `specs/current/shopify-app-config.md`).
- [ ] Verify the merchant install/OAuth flow still completes and a test webhook is received + HMAC-verified at the new URL.

#### Tests
- Manual: trigger a Shopify test webhook (or a real order in a test context) → received at `portal…/api/webhooks/shopify`, HMAC passes, record upserts.
- Manual: confirm OAuth/install round-trips against the new `application_url`.

### Phase 4: Hardcoded URL + UI/docs copy
- [ ] `src/lib/production/receive.ts:96` — change the inventory-adjustment `reference` to `https://portal.fitwellbuckle.co/po/${po.shopifyPoNumber}`.
- [ ] `src/app/(admin)/data-sync/page.tsx:234` — displayed webhook URL.
- [ ] `src/app/(admin)/docs/onboarding/page.tsx:238` — onboarding copy.
- [ ] `src/app/(admin)/docs/guides/guides-data.ts:39` — "Go to admin.fitwellbuckle.co…" sign-in instruction.
- [ ] Update test request URLs that hardcode the host (`src/app/api/invoices/[id]/send/route.test.ts`, `src/app/api/tracking/utm/route.test.ts`) — cosmetic, but keep them current.
- [ ] Update docs/specs naming the old host: `AGENTS.md` (Shopify §, Deployment § incl. the production/fallback URL line), `specs/current/integrations.md`, `specs/current/shopify-app-config.md`, `specs/ops/PRIORITIES.md`, `specs/ops/releases.yaml`.

#### Tests
- `npm run check` (tsc + vitest) green after the code/test edits.

### Phase 5: Cutover + redirect
- [ ] In Vercel, set `admin.fitwellbuckle.co` to **301 redirect → `portal.fitwellbuckle.co`** (keeps old bookmarks, Shopify references, and any stale links working).
- [ ] Make `portal.fitwellbuckle.co` the primary production domain.
- [ ] Smoke-test the full surface on `portal.`: admin dashboard, `/supplier`, `/portal`, invoice send, PO handoff email links, data-sync page.
- [ ] Verify `https://admin.fitwellbuckle.co/...` 301s to the same path on `portal.`.

#### Tests
- Manual: visit several old `admin.` deep links → 301 to the matching `portal.` path.
- Manual: confirm cron jobs (health, extracts) still succeed (they call relative/internal routes; spot-check one run).

## Notes
- **Open question — same subdomain for web + email?** Reusing `portal.fitwellbuckle.co` for both the app and the Resend sending domain is workable but collapses two roles onto one name. If we'd rather keep them separate, `app.fitwellbuckle.co` for the web app sidesteps the DNS-coexistence question entirely and leaves `portal.` purely for email. Decide before Phase 1. (This plan assumes we proceed with `portal.` for the web app.)
- **Biggest risk is Phase 3 (Shopify).** Changing `application_url` can require the merchant to re-authorize and always requires webhook re-registration. Do it during a low-traffic window, with the `extract-shopify` cron (every 2h) as the safety net for any webhook missed during the swap.
- **DNS gotcha:** never put a CNAME on `portal.fitwellbuckle.co` if it already carries MX/TXT — use an A record so web + email records coexist.
- **Don't touch `NEXT_PUBLIC_APP_URL`** — it is the storefront root for SEO (sitemap/robots), not the admin host.
- **Rollback:** keep the old Google OAuth redirect URI and the `admin.` domain live through cutover; if anything breaks, revert `AUTH_URL` to `https://admin.fitwellbuckle.co` and (if already deployed) revert `shopify.app.toml`. The Shopify revert is the slow one (another CLI deploy), so verify Phase 3 thoroughly before Phase 5.
- Per AGENTS.md, apply no Shopify config deploy or prod DNS/env change without the owning person (Greg for Shopify; whoever holds DNS/Vercel for the rest).
