# Newsletter Engine

Last updated: 2026-06-10

Technical implementation for the daily watch-industry newsletter.
Strategy lives in [../strategy/newsletter.md](../strategy/newsletter.md).

> **Status: phase 1 built (2026-06-10).** RSS fetch → dedup → Claude
> triage/summarize → MJML render → Klaviyo **draft**. Schema migrated
> (`0057`). Not yet live: Klaviyo list (Tom), GitHub Actions secrets,
> Playwright scrape sources, image pipeline, automated send.

## Architecture (as built)

```
GitHub Actions cron (09:00 UTC Mon–Fri)
        │
        ▼
newsletter/main.ts (tsx, deps hoisted to root package.json)
        │
        ├── sources.ts      registry of feeds, synced to newsletter_source (upsert on slug)
        ├── fetch.ts        RSS/Atom via rss-parser; per-source fail-soft
        ├── dedup.ts        normalized-URL + content-hash + title-similarity vs newsletter_article (14-day window)
        ├── editorial.ts    Claude (claude-opus-4-8): one triage call per batch
        │                   (include/drop + Segment × Type), then per-story
        │                   summaries (fail-soft to feed excerpt)
        ├── generate.ts     MJML brief → compileMjml + injectUtms
        │                   (reuses src/lib/klaviyo/templates)
        └── main.ts         orchestration; --dry-run | --draft
        │
        ▼
Klaviyo DRAFT campaign (via src/lib/klaviyo/draft-campaign — never sends)
Drizzle/Neon: newsletter_source, newsletter_article, newsletter_campaign
```

### Corrections vs the original plan

- **Anthropic, not OpenAI.** The repo has no OpenAI integration; the
  existing LLM stack is `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`
  (`src/lib/ai/anthropic.ts`). The engine mirrors that file's
  forced-tool + zod-validate pattern on `claude-opus-4-8`.
- **MJML, not React Email.** The Klaviyo Phase 1 work already built an
  MJML → HTML → UTM-injection pipeline (`src/lib/klaviyo/templates.ts`);
  the brief reuses it, so every Fitwell link carries
  `utm_campaign=micro-adjust-<date>` for /funnel/strategy attribution.
- **Draft, not send (v1).** `draftCampaign()`'s hard contract is that it
  never sends — sending stays a manual click in Klaviyo while the voice
  settles (first ~3 sends per strategy doc). An automated
  campaign-send-job step is a deliberate later change.
- **Same Neon DB** (Critical Rule 6 — one shared schema). No separate
  branch; tables shipped in migration `0057_faithful_the_spike.sql`.
- **Deps hoisted to root.** Only new dependency: `rss-parser`.

## Commands

```bash
npm run newsletter:dry-run   # fetch → triage → summarize → HTML to /tmp; no DB writes, no Klaviyo
npm run newsletter:draft     # full run: DB writes + Klaviyo draft campaign
```

Local env needed: `ANTHROPIC_API_KEY` (note: marked *sensitive* in
Vercel, so `vercel env pull` returns it empty — paste it into
`.env.local` from the Anthropic console), `KLAVIYO_API_KEY`,
`NEWSLETTER_KLAVIYO_LIST_ID` (draft mode only), `DATABASE_URL`.

## Workflow file

`.github/workflows/newsletter-daily.yml` — cron `0 9 * * 1-5` +
`workflow_dispatch` with a dry-run/draft mode picker (dry-run uploads
the HTML as an artifact). Repo secrets required before first scheduled
run: `ANTHROPIC_API_KEY`, `KLAVIYO_API_KEY`,
`NEWSLETTER_KLAVIYO_LIST_ID`, `NEWSLETTER_DATABASE_URL` (production
Neon pooled URL).

DST handling: cron pinned at 09:00 UTC year-round (4am ET during DST —
accepted; Geneva opens 10am CEST).

## Schema (shipped, migration 0057)

Three tables in `src/lib/schema.ts`, following repo conventions (text
ids via `crypto.randomUUID()`):

- **`newsletter_source`** — feed registry, unique on `slug` (the join
  key to the code-side registry in `newsletter/sources.ts`; renames
  don't orphan articles). `is_active=false` retires a source without
  losing history; `requires_playwright` flags the scrape-phase set.
- **`newsletter_article`** — every story considered, included *or*
  dropped (`dropped_reason` audit trail: dedup reasons + triage
  verdicts). Unique on normalized `url`; `content_hash` +
  title-similarity catch syndicated re-posts.
- **`newsletter_campaign`** — one row per send. `status`
  (`draft`/`sent`), `klaviyo_campaign_id`, html hash, and stat columns
  (recipients/opens/clicks/unsubs) to be backfilled by the
  extract-klaviyo cron (**not wired yet**).

Subscriber list stays in Klaviyo as source of truth — no subscriber
table.

## Source registry state (phase 1)

Each source declares a `fetchMode` (in `newsletter/sources.ts`):

- **`rss` (9, direct):** Hodinkee, aBlogtoWatch, Worn & Wound, Fratello,
  Monochrome, Quill & Pad, SJX, Watches of Espionage
  (`/blogs/woe-dispatch.atom`), Watchonista.
- **`rss-proxied` (3): WatchTime, Time + Tide, Revolution.**
  - **WatchTime** — Cloudflare-walled (403s direct), but its Atom feed is
    fresh, so it's fetched through BrightData. The working feed is
    `/feed/atom` (`/feed/` and `/feed/rss` both fail). The feed carries no
    images; enrichment resolves them via og:image scrape through the proxy.
    Verified live 2026-06-10.
  - **Time + Tide & Revolution** — both plain `rss` until 2026-06-14, when
    they started returning `415` to GitHub Actions' datacenter IP while
    still serving `200` to a residential IP regardless of headers (a
    CDN/WAF IP block, not a header bug). Two of the main *news* feeds
    dropping at once shipped a 0-hard-news edition that day, so both were
    moved to BrightData. Verified through the proxy (30 / 6 items). Their
    feeds carry images, so no og:image fallback needed.
- **`scrape-watchpro` (1): WatchPro** — Cloudflare-walled *and* its RSS
  feed is unusable (CDN serves a stale cached copy, `lastBuildDate`
  frozen days behind the live site — a WordPress full-page-cache bug).
  So we scrape the live `/news/` HTML listing through the BrightData
  proxy (`newsletter/scrape/watchpro.ts`); dates come from each
  article's `<time datetime>` (the `/cloud/YYYY/MM/DD/` image path is a
  fallback). Needs `BRIGHTDATA_USERNAME`/`PASSWORD`. Fail behavior (fixed
  2026-06-13): creds **absent** → returns [] quietly (dev runs without
  BrightData stay green); creds **present** but the fetch comes back empty
  → **throws**, so the run logs `source failed: watchpro`. The old silent
  `return []` made a proxy/Cloudflare failure indistinguishable from
  "fetched fine, nothing new" — a scheduled run could lose WatchPro
  without any trace. Verified live 2026-06-10 — contributed 8 stories
  (the brief's biggest source that run: Rolex price hike, Swiss export
  data, retailer financials).
_(Europa Star was evaluated and dropped 2026-06-10 — publishes too
infrequently, month-granularity dates, real content gated behind a
PDF-style mag viewer.)_

> **Lesson: don't trust an RSS feed's freshness — verify against the
> live site.** WatchPro's feed returned HTTP 200 with 200 items but its
> newest was 7 days old while the homepage had same-day articles. Any
> feed-based source can silently freeze this way; the scrape path reads
> what readers actually see.

**Freshness applies to every mode.** `fetchOneSource` runs the
`lookbackHours` (36h) filter on *all* sources — RSS, proxied, and
scraped — at the dispatch boundary, so a listing page's week-deep
backlog can't leak in. The scraped source (WatchPro) carries real
per-article dates from `<time datetime>`. A scraper that returned
dateless items would silently include stale stories — covered by
`fetch.test.ts`.

**Repeats across daily sends.** The 36h window deliberately overlaps the
24h cadence (catches edge-of-window / delayed-run stories). Repeats are
prevented by dedup: every fetched story is persisted to
`newsletter_article`, and each run filters out anything seen in the last
14 days *before* triage (`loadSeen` → `filterNew`). So window > cadence
+ dedup = no misses, no repeats. **Dry-run skips the seen-table** (no DB
reads/writes), so consecutive dry-runs show the same pool — that's
preview behavior, not what production does.
- **`playwright` (5, inactive):** Phillips, Christie's, Sotheby's,
  Swatch Group IR, Richemont IR — auction houses + IR pages, deferred to
  the headless-scrape phase.

**Cloudflare bypass:** there is no free, reliable way past Cloudflare's
residential bot challenge from a datacenter IP (GitHub Actions). Both a
plain fetch and a real headless Chrome (Playwright) get 403'd by
WatchPro. The cannabis engine solves the same problem with BrightData
residential proxies (its `ResidentialProxyScraper`); we reuse that
approach and Tom's existing BrightData account (`newsletter/scrape/proxy.ts`,
undici `ProxyAgent`). Still-blocked sources without a proxy route are
left inactive rather than half-working.

Three gotchas the proxy code handles: (1) pair undici's `fetch` with its
`ProxyAgent` — Node's global fetch uses a different bundled undici and
throws `invalid onRequestStart method`. (2) Residential zones throttle
concurrent sessions, so when several proxied sources (WatchPro +
WatchTime) fetch at once, some requests transiently fail; `proxiedFetch`
retries 4× with linear backoff and a broad `Accept` (RSS + Atom).
Without the backoff, WatchTime intermittently dropped from the brief.
(3) Backoff alone wasn't enough — `fetchAllSources` fires every source in
parallel, so both proxied sources still hit the one zone simultaneously.
`proxiedFetch` now runs its calls through `runProxiedExclusive`, a
width-1 queue that **serializes proxied fetches** (WatchPro waits for
WatchTime, etc.) while direct RSS keeps running in parallel. Trades a few
seconds of wall-clock for not competing over a single zone session
(added 2026-06-13, after WatchTime failed all 4 retries in back-to-back
scheduled runs).

Not yet attempted: Reddit / WatchCrunch (403 bot fetches — community
signal, lower priority; Reddit has an authed API option), Hairspring,
Wind Vintage, Bonhams, Antiquorum, direct microbrand-site tracking.

Registered but inactive (Playwright/scrape phase): WatchPro (feed
exists but Cloudflare 403s non-browser fetches), Phillips,
Christie's, Sotheby's, Swatch Group IR, Richemont IR.

## Editorial pipeline

- **Triage**: one Claude call over the whole fresh batch. Editorial cut
  prompt encodes the cover-heavy rules, the Segment × Type taxonomy
  (6 types — see below), per-story priority (1 = lead; **never a
  review/podcast/release**, enforced again in code), and duplicate
  collapsing (`duplicateOfUrl` → "Also at" links). The brief is now a
  near-complete record of the serious press: most genuine watch-trade
  content is *routed to a section* rather than dropped (decision
  2026-06-13). Verdicts matched by URL; missing/incomplete verdicts
  degrade to "dropped", never fail the run.
- **Types & sections** (`newsletter/types.ts` `STORY_TYPES`/`TYPE_LABELS`):
  `business` (hard news **and** business/market analysis — analysis rides
  with Business, not Community), `auction`, `community` (Community &
  Culture — profiles, culture, vintage human-interest), `release`,
  `review` (NEW), `podcast` (NEW). Render order: Business & Industry →
  Auction & Market → Community & Culture → Reviews → New Releases →
  Podcasts — all full cards (image + summary).
- **Caps**: `maxStories` (12) applies to the hard-news group
  (`business`/`auction`/`community`) only — **releases, reviews and
  podcasts are never capped** (`NEWS_TYPES` set in `main.ts`). Those
  sections are the complete record of what the press published; we don't
  arbitrate between the brands we court (decision 2026-06-10/06-13).
- **Enrichment (post-triage)**: ONE page fetch per selected story yields
  both the image (feed image → og:image) and the **full article text**
  (`extractArticleText`: `<article>`-scoped paragraphs, 12K-char cap).
  Two UA profiles (some WAFs 403 a bare Chrome UA); 1.5MB read cap
  (Worn & Wound inlines ~750KB before content).
- **Summarize**: per story, 2–3 sentences, concurrency 4, **grounded in
  the fetched article text** — the prompt forbids stating any
  price/run-size/date/spec not present in the source (vague beats
  invented; misstating a brand's price in front of retailers is a
  credibility wound). Fail-soft to the feed excerpt with a
  be-careful-with-specifics note. Per-type notes: **releases** get the
  brand-neutrality instruction (factual/generous, no verdicts);
  **reviews** report the publication's verdict *attributed to that outlet*
  ("Worn & Wound finds…") so the opinion is theirs, never Fitwell's;
  **podcasts** get one sentence (who/what/why-care). The opinionated
  Puck-for-watches voice applies to business/market analysis only.
- Voice iteration happens by editing the `EDITORIAL_CUT` / `VOICE`
  prompts in `newsletter/editorial.ts` after Tom reviews test briefs.

## Failure modes (as implemented)

| Failure | Handling |
|---------|----------|
| One feed down / 403 / 404 | Logged, run continues with remaining feeds |
| Triage returns invalid tool input | One retry, then run fails (no brief beats a garbage brief) |
| Single summary call fails | Story keeps its feed excerpt |
| Zero fresh stories / triage drops all | Run exits cleanly, "no brief today" |
| Klaviyo draft/send fails | **Nothing is persisted** — DB writes happen only after the Klaviyo action succeeds, so no story is marked seen-but-unsent. The Klaviyo draft may exist; a re-run re-drafts (idempotent by slug) and ships. Stories stay eligible for the next run. |
| Campaign already sent for slug | The early guard in `run()` short-circuits to a clean no-op *before the pipeline runs* (no fetch, no triage, no DB writes). If a run races past the guard, `draftCampaign` throws `CampaignAlreadySentError` and `publishToKlaviyo` exits before any persist — same net effect. |

### Run health verdict (`newsletter/run-summary.ts`)

A brief can **send and still be degraded** — Klaviyo emails whatever it's
handed and the workflow exits `0`, so a source-starved or news-less edition
looks identical to a clean one at the process level. To stop that reading as
success, every run ends with a machine-readable verdict block:

```
=== RUN SUMMARY ===
sources: N failed — slug (error); ...
brief: H hard-news + R releases + V reviews + P podcasts
STATUS: OK | DEGRADED | NO_BRIEF — reasons
```

`classifyRun()` (pure, unit-tested) decides the STATUS:

- **`DEGRADED`** — any source failed, *or* an edition shipped with **0
  hard-news** stories. (The 2026-06-14 edition: 3 source failures, 0
  hard-news — sent, but degraded.)
- **`NO_BRIEF`** — nothing to send (nothing fresh / triage dropped all) **and**
  every source fetched: a genuinely quiet day, not a fault.
- **`OK`** — edition shipped, every source fetched, ≥1 hard-news story.

The **"Newsletter run check"** cloud routine (daily 13:00 UTC, drafts a glance
email to Tom) reads this `STATUS:` line and **leads** its subject + top line
with it (`⚠️ DEGRADED` / `🔴 PROBLEM` / `✅ SENT` / `➖ NO BRIEF`) instead of a
flat "SENT ✓". It keeps send-status (did "SENT to list" appear?) and
edition-health (STATUS) as separate verdicts so a successful send can't mask a
broken edition. Manage it via `/schedule` or claude.ai/code/routines.

## Idempotency & the dual trigger

The production newsletter fires from **two** triggers that share the same
`-auto` slug for a given date:

1. **Primary — Vercel cron → `/api/cron/newsletter-trigger`** fires a
   `workflow_dispatch` (`scheduled=true`) at ~08:55 UTC. This is the run
   that actually sends.
2. **Fallback — GitHub `schedule:` cron** at 10:00 UTC. Exists so a Vercel
   outage or token failure still gets the brief out.

Because both own the same slug, exactly one must send and the other must
be a complete no-op. Two layers enforce this:

- **Early guard (`newsletter/guard.ts`, checked at the top of `run()`):**
  looks up the slug in Klaviyo; if its status is anything but `draft`, the
  run exits immediately — *before* fetch/triage/enrich. This is the normal
  path for the fallback on a day the primary already sent: no wasted Claude
  / BrightData spend, and no DB writes.
- **Persist-after-send ordering (`publishToKlaviyo`):** all DB writes
  (`newsletter_campaign` row + `persistArticles`) happen only *after* the
  Klaviyo draft/send succeeds. A story is therefore marked "seen" only once
  the issue carrying it has shipped.

> **Why both — the swallowed-stories bug (fixed 2026-06-13).** The original
> ordering persisted articles *before* calling Klaviyo, then bailed on
> `CampaignAlreadySentError`. On 2026-06-13 the 10:00 fallback found two
> releases the 08:55 send had missed (published in between), wrote them to
> `newsletter_article` (marking them seen + `included_in_campaign_id`), then
> discovered the campaign was already sent and exited — so they were never
> emailed and the 14-day dedup would suppress them forever. The guard stops
> the fallback before it can fetch them; the persist-after-send ordering is
> the backstop if anything ever races past the guard. The fallback's
> purpose is preserved: if the primary never sent, no sent campaign exists,
> so the guard lets the fallback through to send.

## Remaining phases

| Phase | Scope |
|-------|-------|
| Go-live checklist | Tom: Klaviyo list + `NEWSLETTER_KLAVIYO_LIST_ID`; set the 4 GH Actions secrets; local `ANTHROPIC_API_KEY`; first dry-run review of voice |
| Playwright scrape | `newsletter/scrape/` for the inactive sources (auction houses, IR pages); ScraperAPI fallback |
| Images | Download + Vercel Blob upload, hero-image slot in template (`image_url` column already exists) |
| Stats backfill | Extend extract-klaviyo cron to stamp `newsletter_campaign` stats + flip `status` to `sent` |
| Send automation | Klaviyo campaign-send-job after the voice settles; needs an explicit guard (e.g. only campaigns matching `micro-adjust-*`) |
| Microbrand release tracking | Curated drop-watch set from the strategy doc — likely scrape-phase |

## Migration from cannabis engine

Unchanged from the original plan: prompts, editorial filter rules, and
dedup algorithm adapt from Elevated Insights as *patterns*; no Python
code transfers.
