# Work Plan: Stand up the Google Search Console (GSC) pipeline

> **✅ COMPLETED 2026-06-29.** Search Console API enabled in GCP project
> `992120641760`; `sc-domain:fitwellbuckle.co` Domain property verified (DNS TXT
> via Shopify); service account `fitwell-analytics@fitwell-496020.iam.gserviceaccount.com`
> granted Restricted access; `GSC_SITE_URL=sc-domain:fitwellbuckle.co` set in
> Vercel Production; 90 days backfilled (7,661 rows, 2026-03-29 → 06-26); live
> daily cron verified (`extract-gsc?days=1` → 61 rows); GSC flipped to
> `expectLive: true` in pipeline-health monitoring. Full ~16-month backfill not
> yet run (optional — see Phase 4).

## Context

GSC (Google Search Console) reports how fitwellbuckle.co performs in Google's
**organic / unpaid search** results — the actual queries people searched, how
often we appeared (impressions), how often they clicked, our click-through
rate, and our average ranking position. It's the core data source for SEO and
the only window into the free-search channel (GA4 shows what visitors do once
on the site; Google Ads shows *paid* search; GSC shows *organic* search demand).

The extract code (`src/lib/analytics/gsc.ts`, cron route
`src/app/api/cron/extract-gsc/route.ts`, table `gsc_daily`, cron in
`vercel.json` at `0 7 * * *`) was scaffolded but **has never produced a single
row** — `gsc_daily` is empty in production.

Diagnosis (2026-06-29) found it never worked because of two independent blockers:

1. **`GSC_SITE_URL` is unset** in every environment (prod and local). The
   extract throws `"GSC_SITE_URL not configured"` on its first line, before any
   API call.
2. **The Search Console API is disabled** in the GCP project that owns the
   production service account. A live read with the prod SA returned:
   > `403 — Google Search Console API has not been used in project
   > 992120641760 before or it is disabled.`

A third step can't be verified until #2 is done: the service account must be
granted access to the GSC property, or queries will 403 even with the API on.

This is a **new setup**, not a regression — distinct from the Google Ads fix
(which *was* working and just needed an API-version bump). Treat priority
accordingly.

## Dependencies

- GCP Console access to project **992120641760** (the prod service account's
  project — same project GA4's working extract uses, so its Analytics Data API
  is already enabled there; we just also need Search Console API on).
- Search Console (Owner) access to the fitwellbuckle.co property.
- Vercel access to set a production env var.
- The production service-account email — copy it from Vercel →
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` (ends in `…iam.gserviceaccount.com`). Note: the
  prod SA differs from the one in local `.env.local`, so read it from Vercel,
  not your laptop.

## Scope

**In:** enable the API, grant SA access, set the env var, verify, backfill the
available history, confirm rows land.
**Out:** any UI/reporting on GSC data (separate task); changing the extract
code (it's correct — it just never had its inputs).

## Implementation Phases

### Phase 1: Enable the API (Console — you/Greg)
- [ ] In GCP project **992120641760**, enable **Search Console API**:
      https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=992120641760
- [ ] Wait a few minutes for it to propagate.

### Phase 2: Grant the service account access (Search Console — you/Greg)
- [ ] In Search Console → **Settings → Users and permissions** for the
      fitwellbuckle.co property, **Add user** = the prod SA email (from Vercel
      `GOOGLE_SERVICE_ACCOUNT_EMAIL`), permission **Restricted** (enough for the
      read-only `webmasters.readonly` scope the extract uses) or **Full**.
- [ ] Note which property type exists, because it determines the env value in
      Phase 3:
      - Domain property → site URL is `sc-domain:fitwellbuckle.co`
      - URL-prefix property → site URL is `https://www.fitwellbuckle.co/`
        (exact protocol + trailing slash matter)

### Phase 3: Set the env var (Vercel — you/Greg)
- [ ] Add production env var **`GSC_SITE_URL`** = the value from Phase 2.
- [ ] (Add it to Preview too if you want preview deploys to extract.)
- [ ] Redeploy is not required for the cron to pick it up on its next run, but a
      redeploy makes it available immediately.

### Phase 4: Verify + backfill (can be done by Tom or an agent)
- [ ] Smoke test one day: hit `GET /api/cron/extract-gsc?days=3` with admin/cron
      auth. Expect `{ status: "ok", rows: > 0 }`. A 500 with `GSC API error:
      403` means Phase 1 or 2 didn't take (API still off, or SA not on the
      property); `rows: 0` with status ok means the property string in Phase 3
      is wrong or there genuinely was no search traffic that day.
- [ ] Backfill history. The route fetches dates offset by GSC's 2–3 day
      reporting lag (`date = today − 3 − i`), so `?days=N` pulls N days ending
      ~3 days ago. GSC retains ~16 months. Start with `?days=90` to confirm,
      then `?days=480` for the full window if wanted.
- [ ] Confirm rows: `gsc_daily` should now have data. Spot-check a few queries
      look sane (branded terms like "fitwell buckle" should rank ~1).

## Notes / risks

- **Project number gotcha:** the API must be enabled in **992120641760** (the
  prod SA's project), *not* `fitwell-496020` (referenced elsewhere in
  `integrations.md` for the older/shared SA). The 403 error names the project to
  use — go by that.
- **2–3 day data lag** is normal for GSC and already handled by the cron's
  `today − 3` offset; don't be alarmed that "today" never has data.
- **No monitoring yet:** like GA4/Ads, a silent failure here won't alert anyone.
  A separate follow-up should add pipeline-staleness checks to the health cron
  (`src/app/api/cron/health/route.ts`) so the next outage surfaces in <36h
  instead of weeks.
- Once live, update `specs/current/integrations.md` (GSC section) and
  `specs/current/scheduled-jobs.md` to reflect that the pipeline is actually
  operational, and move this plan to `specs/work-plans/completed/`.
