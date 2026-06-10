# Newsletter Engine

Last updated: 2026-06-10

Technical implementation for the daily watch-industry newsletter.
Strategy lives in [../strategy/newsletter.md](../strategy/newsletter.md).

> **Status: scoped, not built.** Architecture decided. Schema additions
> drafted but not migrated. Session 2 work.

## Architecture

```
GitHub Actions cron (5am ET)
        │
        ▼
newsletter/main.ts (TypeScript, tsx)
        │
        ├── newsletter/feeds/        RSS + Playwright scrape per source
        ├── newsletter/scrape/       Cloudflare bypass via Playwright + stealth
        ├── newsletter/images/       download + upload to Vercel Blob → CDN URL
        ├── newsletter/classify/     OpenAI: Segment × Type per article
        ├── newsletter/summarize/    OpenAI: 2-3 sentence summary per article
        ├── newsletter/dedup/        URL hash + title similarity check vs `newsletter_article`
        ├── newsletter/generate/     HTML assembly (React Email or Mustache)
        └── newsletter/send/         Klaviyo: template → campaign → send-job
        │
        ▼
Klaviyo campaign → subscribers
Drizzle/Neon: writes `newsletter_article`, `newsletter_campaign` rows
PostHog: `newsletter_sent` event with persona/segment breakdown
```

## Why GitHub Actions, not Vercel Cron

Vercel Cron's structural ceilings break this workload:

- **Function timeout**: Pro tier 60s default / 800s with Fluid Compute.
  Realistic runtime is 4–7 min (25+ feeds × scrape + image downloads +
  OpenAI calls). Inside the ceiling but tight — any OpenAI rate-limit
  hiccup, any Cloudflare challenge that takes 30s instead of 5s, breaks
  the budget.
- **Headless Chrome in serverless**: Vercel supports `@sparticuz/chromium`
  but it's a specialized setup with version-pin gotchas. Worse than
  `npm install playwright` on a normal runner.
- **Memory ceiling**: Pro 3008MB. Heavy image work (50 images
  decoded/resized in parallel) can OOM.
- **Failure cascades**: a bad newsletter run could spike error rates on
  the Fitwell Vercel project.

GitHub Actions gives 6-hour runtime, full Ubuntu runner, native
Playwright, and zero impact on the Vercel deploy when it fails.

**Trade-offs we accept:**
- Cron scheduling drifts ±5–15 min. Acceptable for a 5am send window.
- No native retries — we add explicit retry logic in code.
- Cold start 30–60s per run.

## Workflow file

`.github/workflows/newsletter-daily.yml`

```yaml
name: Newsletter Daily
on:
  schedule:
    - cron: "0 9 * * 1-5"   # 5am ET, Mon-Fri (UTC=ET+5 standard, +4 DST)
  workflow_dispatch:        # manual trigger for testing

jobs:
  send:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx tsx newsletter/main.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          KLAVIYO_API_KEY: ${{ secrets.KLAVIYO_API_KEY }}
          VERCEL_BLOB_TOKEN: ${{ secrets.VERCEL_BLOB_TOKEN }}
          DATABASE_URL: ${{ secrets.DATABASE_URL_NEON_NEWSLETTER }}
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
```

DST handling: cron runs at 09:00 UTC year-round, accepting that during
DST the send actually goes at 4am ET (still serves the audience window
since Geneva opens at 10am CEST). Can adjust to a second workflow with
date-gated cron if needed.

## Schema additions

New tables in `src/lib/schema.ts`. Surfaced per
[contributing.md](contributing.md) — new DB tables are sticky and
should be discussed before merging.

```typescript
// newsletter_source — the curated list of feeds we pull from
export const newsletterSource = pgTable('newsletter_source', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),              // "Hodinkee"
  category: text('category').notNull(),      // "editorial" | "b2b" | "auction" | "ir" | "microbrand"
  feedUrl: text('feed_url'),                 // null if scrape-only
  scrapeUrl: text('scrape_url'),             // landing page for scrape fallback
  requiresPlaywright: boolean('requires_playwright').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// newsletter_article — every story considered (included or dropped)
export const newsletterArticle = pgTable('newsletter_article', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => newsletterSource.id),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  publishedAt: timestamp('published_at'),
  contentHash: text('content_hash').notNull(), // for dedup
  summary: text('summary'),
  segment: text('segment'),                    // 'luxury' | 'mid' | 'microbrand' | 'vintage-auction'
  type: text('type'),                          // 'release' | 'business' | 'auction' | 'community'
  imageUrl: text('image_url'),                 // Vercel Blob URL
  includedInCampaignId: uuid('included_in_campaign_id').references(() => newsletterCampaign.id),
  droppedReason: text('dropped_reason'),       // null if included
  createdAt: timestamp('created_at').defaultNow(),
});

// newsletter_campaign — every send
export const newsletterCampaign = pgTable('newsletter_campaign', {
  id: uuid('id').primaryKey().defaultRandom(),
  klaviyoCampaignId: text('klaviyo_campaign_id').notNull().unique(),
  sentAt: timestamp('sent_at'),
  subject: text('subject').notNull(),
  articleCount: integer('article_count').notNull(),
  htmlHash: text('html_hash').notNull(),
  // stats backfilled by extract-klaviyo cron
  recipientCount: integer('recipient_count'),
  openCount: integer('open_count'),
  clickCount: integer('click_count'),
  unsubscribeCount: integer('unsubscribe_count'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

Subscriber list itself stays in Klaviyo as source of truth — no
`newsletter_subscriber` table. The existing `extract-klaviyo` cron
([scheduled-jobs.md](scheduled-jobs.md)) backfills campaign stats
into `newsletter_campaign`.

## External dependencies

- **OpenAI** — summarization + classification. Reuse existing
  `OPENAI_API_KEY` env.
- **Klaviyo** — sender. Reuse existing wrapper. Newsletter list is a
  new tagged segment (decision pending in
  [newsletter.md](../strategy/newsletter.md) → Open decisions).
- **Vercel Blob** — image hosting. Pricing: ~$0.15/GB-month. Estimated
  storage: <2GB after 12 months at daily cadence with hash-based
  dedup.
- **Playwright + stealth plugin** — Cloudflare bypass. Sufficient for
  Hodinkee, ABTW, Worn & Wound, auction houses. Falls back to
  ScraperAPI for sites that defeat Playwright stealth.
- **ScraperAPI** — proxy fallback. Used selectively, not as primary
  scrape path. Cost ~$50/mo if used heavily; likely <$15/mo at our
  request volume.

## Code location

```
newsletter/                  # peer to src/, not under it
├── feeds/                   # one file per source: hodinkee.ts, mjbiz.ts removed, etc
│   ├── shared/              # common feed parsing helpers
│   └── index.ts             # registry of active feeds
├── scrape/
│   ├── browser.ts           # Playwright session manager
│   ├── stealth.ts           # CF bypass helpers
│   └── extract.ts           # html → article shape
├── images/
│   ├── download.ts
│   └── upload.ts            # Vercel Blob client wrapper
├── classify.ts              # OpenAI segment + type
├── summarize.ts             # OpenAI summary
├── dedup.ts
├── generate.ts              # HTML template
├── send.ts                  # Klaviyo send flow
├── main.ts                  # orchestration entry
├── README.md                # local run instructions
└── package.json             # newsletter-specific deps (or hoist to root)
```

Decision pending: hoist newsletter deps to root `package.json` (simpler
CI, single lockfile, slight bloat for Vercel deploy) vs separate
`newsletter/package.json` (cleaner isolation, more CI ceremony).
**Recommend hoist to root** unless deploy size becomes an issue.

## Local development

```bash
npm run newsletter:dry-run     # NEW: runs main.ts without sending, writes HTML to /tmp
npm run newsletter:test-send   # NEW: sends to a test Klaviyo list of [tom@] only
```

Will be added to root `package.json` during Session 2 build.

## Failure modes and recovery

| Failure | Handling |
|---------|----------|
| GitHub Actions runner unavailable | Cron drift handles most; manual `workflow_dispatch` for genuine outages |
| OpenAI rate limit | Exponential backoff, max 3 retries per call, fail-soft to "story without summary" rather than abort |
| Cloudflare blocks Playwright | Fall back to ScraperAPI for that source; flag the source for review in next run |
| Klaviyo send-job fails | Don't retry blindly (avoid double-send). Notify Tom via TBD channel, manual investigation |
| Image download fails | Story keeps placeholder image, dropped from `hero_image` slot but kept in body |
| Drizzle write fails | Send still proceeds; log to GH Actions, replay write next run |

## Migration from cannabis engine

We're **not** porting the Python cannabis engine. It's the wrong
language for this repo. We're reimplementing in TypeScript using:
- The cannabis engine's prompt designs (Segment × Type classifier
  prompts adapt directly from the jurisdiction classifier patterns)
- The cannabis engine's editorial filter rules (sponsored content
  detection, signal/noise thresholds)
- The cannabis engine's deduplication algorithm

These are all algorithmic patterns, not code. The Python codebase
itself doesn't transfer.

## Open technical questions

- **Hoist deps vs separate package.json** — see Code location above.
- **HTML rendering library** — React Email (matches Next.js patterns,
  more complex), Mustache/Handlebars (simpler, faster), or hand-written
  template literals (simplest, hardest to maintain).
- **Database branch isolation** — should the newsletter writes go to
  the same Neon database as Fitwell's main data, or a separate Neon
  branch? Same DB is simpler. Separate branch isolates failure modes
  but doubles DB infra.
- **Image rights / hotlinking policy** — re-hosting source images in
  Vercel Blob is standard for aggregator newsletters and falls under
  US fair use in a news-summary context. Should document the policy
  before launch in case a source publication complains.

## What the build looks like (Session 2 scope)

Per [../strategy/newsletter.md](../strategy/newsletter.md), Session 2
is the engine build. Roughly:

| Step | Effort |
|------|--------|
| Schema migration + seed `newsletter_source` rows | 1h |
| Feed parser registry + 5–10 RSS source modules | 3h |
| Playwright scrape + stealth for 5–10 non-RSS sources | 4h |
| Image download + Vercel Blob upload | 2h |
| OpenAI summarize + classify | 2h |
| HTML template + brand styling | 3h |
| Klaviyo send flow (template + campaign + send-job) | 3h |
| Dedup + orchestration in main.ts | 2h |
| GitHub Actions workflow | 1h |
| End-to-end test brief to Tom | 2h |
| Iteration on test brief | 3h |

Total: ~26h, realistically 3–5 working sessions of ~6h each.
