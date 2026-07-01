# Priorities

Last updated: 2026-07-01

## 🚀 Active (2026-06-27) — D2C 360 growth push: GO

Decision made to move forward with the H2 D2C push (5–8 → 30–40 orders/day).
**Source of truth: `specs/work-plans/todo/d2c-360-growth-push.md`**; full plan +
financial model in `specs/strategy/sessions/2026-06-24-d2c-360-growth-planning.md`.

Decisions:
- **Lucas — go** (part-time social & email; campaigns *and* flows).
- **VA + ops/enthusiast/integrator — defer (not cut)**; bring on as soon as there's
  signal it's working and headcount is the bottleneck — *when*, not *if*.
- **Signal-then-invest** — launch Meta/Google/creators, scale spend *and the deferred
  hires* behind returns; kill-switch = blended ROAS < 2 or no path to $3–5k/day in 90 days.
- **Greg** — attribution work + review/optimize the creator app (capped eng hours).
- Content-first; big paid (incl. Google/YouTube ≥$7k/mo) starts ~August.

Deferring the VA + ops/integrator lifts the near-term cash trough above the
modeled ~$120k (Feb '27); they come back in as returns prove out. Next: onboard
Lucas, content blitz, verify conversion
tracking, Shopify audit, creator import + Wave 1 outreach, TikTok Shop standup.
Open (Oliver): wholesale/OEM ramp, TikTok Shop fulfillment, deployant timing.

## 🔧 Shipped 2026-07-01 — On-wrist copy scrubbed sitewide + dynamic review pill

Brand cleanup enacting **between-holes-first positioning (H14)**: pulled on-*wrist*
adjustment claims across the storefront (kept "on-the-fly," which Tom is fine with).
Reviews page + collection SEO from the same stretch is tracked in
`specs/work-plans/todo/gsc-organic-search-plays.md`.

- **Theme (5 templates, live):** buckles collection, M1 meta-ads landing (both
  blocks), shop-Fitwell, blog, footer. Reworded to lead with fit ("Set your perfect
  fit," "for all-day comfort"). M4 collection SEO paragraph intentionally left as-is.
- **⚠️ Product descriptions — LIVE SHOPIFY DATA, NOT IN GIT.** Scrubbed on-wrist
  copy ("on-wrist," "on the wrist," "whenever your wrist size changes throughout the
  day") from all 7 M1 models + the M3 keeperless, via the Admin API (client-credentials
  OAuth, `write_products`). **Do not reintroduce on-wrist language when editing product
  copy — it was removed deliberately.** Also fixed a factual error: stainless models
  were calling themselves "titanium." Now: plain stainless → "precision 316L stainless
  steel buckle"; colored → "gold- / rose-gold- / black-finished 316L stainless steel";
  the 2 titanium models keep "lightweight titanium." (One-off scripts were run from the
  session scratchpad, not committed.)
- **Dynamic review pill — NEW.** `/api/review-summary` (public, open CORS, 1h edge
  cache; commits `119dce4` endpoint+tests, `cc992db` routes doc) returns live
  `{rating,count}` from the `review` table (daily Judge.me sync). Theme snippet
  `fw-review-pill.liquid` fetches it and **replaced the hardcoded static pills** — which
  had drifted to inconsistent numbers (4.6/4.7/4.8, 30+/60+/97) — on the buckles
  collection, M4 collection, M1 landing, and reviews page. Self-updates as reviews accrue,
  so pills never go stale again.

## 🔧 Shipped 2026-06-29 — Analytics pipelines repaired + GSC stood up + staleness monitoring

A "visitors/conversions over the past 90 days" question surfaced that several
analytics extracts had silently died or were never configured. Diagnosed and
fixed end-to-end. All pushed to main (commits `5340004`, `cb028f0`, `3eb8a44`,
`3c3aa27`, `60d727f`); release logged in `releases.yaml` (2026-06-29).

- **Google Ads — fixed.** API `v20` was deprecated and **blocked** by Google
  (400 `UNSUPPORTED_VERSION`) ~06-16, silently halting `google_ads_daily`.
  Bumped to `v24` via an `ADS_API_VERSION` constant, verified live, gap
  backfilled.
- **GSC — stood up from zero** (had never produced a row). Enabled the Search
  Console API (GCP project `992120641760`), verified the
  `sc-domain:fitwellbuckle.co` Domain property via Shopify DNS TXT, granted the
  service account (`fitwell-analytics@…`) Restricted access, set `GSC_SITE_URL`
  in Vercel prod (marked sensitive — pulls back empty, works at runtime),
  backfilled the full ~16-month window (**20,867 rows**, 2025-02-27 →
  2026-06-26), confirmed the live daily cron. Work plan moved to
  `completed/gsc-pipeline-setup.md`.
- **Pipeline staleness monitoring — NEW.** The health cron (`/api/cron/health`,
  every 4h) now checks `MAX(date)` freshness per pipeline (72h for daily
  extracts, 144h for GSC's lag) and raises a deduped admin notification (in-app
  + Web Push, ≤1/20h) when an `expectLive` pipeline goes stale. This closes the
  gap that let GA4/Ads/GSC sit dead for weeks unnoticed (the cron only checked
  DB + Shopify before). `src/lib/analytics/pipeline-health.ts`.
- **Google token cache — fixed.** `getGoogleAccessToken` cached one global token
  ignoring requested scopes, so a warm Fluid-Compute instance could hand a
  GA4-scoped token to the Ads extract (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`). Now
  keyed by the (sorted) scope set.
- **email_match attribution — fixed** (closes the WS6 backfill-adjacent gap).
  The fallback linked orders in the DB but never emitted `purchase_completed`
  or stamped `posthog_distinct_id`, so email-matched conversions counted toward
  `link_method` coverage yet stayed invisible to PostHog — why the PostHog
  purchase count sat below DB linkage. Now mirrors the pixel path when the
  matched touch carries a distinct_id. `attribution.md` §4 updated.

**Data note:** GA4 itself had already self-recovered in prod (broke ~05-22,
fixed + backfilled before this session). The original question's first answer
leaned on a stale personal dev branch and understated things — corrected
prod 90-day read: **756 orders**, ~79% recent pixel linkage (post-06-04), not
the alarming 1.5%. All five extracts (GA4, Google Ads, Meta, PostHog, GSC) are
now live, current, and monitored.

**Next (todo): `specs/work-plans/todo/gsc-organic-search-plays.md`** — turn the
new GSC data into action. First read: organic is **~93% branded**, i.e. a
*closer/measurement* channel, not an acquisition engine (quantifies "Google is
the closer"). Plays, in priority order: tighten the branded SERP + a reviews/proof
page (`fitwell buckle review` ranks pos 9.3), optimize `/collections/buckles` for
the head terms stuck on page 2, a Fitwell-vs-Delugs comparison page, and a
recurring GSC cut. Not a big SEO bet — closer-channel hygiene.

## 🧹 Ops note (2026-06-22) — harmless orphan row in prod `__drizzle_migrations`

`npm run db:pending:prod` prints `(DB has 1 migration not in local journal)`.
This is **cosmetic, not a problem** — don't chase it. It's prod row `id=60`
(applied 2026-06-11 14:38): the original pre-renumber apply of
`production_comment.updated_at`, which collided at `0057` with concurrent work
and was renumbered + rewritten idempotently as the committed
**`0059_stormy_smiling_tiger`** (commit `707b69b`). The column is in prod and
in the repo (via `0059`); the orphan is just a duplicate apply-record whose
hash matches no on-disk file. The hash-based pending check stays correct.
Optional one-time cleanup (needs Greg's sign-off — manual prod-DB write):
`DELETE FROM drizzle.__drizzle_migrations WHERE id = 60;`.

Re-confirmed 2026-07-01 while applying the creator Phase-1 migration (`0097`):
prod shows 99 applied rows vs. 98 on-disk; the +1 is still this same orphan
(`id=60`) — recent migrations `0092`–`0097` match prod 1:1 by timestamp, and
`0097` is confirmed live. Nothing new; still safe to leave.

## 🆕 Shipped 2026-06-16 — Trade Shows section (EPHJ Geneva)

New top-level **Trade Shows** admin section for booth-walking at EPHJ Geneva
2026 (Tom is there now). Seeded the 59-vendor worklist from the prospecting
sheet (`scripts/seed-ephj-vendors.ts`, `npm run seed:ephj`). On the floor:
mark visited, scan business cards (Claude vision OCR), record voice notes
(audio → Blob + on-device dictation transcript), capture follow-up steps, and
**Convert** a vendor into the existing Supplier Leads or Customer Leads
pipeline (vendor's `side` tag = supplier/customer/both drives which). New
tables `trade_show` / `trade_show_vendor` / `trade_show_vendor_voice_note`
(migration **0076**). **Not yet applied to prod / not pushed** — migration +
seed must run against prod before deploy (`npm run db:migrate:prod`, then
`npm run seed:ephj` with the prod env). See `specs/current/schema.md` →
*Trade Shows* and `routes.md` → *Trade Shows API*.

## 🎯 Active sprint (2026-06-12 → 2026-06-22) — Fable 5 sprint

**Source of truth: `specs/work-plans/todo/fable5-sprint.md`** — the working
agenda for the next ~10 days while Tom has Fable 5 access. Front-loads the
model-capability-bound work: ① creator program pre-build (Phases 1+2+4+5,
ready before Tom returns ~06-21), ② post-purchase retention email content
(D1/D14/D21/D30 + welcome rewrite), ③ landing page variants A+B + Shopify
Pages write client, ④ UTM linking gap root-cause for Greg, ⑤ signup-lift
experiment designs. Check there first when deciding what to work on.

## 🧭 Positioning finding (2026-06-22) — between-holes vs. on-wrist motion

From a Tom/Claude review-corpus deep-dive (all 80 Judge.me reviews read
semantically + Shopify refund data). Two truths at two funnel stages,
and we kept conflating them:

- **Retained value (measured):** the **between-holes / fit fix** is what
  buyers experience, keep, and voice — ~half the corpus credits it. Lead
  landing pages and product story with the *outcome*. On-wrist
  ("on-the-fly") adjustment is rarely voiced, sometimes explicitly
  unused (people adjust it off-wrist), and is the #1 source of the
  modest dissatisfaction that exists (mechanism hard to set / won't
  hold) — though returns are low (~2% full / ~6% any).
- **Acquisition hook (untested):** every Meta ad shows the on-wrist
  motion, and reviews sit downstream of that, so they CANNOT tell us
  what drove the click. The motion is plausibly the scroll-stopping
  hook even though nobody writes about it. **Do not strip the on-wrist
  demo from ads on review evidence** — reviews are blind to the hook.
- **Under-used secondary benefits:** finish/**aesthetics** and
  **service/founder-touch** both show up strongly and are harder to
  copy than the mechanism. Bring them into copy.
- **Next action / open test:** a paired Meta creative A/B (on-wrist
  motion vs. outcome/between-holes without the motion) is the only
  thing that resolves the acquisition half. Fits the sprint's landing-
  page-variant + signup-lift experiment work. Full write-up:
  [[hypotheses]] **H14**; benefit distribution in [[vocabulary-map]].

## 📨 Daily check (added 2026-06-13) — Newsletter editorial QA, while the new model beds in

We just shipped a big change to the newsletter editorial model (commits
`527a3dc` + `f5a5706`, pushed to main): new **Reviews**, **Podcasts** and
**Community & Culture** sections, business analysis routed to Business,
plus **WatchPro now fails loudly** (was silent) and proxied fetches are
**serialized** to stop WatchPro/WatchTime competing for the BrightData
zone. **First send on the new model is 2026-06-14 08:55 UTC.**

**Daily, for the next ~1–2 weeks, check two things:**
1. **What got accepted vs rejected** — is triage routing stories to the
   right sections and dropping the right noise (listicles, self-promo,
   non-watch)? Don't just trust the counts; eyeball the actual stories.
2. **WatchPro went through** — confirm it's not silently missing. It now
   logs `source failed: watchpro` on a real proxy failure; absence of that
   line + WatchPro rows in the brief = good.

**How to check:**
- *Quick glance (automated):* the **"Newsletter run check"** cloud routine
  (`trig_01ENYo7X6NFXCD1AGGkPcC2h`) emails Tom a daily summary at 13:00 UTC
  — SENT verdict, subject, fetch/dedup/triage counts, and explicit
  WatchPro/WatchTime OK-or-FAILED. Killable via `/schedule` or
  https://claude.ai/code/routines.
- *Story-level accept/reject:* the summary only gives counts. To see the
  actual kept-vs-dropped list, query prod `newsletter_article` for the day
  — `included_in_campaign_id` set = kept (with `type`/`segment`),
  `dropped_reason` set = rejected (the triage verdict is the audit trail).
  Recipe + the env-pull pattern are in `specs/current/newsletter-engine.md`.
- A local `npm run newsletter:dry-run` also prints the full
  "dropped by triage" list with reasons (but skips dedup — preview only).

**Triage tuning log:**
- **2026-06-20 (`a3a2eb2`):** jewelry stories were sneaking in on implicit
  "watches are jewelry" reasoning. Added an explicit drop rule to the
  `EDITORIAL_CUT` prompt + `newsletter.md`: jewelry is not watch content
  by default — keep only on a concrete, named watch link (watch-division
  read of a conglomerate, jeweler→watchmaking, gem/precious-metal supply
  chain hitting watch production, M&A of a group that owns watch brands).
  When eyeballing accept/reject, confirm pure jewelry pieces now drop.

Stop the daily check once the classification looks reliable and WatchPro
is consistently landing.

## ✅ Closed 2026-06-13 — Shopify scope deploy + history import

The 2026-06-08 uninstall/reinstall **had** re-granted the pending scopes
(as the side-effect note predicted). Verified empirically: an order from
May 2025 — far past the 60-day cap — came back from the Orders API, so
`read_all_orders` is live (the reinstall re-grants *all* declared scopes,
so `write_customers` came with it; the leads address-push button should
work now — worth a click-test next time someone's in a lead detail).

**Feb-2024 history import ran 2026-06-13**: 1,743 orders synced, 0
errors. Prod now holds **1,715 orders back to 2024-02-24** (launch) —
Total sales / Segments / LTV extend to launch. Bonus: every imported
order flowed through the discount-code capture, so `order_discount_code`
now covers full history (708 rows; 430 coded orders predate 2026-04) —
the C1 split is computable over the whole catalog lifetime, not just 60
days. No Greg action was needed; nothing remains here.

**Addendum 2026-06-12 (Tom + Claude): `fitwell-admin-10` deployed +
released + re-granted in place** (dev dashboard "Install app" button — no
uninstall needed, cleaner than the 06-08 procedure). Adds
`write_discounts` (creator codes) and `read_shipping` (market gating =
markets ∩ shipping zones) on top of the already-live scopes. Verified:
deliveryProfiles queryable; prod redeployed to flush the cached token.
Note: shipping zones DO include India — the creator market-gating
question (override list vs. unchecking IN in shipping) is still open
with Tom.

## Current Strategic Focus (2026-06-09) — retention-led

**The thesis:** the 2026-05-25 "instrument-first" phase did its job — the
instrumentation (Grapevine self-report attribution, persona segmentation,
bundle/Klaviyo analyses) now identifies the leak, and it's **retention,
not first-touch conversion**. 65.9% of D2C customers are Single Buyers at
$47 LTV vs 5.7% Outfitters at $242 — a 5× delta — while the post-purchase
email motion is effectively unbuilt ($551 across 5 orders in 7 months).
So we ship the fix: the post-purchase Klaviyo retention motion leads;
paid channels wait until it lands (~6–8 weeks, mid-to-late July 2026).
Full reasoning: `specs/strategy/sessions/2026-06-09-retention-led-recal.md`.

**What the data resolved (2026-06-06 → 06-09):**
- **Grapevine 30-day baseline (33% response):** Meta-family ≈ 58% of
  self-reported intros; Google only ~7.55% as introducer — Google is the
  *closer*, not the introducer. WatchChris ≈ 7.55% of intros.
- **Klaviyo welcome flow: +27.6% LTV lift** ($92 vs $72), driven by order
  size — but only 32.5% of first orders use it. 67.5% are mostly not on
  the list → the signup-lift workstream (360 W5 §6).
- **Repeat rate ≈ 7–8% flat across first-order size**; 88.4% of orders
  are 1–2 units. Outfit-the-collection is a multi-order email motion,
  not a bundle SKU. Public bundle + in-box card both formally declined
  (`bundle-strategy.md`, `in-box-card-strategy.md`).
- **COGS confirmed:** $3.65/unit (M1 SS, M4), $4.50 (M1 Ti) → ~91%
  blended gross margin at $40 retail.
- **Organic works:** Tom's 2026-06-03 M4 post → 6 next-day M4 orders.
  Workstream 4.5 continues compass-not-contract.

**Sequence:**
1. **Post-purchase Klaviyo flow (Klaviyo Phase 4)** — Tom creates the flow
   skeleton in the Klaviyo UI (~15–20 min), Claude pulls YAML + writes
   D1 / D14 / D21 / D30 content, D30 outfit code generated in Shopify
   (25% off 5+, 30-day expiry; shared vs single-use TBD). Greg signed off
   on the Phase 4 architecture 2026-06-09.
2. **Greg's queue (2026-06-13): one known-drift item — orphan prod
   migration.** ① ~~UTM linking gap~~ —
   **closed**: forward gap fixed by the pixel (71% of June orders
   linked); historical half proven *unrecoverable* (pre-pixel touches
   were anonymous — no identity edge ever captured) — pre-2026-06-04
   `link_method IS NULL` is the pre-instrumentation era, not a bug.
   Bonus finds: 2,823 duplicate `utm_attribution` rows (55% of table)
   deleted + the duplicating insert in `upsertOrder()` fixed. Full
   diagnosis: `specs/work-plans/completed/utm-linking-gap.md`.
   ② ~~PostHog theme redeploy~~ — **done 2026-06-04**, data flowing (see
   workstream 6). ③ ~~Shopify scope deploy + Feb-2024 history import~~ —
   **closed 2026-06-13** (top of doc). ④ **NEW — orphan prod migration to
   reconcile.** Prod's `drizzle.__drizzle_migrations` has **74 rows vs 73
   on-disk**: one applied row at **`2026-06-11T14:38:45Z`** (between `0058`
   and `0059`) has **no matching file in the repo**. Verified read-only via
   `db:pending:prod` + a hash-diff of the prod table against the on-disk
   journal (2026-06-13). Correlates with the **2026-06-11 newsletter
   branding/monetization work** — that session generated a migration,
   applied it to prod, then the file was renumbered/discarded when the work
   was reworked, leaving the tracking row (and whatever it `ALTER`ed)
   orphaned. *Benign for deploys* — drizzle ignores unrecognised rows and
   applies new migrations by timestamp, which is why `0059`–`0072` all
   landed fine. **Only future risk:** if the newsletter schema work is
   revived and re-migrated it could hit "already exists" on prod (the same
   class as the influencer-branch `production_stage already exists` bug).
   **Recipe to reconcile (destructive → Greg owns):** (a) diff prod's
   `newsletter_*` table columns against `src/lib/schema.ts` to identify what
   the orphan added; (b) if those columns are wanted, hand-author a
   migration file matching prod so the journal catches up; if unwanted, drop
   them; (c) delete the orphan row from `drizzle.__drizzle_migrations`
   (match on its `created_at`/`hash`) so prod = repo. Fold into the
   migration-history reconciliation already queued below. Remaining Greg
   involvement otherwise is gates only: prod migrations when sprint work
   ships, and the influencer→creator contract migration sign-off with
   Oliver.
3. **Signup-lift workstream (360 W5 §6)** — design experiments now;
   measurement gated on PostHog data accumulating. Discount-code-name
   visibility **shipped 2026-06-10** (workstream 10) — first C1 read:
   true online signup capture is only ~9% of first orders.
4. **Creator program engineering compress** (Phases 1+2+4+5 of
   `creator-program.md`) starts **~2026-06-21** when Tom is back from
   Geneva; manual/spreadsheet cadence until then.
5. **Paid channels (360 W6) launch only after the retention motion is
   live and measurable** — ~6–8 weeks out, not week 3 as originally
   planned in the 360 v3.1 calendar.

### Current Numbers (Baseline as of 2026-05-25)

- **Daily visitors:** ~300–400
- **Daily sales:** 6–9 (median ~7). Never zero post-Black-Friday — the floor looks algorithmic, mechanism unknown
- **Conversion rate:** ~1.5%
- **Ad spend mix:** heavily Meta; only Google paid spend is a branded keyword ad on "fitwell" / "fitwell buckles"
- **Channel attribution:** most sales come from Google, but the mechanism (paid branded search vs. organic vs. post-creator branded search vs. post-Meta-ad branded search) is unknown

### What "Rightness" Looks Like (Initial Targets — Refine with Data)

Measured as an **event-based** funnel (HogQL `windowFunnel`, route-agnostic), not a strict URL flow. Visitors can enter on any page (`/`, `/pages/m1-micro-adjust-buckle`, `/collections/*`, `/products/*`) and traverse via any route — the stages are progression *events*, not page visits.

| Stage (event) | Measured (2026-06-04→11) | Target | Notes |
|---|---|---|---|
| `$pageview` → `product_viewed` | **83%** ✓ | 60%+ | `product_viewed` includes Shopify's standard event on `/products/*` AND the storefront snippet's custom emission on declared landing PDPs (currently `/pages/m1-micro-adjust-buckle`). |
| `product_viewed` → `product_added_to_cart` | **5.2%** ✗ | 8–12% | **← THE LEAK.** ~11 ATC uniques/day, so small-n — but well under the band. PDP objection-handling (size finder, guarantee placement, anchor) is the lever, not checkout fixes. |
| `product_added_to_cart` → `checkout_started` | **72%** ✓ | 50%+ | |
| `checkout_started` → `purchase_completed` | **~90%** ✓ | 70%+ | Purchases read from the `order` table (~7/day), NOT PostHog — see caveat below. Checkout friction is a non-problem. |
| **`$pageview` → `purchase_completed` (overall)** | **~2.8%** | **3%+** | First measured read; vs the ~1.5% GA4-sessions estimate. Denominators differ (daily-unique sums vs sessions) — don't celebrate yet, but the 3% target may be closer than assumed. |

First real numbers landed 2026-06-12 from the 2026-06-04→11 window
(theme redeploy went live 06-04; daily-unique sums from `posthog_daily`).
**Caveat: `posthog_daily.purchase_completed` rows for 06-04→06-12 are
inflated ~12×** — the attribution linker re-emitted on every cron
re-sync until fixed in `d7bcf56`. Use the `order` table for purchase
counts over that window. All client-side events are trustworthy.

### Catalog of Unknowns

Captured for systematic attack rather than ambient anxiety. Living index in `specs/strategy/hypotheses.md` (Open Questions section). Highlights:

- **Ad fatigue:** how many people are sick of seeing our ads? What's the optimal frequency cap?
- **Content type effect:** which formats (installation videos, comparisons, lifestyle) move buyers from `solution_aware` to `considering`?
- **Creator attribution:** what's the correlation between creator post metrics (engagement, follower count, niche fit) and resulting sales lift?
- **Creator × ad overlap:** what % of creator-driven sales were already ad-exposed beforehand? Is the creator a closer or an introducer?
- ~~**Google mechanism**~~ **— largely resolved (Grapevine, 2026-06-09):** Google is the *closer*, not the introducer (~7.55% of self-reported intros vs Meta-family ≈ 58%). "Post-creator branded search" compound path validated directionally.
- ~~**Funnel bail point**~~ **— resolved (2026-06-09 macro, 2026-06-12 stage-level):** structurally the leak is retention (Single Buyer → Outfitter). Within the acquisition funnel, the first PostHog week pins it to **PDP → add-to-cart (5.2% vs 8–12% target)** — discovery and checkout both beat targets. See the Rightness table above.
- **The 6–9 floor:** why is daily sales so tightly bounded? What's the algorithmic mechanism producing this?
- **Signup leakage shape (new):** of the 67.5% of first orders with no discount, how does the miss split across creator-code redemption (C1), pre-purchase intent (C2), gifting (C3), and popup distrust (C4)? Discount-code-name visibility unlocks the C1 split.

Every unknown above is an opportunity. The goal of instrumentation is to convert as many as possible into hypotheses we can test, then into validated answers.

---

## Blockers

_None active. See "Recently resolved" below._

### Recently resolved

- **SKU → Shopify barcode auto-sync shipped (2026-06-08)** — `write_products` granted as `fitwell-admin-9`. Standard re-auth banner didn't surface (custom-distribution apps); resolved by uninstalling Fitwell Admin from `admin/settings/apps` and reinstalling via the Partner Dashboard's custom-distribution link, which re-granted all declared scopes. One-shot backfill (`npm run sync:sku-to-barcode -- --apply`) wrote 104 variants — 32 of which overwrote a legacy UPC. Going forward, `products/create` + `products/update` webhooks call `syncProductBarcodes()` so any SKU edit auto-syncs. Two variants with empty SKU were skipped — flagged as a data-cleanup item. Code shipped in `2691c99`. Side effect: the uninstall + reinstall also re-granted `write_customers` and `read_all_orders` if they were still pending — verify and close the top-of-doc Action Needed section if so.
- **Shopify `write_draft_orders` granted (2026-05-28)** — Oliver ran `shopify app deploy` + `shopify app release` (version `fitwell-admin-7`), then re-authorized the install from Shopify Admin. Token-exchange now returns all 11 declared scopes. Prod was redeployed to flush the cached 24h Shopify token so warm Vercel instances pick up the new scope immediately. Unblocked: B2B invoice payment links, deposit/balance flow, influencer gifting draft orders.

---

## Active Workstreams

### 1. ✅ Project Scaffolding & Infrastructure Setup
**Completed**: 2026-05-11
**Source of truth**: `specs/work-plans/completed/infrastructure-setup.md`

NeonDB (with dev branching), Vercel (admin.fitwellbuckle.co), Google OAuth, ADMIN_EMAILS locked down. Sentry descoped.

---

### 2. 🔨 Shopify Integration (near complete)
**Last worked**: 2026-05-13
**Source of truth**: `specs/work-plans/todo/shopify-integration.md`
**Owner**: Greg

**Done**:
- [x] API client with client credentials auth (24h token exchange)
- [x] Rate limiting + Link header pagination + async generator
- [x] Webhook receiver with HMAC verification, wired to real upserts
- [x] Cron sync (25h overlap window)
- [x] Historical backfill script + Shopify CLI (8 commands) + /shopify skill
- [x] Admin dashboard wired to real data with shared UI components
- [x] source_name tracking (DTC vs wholesale/OEM)
- [x] UTM attribution parsing from landing_site
- [x] landing_site + referring_site stored on every order
- [x] All orders backfilled (1529). Customers partially backfilled (~8750/15845, resuming)

**Remaining**:
- [ ] Complete customer backfill (remaining ~7000)
- [ ] Register Shopify webhooks (orders/create, orders/updated, customers/update) for real-time sync
- [ ] Move work plan to completed/

---

### 3. ✅ Admin Dashboard
**Completed**: 2026-05-13
**Source of truth**: `specs/current/routes.md`

All pages functional with real data, shared UI components (PageHeader, Badge, DataTable, Mono, Muted), DM Sans/Mono typography, global date range picker (7d/30d/90d/YTD/All). Pages: dashboard, customers (list + detail + LTV), orders, attribution, campaigns & traffic (GA4), funnel (with bar visualization), products (SKU performance), settings.

---

### 4. ✅ Analytics Extraction Pipeline (Google + Meta + GSC) — all live + monitored
**Last worked**: 2026-06-29
**Source of truth**: `specs/work-plans/todo/google-integrations.md`
**Owner**: Greg

**All five extracts (GA4, Google Ads, Meta, PostHog, GSC) are live, current,
and guarded by the new health-cron staleness monitor as of 2026-06-29 — see the
"Shipped 2026-06-29" section at the top of this doc.** Sub-status below.

**GA4 — LIVE ✅** (broke ~05-22, self-recovered + backfilled in prod before 06-29)
- [x] Service account created + credentials in Vercel + .env.local
- [x] Service account added to GA4 via Analytics Admin API (OAuth Playground workaround for Google UI bug)
- [x] GA4 extraction verified working
- [x] 30-day backfill complete (752 rows)
- [x] Campaigns page shows real GA4 traffic data

**Google Search Console — LIVE ✅ (2026-06-29)**
- [x] Search Console API enabled (GCP `992120641760`); `sc-domain:fitwellbuckle.co` Domain property verified via Shopify DNS TXT; service account granted Restricted access; `GSC_SITE_URL` set in Vercel prod (sensitive)
- [x] Live daily cron verified + full ~16-month backfill (20,867 rows, 2025-02-27 → 2026-06-26). Work plan → `completed/gsc-pipeline-setup.md`

**Google Ads — LIVE ✅** (deprecated-version outage fixed 2026-06-29)
- [x] Manager Account created (272-385-8162), linked to Fitwell Ads (293-513-7197)
- [x] Developer token obtained, set in Vercel + .env.local
- [x] Google Ads API enabled on GCP project
- [x] Basic access approved; extraction live in `google_ads_daily`
- [x] **2026-06-29:** API `v20` deprecated/blocked by Google ~06-16 (silent 400 `UNSUPPORTED_VERSION`) — bumped to `v24`, gap backfilled. Pin lives in `ADS_API_VERSION` (`src/lib/analytics/google-ads.ts`); Google forces a version bump roughly yearly, so the staleness monitor will catch the next one.

**Meta Ads — LIVE ✅**
- [x] Ad Account ID: 821060387465001
- [x] Meta App "Ad Manager" created, connected to Fitwell Buckles business
- [x] System user "Fitwell Analytics" created (Employee access — upgrade to Admin after 7 days for write access / inventory management)
- [x] Ad Manager app assigned with full control
- [x] Token generated + `META_ACCESS_TOKEN` set in Vercel; `meta_ads_daily` table live; extraction current (66 days as of 06-28)

**Future: upgrade Meta system user to Admin** for inventory-aware ad management (pause ads when products go out of stock). Requires 7 days from system user creation (~2026-05-21).

---

### 5. 📋 Landing Page Framework (deferred)
**Last worked**: —
**Source of truth**: `specs/current/routes.md` (marketing section)
**Owner**: Greg

Deferred — Shopify is the primary web property for now. Decision logged in `specs/ops/domains/product.md`. Revisit when SEO content strategy is ready.

---

### 6. 🔨 Conversion Funnel Observability (PostHog) — **live, first week read**
**Last worked**: 2026-06-12 (theme redeploy live since 06-04; first-week funnel read done; linker over-emission bug fixed)
**Source of truth**: `specs/work-plans/todo/posthog-integration.md`, `specs/strategy/event-taxonomy.md`, `specs/strategy/funnel.md`
**Owner**: Greg

**Goal:** end-to-end visibility into the existing Shopify storefront funnel so we know where visitors actually bail. Drives the bottom-up strategy in "Current Strategic Focus" above — we cannot make data-driven calls about ad spend or landing pages until we can see the funnel.

**Done (2026-06-03):**
- [x] **Phase 0 spike:** vanilla install confirmed default stitching works (no `fw_distinct_id` bridge needed). Same-origin Custom Pixel iframe shares the `.fitwellbuckle.co` cookie. Findings: `specs/research/posthog-shopify-stitching.md`.
- [x] **Phase 1:** vanilla theme snippet + Custom Pixel live on production.
- [x] **Phase 2:** UTM capture + first-touch write-through to `utm_attribution` via `/api/tracking/utm` (CORS, idempotent on session_id). `fw_attribution` cookie marks first-touch.
- [x] **Phase 3:** `_fw_distinct_id` cart attribute backstop → orders/create webhook reads it, stamps `link_method = 'pixel'`, marks `utm_attribution.converted`, server-side enriches the PostHog Person with order + first-touch UTM.
- [x] **Phase 4:** server-side posthog-node client.
- [x] **Phase 5:** extraction cron (every 3h) populating `posthog_daily`.
- [x] **Phase 6:** pixel subscribes to `checkout_started`, `checkout_completed`, `product_viewed`, `product_added_to_cart`.
- [x] **Phase 7 (partial):** `/funnel` page now has a PostHog 5-stage funnel card; `/attribution` already shows orders+revenue by first-touch channel with link-confidence split.

**Deployed 2026-06-04** (theme snippet + Custom Pixel re-paste) — full
event taxonomy flowing since: pageview/product/cart/checkout events plus
`section_dwelled` / `section_scrolled_into_view` / `cta_clicked`.

**Done (2026-06-12):**
- [x] Baseline data accumulated (8 clean days, 06-04→11).
- [x] Biggest leak identified: **`product_viewed` → `product_added_to_cart` at 5.2%** vs the 8–12% target — full read in the Rightness table above. Discovery (83%) and checkout legs (72% / ~90%) beat targets.
- [x] **Fixed: server-side `purchase_completed` over-emission (~12×/day per order).** `linkOrderToAttribution` re-fired PostHog capture on every extract-shopify re-sync (2h cron, 25h overlap). Fixed in `d7bcf56` — emission now first-link-only, and re-syncs can no longer downgrade `self_report` links. `posthog_daily.purchase_completed` rows 06-04→06-12 remain inflated; read purchases from the `order` table for that window.
- [x] Side effect of the pixel going live: **forward-looking order linking works** — 71% of June orders carry `link_method` (43 pixel / 5 self_report / 1 email_match of 69) vs the 5.4% that opened `utm-linking-gap.md`. That work plan's remaining scope is historical backfill only.

**Remaining:**
- [ ] Future: identify admin staff in the admin posthog-provider (so staff Persons aren't created backwards via test purchases — Greg's admin events were back-stitched onto his email Person during the Phase 0 test).
- [x] **2026-06-29: email_match now emits `purchase_completed` + stamps `posthog_distinct_id`** when the matched touch carries a distinct_id — previously it linked the order in the DB but emitted nothing, leaving those conversions invisible to PostHog (why the PostHog purchase count sat below DB link coverage). Mirrors the pixel path now (`60d727f`; `attribution.md` §4). This fixes the *forward* path; retroactively replaying historical email_match orders into PostHog stays deferred (back-dating events is messy + low-value — advised against).

**Why this matters now:** every dollar of additional ad spend without instrumentation is a dollar we can't learn from. Until the funnel is observable, scaling top-of-funnel is throwing darts.

---

### 7. 🔨 Resend Email Integration (transactional live; digests deferred)
**Last worked**: 2026-05-27
**Source of truth**: `specs/work-plans/completed/resend-email-integration.md`
**Owner**: Greg

Transactional email is **live in production** as of 2026-05-27 — `RESEND_API_KEY` + `EMAIL_FROM` (`Fitwell Buckle Co. <info@portal.fitwellbuckle.co>`, on the verified `portal.fitwellbuckle.co` domain) set in Vercel and deployed. Powers supplier magic-link sign-in, PO handoff/activity notifications, invoice sends, and the deadline-alert cron. Invoice *payment links* started working 2026-05-28 once `write_draft_orders` was granted (see Blockers → Recently resolved). Digest/analytics emails remain low priority until the analytics pipeline is feeding data.

### 8. 🔨 Influencer Tracking (phase 1 — admin-managed)
**Last worked**: 2026-05-25
**Owner**: Oliver
**Branch**: `production-management` (PR)

Gift product to creators in exchange for content, tracked against a publish
deadline. Styled to mirror the B2B Orders/Brands system. Pricing = **gifting
(100% off) + an affiliate link per order**.

**Done (phase 1, admin-managed)**:
- [x] Schema: `influencer`, `influencer_contact`, `influencer_order` (+ line items), `influencer_order_number_seq` ("GIFT-00100"); migration `0011_sour_junta.sql` (influencer tables only — `user.influencer_id` deferred to the portal phase so the app never queries a missing column)
- [x] Pure `deadlineStatus()` helper (approaching/missed/hit/on_track/no_deadline) + 12 unit tests
- [x] Service + API: influencer CRUD, portal-login allowlist, gifting-order create (Shopify draft order at 100% off + affiliate link + content due date), order PATCH (deadline/published/link/status)
- [x] Pages under **Marketing**: `/influencers` (manager + assigned-collections picker), `/influencer-tracking` (deadline list, inline-edit deadline, mark published, affiliate link), `/influencer-tracking/new` (order form, picker restricted to assigned collections)
- [x] Nav + middleware + date-picker wiring; `npm run check` green (213 tests)

**Remaining / handoff**:
- [ ] **Migration-history reconciliation (carryover from the main-merge consolidation).** `drizzle-kit migrate` fails on this branch with `type "production_stage" already exists` — the DB physically has everything through `0010`, but drizzle's `__drizzle_migrations` table doesn't recognize the consolidated `0010` file, so it re-runs it. This blocks **any** `db:migrate` here and on production. Needs a deliberate reconciliation with Greg (consistent across all dev branches + prod).
- [ ] **NOTE for that reconciliation:** Oliver's dev branch (`ep-icy-lake-aqix27gq`) already has the influencer tables created **directly** (via `/tmp/apply-influencer-tables.mjs`, bypassing drizzle tracking) to unblock local work. So `0011_sour_junta` is applied in the DB but **not recorded** in `__drizzle_migrations` — the reconciliation must mark it applied (or it'll try to recreate and fail with "already exists").
- [x] Grant Shopify `write_draft_orders` scope so gifting draft orders actually push — granted 2026-05-28 (see Blockers → Recently resolved)
- [ ] **Phase 2 (next chunk): self-serve influencer portal** — `role='influencer'`, magic-link login (`influencer_contact` allowlist), browse only assigned collections, enter publish date at checkout

---

### 9. 🔨 Strategic Funnel — Next Iteration (in flight)
**Last worked**: 2026-06-03 (Phase 4 shipped)
**Source of truth**: `specs/work-plans/todo/funnel-strategy-next-iteration.md`
**Owner**: Tom (planning), Greg (engineering)

V1 of `/funnel/strategy` shipped 2026-05-26 (commits `81e4079`, `fd5f5bd`). Iteration plan progress:
- [x] **Phase 1: Tier 1 quick wins** — D2C wholesale filter + Meta cold/retargeting split shipped 2026-05-27 (`067d6be`). GSC auth unblock deferred.
- [x] **Phase 2: Channel × persona cross-cut** — segment pills + per-channel segment mix bars (data layer `c9e92ec`, UI `c209fdc`).
- [x] **Phase 3: Klaviyo API integration** — Phase 0 read-side shipped in `c209fdc`. Per-order grain attribution deferred to Phase 0.5.
- [x] **Phase 4: Order position split (acquisition vs retention)** — shipped 2026-06-03. Runtime-computed via `ROW_NUMBER` window function instead of stored column (preserved zero-drift guarantee that two existing denormalized customer fields have already broken).
- [x] **Phase 5: Judge.me API integration** — shipped 2026-06-03. New `review` table, paginated client + idempotent extract cron at 07:45 UTC, advocate stage in retention loop is now live-computed (outfitter customers whose email matches a reviewer's). Confidence falls back to `weak` with a how-to-fix note when the table is empty (Judge.me API key + outage clearance still pending).

**Iteration plan complete.** Pending follow-ups: vocabulary-map drift script (deferred, cheap), per-order Klaviyo flow attribution grain (Phase 0.5 of `klaviyo-integration.md`), upper-funnel persona × stage cross-cut (needs PostHog client-side).

PostHog client-side instrumentation (workstream 6) is the largest unblock for upper-funnel measurement but is independent of this plan.

---

### 10. 🔨 Post-Purchase Retention Motion (Klaviyo Phase 4 + signup lift) — **current lead workstream**
**Last worked**: 2026-06-10 (W5 §6 added to 360-campaign; PRIORITIES recalibrated)
**Source of truth**: `specs/strategy/360-campaign.md` (W5), `specs/strategy/sessions/2026-06-09-retention-led-recal.md`, `specs/work-plans/todo/klaviyo-integration.md`
**Owner**: Tom (flow + content approval), Greg (Phase 4 deploy infra — architecture signed off 2026-06-09)

The retention-led strategic focus above, as a trackable workstream. Flow
shape locked 2026-06-09: **D1** install guide → **D14** "how many
watches?" (intel only, gates nothing) → **D21** Judge.me review ask →
**D30** outfit-the-collection code (25% off 5+, 30-day expiry, goes to
everyone). Single discount touchpoint; product-experience-led posture.

- [ ] Tom: create the post-purchase flow skeleton in Klaviyo UI (~15–20 min) — **blocks deployment** (copy is now drafted, so this is the gate)
- [x] **Email copy drafted + redesigned 2026-06-20 → `specs/strategy/retention-email-content.md`** — two fully-automated Fulfilled-triggered flows: post-purchase **nurture** (E1 setup branched per product M1/M4 & gated on product-newness → E2 value → E3 cross-sell → E4 outfit code; outfitters divert to an automated **founder-touch**, reply-to `info@`) + a separate **review-request** flow (replaces Judge.me's 3-variant timing; POS+10/dom+14/intl+26, one reminder, suppress-if-reviewed, Judge.me↔Klaviyo). Plus the welcome A/B *challenger* and the single-use D30 code rec. D14 cut. v1 is paste-based (Phase 4 pipeline not built); full Klaviyo build spec + 6 open confirmations in the doc. (Was WS2 of the Fable sprint — Fable access was cut on day 2, work continued on the standard model.)
- [ ] Generate D30 outfit code in Shopify (25% off any 5+, 30-day expiry) — **recommendation: single-use** (Klaviyo coupon + Shopify price rule) + add an `outfit` classifier family; rationale in the content doc
- [x] Discount-code-name visibility — **SHIPPED to prod 2026-06-10, plan complete** (`specs/work-plans/completed/discount-code-visibility.md`). `order_discount_code` table (migration `0058`), sync captures codes, classifier families (welcome/creator/review/service/event/other), first-order discount split card on `/funnel/strategy`, prod backfilled (802 orders). **Prod C1 baseline (Apr 10 → Jun 10, 399 first orders): 71.9% no-code · event 10.0% (Windup SF) · welcome 8.8% · creator 7.5% (all watchbros, zero watchchris) · review 0.5%.** Key reframe for W5 §6: the "32.5% use a discount" band was hiding the SF event — true *online signup* capture is ~9% of first orders. Full history rides on the Feb-2024 import (auto-populates through `upsertOrder()`)
- [x] Add signup-lift workstream to `360-campaign.md` W5 §6 — done 2026-06-10
- [x] Update PRIORITIES.md with the retention-led sequence — done 2026-06-10
- [ ] Signup-lift experiments: design now, launch once PostHog client-side data accumulates (see W5 §6 for the four candidates)

### 11. 🔨 Newsletter — daily watch-industry brief ("The Daily Micro-Adjust")
**Last worked**: 2026-06-11 (Fitwell branding + monetization layer shipped)
**Source of truth**: `specs/strategy/newsletter.md` + `specs/current/newsletter-engine.md`
**Owner**: Tom

Engine phase 1 shipped: RSS/proxied fetch (source registry in
`newsletter/sources.ts`, incl. live WatchPro scrape) → dedup → Claude
triage/summarize (`claude-opus-4-8`, mirrors the CRM's forced-tool
pattern) → MJML brief (reuses the Klaviyo template pipeline + UTM
injection) → Klaviyo **draft** (never auto-sends; manual send while the
voice settles). Tables `newsletter_source` / `newsletter_article` /
`newsletter_campaign` in migration `0057` (applied to tom-dev; **not
yet applied to prod**). GH Actions workflow at 09:00 UTC Mon–Fri with a
manual dry-run/draft dispatch. Decisions logged in
`specs/strategy/newsletter.md` (new standalone Klaviyo list; B2B
announcement instead of auto-enroll; name riff pending, one-file rename).

**Go-live blockers**:
- [ ] Tom: `ANTHROPIC_API_KEY` into `.env.local` (Vercel marks it
      sensitive — env pull returns it empty) → run
      `npm run newsletter:dry-run`, review voice in the `/tmp/*.html` output
- [ ] Tom: create the Klaviyo newsletter list → `NEWSLETTER_KLAVIYO_LIST_ID`
- [ ] Set GH Actions secrets: `ANTHROPIC_API_KEY`, `KLAVIYO_API_KEY`,
      `NEWSLETTER_KLAVIYO_LIST_ID`, `NEWSLETTER_DATABASE_URL`
- [x] Apply migration 0057 to prod before pushing — done 2026-06-10
      (`db:migrate:prod` applied 0057 + 0058 together; prod at 59/59)

**Branding & monetization (2026-06-11, commit `579316b`)**: the brief is
now a Fitwell-branded content asset. Title finalized to **"The Daily
Micro-Adjust"** (gold `#c08a4d` accent, matching section headers); 2026
Fitwell™ wordmarks in the masthead (white) and sponsor module (gold).
Added a rotating **"From Fitwell" sponsor module** right after Business &
Industry — two-column (logo + copy + CTA left, the micro-adjust buckle
GIF right; GIF cropped/optimized 7.5MB → 0.56MB so it renders instantly).
**10 modules** rotating one-per-issue on a weekday-count index (no weekend
skips), split 7 D2C (shop) / 3 OEM (`/pages/oe-services`), each with
per-module UTM (`utm_content=module-<id>`). Branded footer with a
"Discover the perfect fit →" CTA (`utm_content=footer`). Logic in
`newsletter/sponsor.ts`; copy grounded in `personas.md` + `b2b-pipeline.md`.

**Next phases**: Playwright scrape sources (auction houses, IR pages —
WatchPro shipped via proxy; Europa Star evaluated and dropped
2026-06-10), image pipeline (Vercel Blob),
extract-klaviyo stats backfill into `newsletter_campaign`, send
automation after the voice settles.

---

## Completed Workstreams

- **Infrastructure Setup** — 2026-05-11 — NeonDB, Vercel, domain, OAuth, dev branching
- **Admin Dashboard MVP** — 2026-05-13 — All pages live with real data, shared components, date range picker
