# Turn the portal into an installable mobile app (PWA + push)

## Context

Tom wants to use the admin portal from a phone: check ops on the go, get push
notifications for important events, and scan business cards into the B2B leads
pipeline at trade shows. The card scanner already works in the browser
(`leads/capture` + `/api/leads/scan-card`, Claude-vision extraction). Because a
PWA *is* the web app with a home-screen install, the scanner carries over
unchanged. The net-new work is: make the app installable (manifest + service
worker + icons), add Web Push, and do a responsive polish pass on the wide
desktop views.

Chosen approach: **PWA**, not native. Internal four-person tool → no App Store,
no Apple Developer Program, no second codebase. Web Push covers notifications
(iOS supports it for home-screen-installed PWAs since 16.4).

## Dependencies

- Existing in-app notification system (`src/lib/production/notifications.ts`,
  `admin_notification` table) — push mirrors this surface 1:1, so no new trigger
  points to invent. Every `db.insert(adminNotification)` also fans out a push.
- Existing card scanner (`leads/capture/*`, `/api/leads/scan-card`) — no change.
- `web-push` npm package (new dependency).
- VAPID keypair (new env vars) — generated once, added to Vercel + `.env.local`.
- `@vercel/blob` already wired (card images); `next-auth` session for auth.

## Scope

**In:**
- Web app manifest + icons (installable, "Add to Home Screen").
- Service worker: `push` → show notification, `notificationclick` → focus/deep-link.
- `push_subscription` table (one row per device per user).
- Subscribe / unsubscribe / test API routes.
- Settings UI: "Enable notifications on this device" + "Send test notification".
- Push fan-out hooked into the existing admin-notification creation path.
- Responsive polish on the highest-traffic mobile views (dashboard, orders, leads).
- Doc + `.env.example` + AGENTS.md updates.

**Out:**
- Native build / Capacitor wrapper / App Store distribution (later, if ever).
- Offline data sync / background sync (just an offline app-shell at most).
- Per-event notification preferences UI (push = in-app notification surface for now;
  granular opt-in/out per type is a follow-up).
- Customer-facing app.

## Implementation Phases

### Phase 1: Installable PWA — DONE
- [x] Square PWA icons (192 / 512 / maskable + apple-touch) from the logo (`public/*.png`)
- [x] `src/app/manifest.ts` (Next metadata route → `/manifest.webmanifest`)
- [x] Root layout metadata: `themeColor`, `appleWebApp`, apple-touch-icon, `viewportFit`
- [x] `public/sw.js` service worker (`push` + `notificationclick`; push-only, no caching)
- [x] Client SW-registration (`components/pwa/register-sw.tsx`) mounted in the admin layout
- [x] Tests: manifest route shape (`src/app/manifest.test.ts`)
- [x] `npm run check` green + production build verifies the route registers

### Phase 2: Web Push — DONE (code) / keys = human checkpoint
- [x] `web-push` dependency (+ `@types/web-push`)
- [x] Schema: `push_subscription` table + migration `0073_chubby_famine.sql` (applied to local dev)
- [x] VAPID env wiring + `.env.example` entries — **keys still need generating & adding to Vercel (human)**
- [x] `src/lib/push/send.ts` — per-user + broadcast send, prunes dead (404/410) subscriptions
- [x] API: `POST/DELETE /api/push/subscribe` (unsubscribe = DELETE), `POST /api/push/test`
- [x] Single chokepoint `createAdminNotification()` — all 10 `admin_notification` inserts
      route through it; pushes admin-bound types only (skips supplier-bound)
- [x] Settings UI: enable/disable per device + send-test + iOS "add to home screen" hint
- [x] Tests: send helper + pruning (mock web-push), supplier-skip + deep-link routing
- [x] `npm run check` green (1046 tests)

### Phase 3: Responsive polish + docs — docs DONE / responsive = device test
- [x] Update `specs/current/schema.md` (push_subscription section) + `routes.md` (push routes)
- [x] `.env.example` (VAPID vars)
- [~] Responsive audit: foundation already in place (mobile header, collapsible sidebar,
      `Table` wraps in `overflow-auto`, mobile-first capture). Remaining polish is a
      visual pass best done on a real phone — folded into the device-test checkpoint below.

## Human checkpoints (Tom — can't be delegated)

- [ ] **Generate VAPID keys** and add the four env vars to Vercel (prod) + `.env.local`
      (Claude provides the exact command + values).
- [ ] **Decide the app name + approve/replace the icon art** (default: padded Fitwell logo).
- [ ] **Real-device test on your iPhone**: install to home screen → grant notifications →
      receive a test push on the locked phone → scan a few real cards.
- [ ] **Tune push triggers** if the default (every in-app notification) is too noisy.
- [ ] **Team onboarding**: walk Oliver / Melanie / Greg through Add-to-Home-Screen
      (iOS push only works *after* install — per device, opt-in).

## Notes

- New table (`push_subscription`) + new integration (`web-push`) — surfaced and
  greenlit in the working session.
- iOS Web Push requires the PWA be home-screen-installed; Safari-tab push doesn't
  exist on iOS. The settings UI must detect "not installed" and tell the user to
  add to home screen first.
- Push payload carries a deep-link `url`; `notificationclick` focuses an existing
  tab if open, else opens the URL.
- Migration order: apply `push_subscription` to prod *before* pushing code (Critical Rule 2).
