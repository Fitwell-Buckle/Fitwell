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

- **`rss` (11, direct):** Hodinkee, aBlogtoWatch, Worn & Wound, Fratello,
  Monochrome, Time + Tide, Quill & Pad, SJX, Watches of Espionage
  (`/blogs/woe-dispatch.atom`), Revolution, Watchonista.
- **`rss-proxied` (1): WatchTime** — Cloudflare-walled (403s direct), but
  its Atom feed is fresh, so it's fetched through BrightData. The working
  feed is `/feed/atom` (`/feed/` and `/feed/rss` both fail). The feed
  carries no images; enrichment resolves them via og:image scrape through
  the proxy. Verified live 2026-06-10.
- **`scrape-watchpro` (1): WatchPro** — Cloudflare-walled *and* its RSS
  feed is unusable (CDN serves a stale cached copy, `lastBuildDate`
  frozen days behind the live site — a WordPress full-page-cache bug).
  So we scrape the live `/news/` HTML listing through the BrightData
  proxy (`newsletter/scrape/watchpro.ts`); dates come from each
  article's `<time datetime>` (the `/cloud/YYYY/MM/DD/` image path is a
  fallback). Needs `BRIGHTDATA_USERNAME`/`PASSWORD`; fails soft (returns
  []) without them. Verified live 2026-06-10 — contributed 8 stories
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

Two gotchas the proxy code handles: (1) pair undici's `fetch` with its
`ProxyAgent` — Node's global fetch uses a different bundled undici and
throws `invalid onRequestStart method`. (2) Residential zones throttle
concurrent sessions, so when several proxied sources (WatchPro +
WatchTime) fetch at once, some requests transiently fail; `proxiedFetch`
retries 4× with linear backoff and a broad `Accept` (RSS + Atom).
Without the backoff, WatchTime intermittently dropped from the brief.

Not yet attempted: Reddit / WatchCrunch (403 bot fetches — community
signal, lower priority; Reddit has an authed API option), Hairspring,
Wind Vintage, Bonhams, Antiquorum, direct microbrand-site tracking.

Registered but inactive (Playwright/scrape phase): WatchPro (feed
exists but Cloudflare 403s non-browser fetches), Phillips,
Christie's, Sotheby's, Swatch Group IR, Richemont IR.

## Editorial pipeline

- **Triage**: one Claude call over the whole fresh batch. Editorial cut
  prompt encodes the cover-heavy rules, the Segment × Type taxonomy,
  per-story priority (1 = lead; **never a podcast/interview/release**,
  enforced again in code), and duplicate collapsing (`duplicateOfUrl` →
  "Also at" links). Verdicts matched by URL; missing/incomplete
  verdicts degrade to "dropped", never fail the run.
- **Caps**: `maxStories` (12) applies to hard news only — **releases
  are never capped**. The New Releases section is the complete, neutral
  record of what's new; we don't arbitrate between brands we court
  (decision 2026-06-10, see strategy doc → New Releases).
- **Layout**: sections by Type (Business & Industry → Auction & Market
  → Community & Analysis → New Releases last); segment is the eyebrow
  tag on each story.
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
  be-careful-with-specifics note. Releases additionally get the
  brand-neutrality instruction (factual/generous, no verdicts); the
  opinionated Puck-for-watches voice applies to business/market
  analysis only.
- Voice iteration happens by editing the `EDITORIAL_CUT` / `VOICE`
  prompts in `newsletter/editorial.ts` after Tom reviews test briefs.

## Failure modes (as implemented)

| Failure | Handling |
|---------|----------|
| One feed down / 403 / 404 | Logged, run continues with remaining feeds |
| Triage returns invalid tool input | One retry, then run fails (no brief beats a garbage brief) |
| Single summary call fails | Story keeps its feed excerpt |
| Zero fresh stories / triage drops all | Run exits cleanly, "no brief today" |
| Klaviyo draft fails | Articles + campaign row already written; `klaviyo_campaign_id` stays null; re-run is safe (article upserts are `onConflictDoNothing`, `draftCampaign` is idempotent by slug) |
| Campaign already sent for slug | `CampaignAlreadySentError` — refuses to overwrite |

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
