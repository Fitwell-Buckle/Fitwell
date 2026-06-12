# UTM ↔ Order Linking Gap

> **Status:** investigation queued. Discovered 2026-06-05 while building
> Phase 3 of [[grapevine-integration]].
>
> **Update 2026-06-12 — the forward-looking half is closed.** Since the
> PostHog theme redeploy went live (2026-06-04), 71% of June orders carry
> `link_method` (43 pixel / 5 self_report / 1 email_match of 69). The
> 5.4% figure below was measured on a mostly *pre-pixel* window — the
> linker wasn't broken so much as starved of pixel ids. **Remaining scope
> is historical:** the 1,209 converted-but-unlinked `utm_attribution`
> rows and pre-pixel orders (email-match backfill). Also relevant:
> `d7bcf56` fixed `linkOrderToAttribution` re-emitting `purchase_completed`
> to PostHog on every cron re-sync (~12×/day) and made re-syncs unable to
> downgrade `self_report` links — read that commit before touching the
> linker.

## Context

While joining Grapevine survey responses to UTM attribution data for the
Phase 3 delta report, the prod database showed a structural mismatch:

| Stat | Count |
|---|---|
| Orders in 178-day window | 734 |
| Orders with `link_method` set | 40 (5.4%) |
| `utm_attribution` rows captured | 2,608 |
| `utm_attribution` rows with `converted=true` | 1,249 |
| Survey responses (Grapevine) | 178 |
| Orders with BOTH UTM linkage AND survey | 9 |

The UTM capture pipeline is working — 2,608 rows is a healthy
collection cadence. But the **linker that should reflect those
conversions back onto `order.link_method` is only firing for ~3% of
the converted UTM rows** (40 of 1,249).

This is why [[grapevine-integration]] Phase 3 had to pivot from a
"UTM-vs-survey delta report" (which assumed both signals would be
present on most orders) to a "survey-first" attribution view (because
the survey turns out to be the dominant per-order signal we have).

## Why It Matters

- The 5% link rate caps any UTM-driven attribution analysis to a tiny,
  potentially non-representative slice of orders.
- The survey gap-fill (~24% coverage from Grapevine) is more valuable
  than the original "UTM as primary, survey as confirmation" framing
  would have suggested.
- ROAS calculations that depend on UTM-linked conversions are operating
  on a small sample.

## Suspected Causes (Hypotheses to Investigate)

1. **Linker not called for most orders.** `linkOrderToAttribution` lives
   in `src/lib/analytics/order-attribution.ts` and is invoked from the
   Shopify sync pipeline. Confirm it's actually called for every order
   sync — could be a missed call site or a guard that's filtering most
   orders out.
2. **Pixel stitching incomplete.** `order.fw_distinct_id` requires the
   storefront snippet to set posthog distinct_id AND the checkout pixel
   to carry it through via the `_fw_distinct_id` note attribute. If
   pixel stitching isn't installed/running broadly, the deterministic
   path is dead for most orders. Consistent with PRIORITIES.md
   "instrument-first" being mid-flight as of 2026-05-25.
3. **Email-match fallback silent failure.** The fallback only runs when
   `customerId` is set AND a matching `utm_attribution` row exists for
   that customer (visitor_id = customer.id). The visitor_id mapping
   might not be populated reliably.
4. **try/catch swallowing.** `linkOrderToAttribution` wraps everything
   in try/catch and logs but returns null — failures are invisible
   unless someone reads logs. Add Sentry or a status counter.

## Quick Diagnostic Query

```sql
-- Are orders even getting attribution attempted?
-- Compare orders synced after a known instrumentation date vs link_method coverage
select
  date_trunc('week', processed_at) as wk,
  count(*) as orders,
  sum(case when fw_distinct_id is not null then 1 else 0 end) as with_distinct_id,
  sum(case when link_method = 'pixel' then 1 else 0 end) as pixel_linked,
  sum(case when link_method = 'email_match' then 1 else 0 end) as email_linked,
  sum(case when link_method is null then 1 else 0 end) as unlinked
from "order"
where processed_at >= '2026-02-12'
group by 1 order by 1;
```

That breakdown by week tells us whether stitching coverage is growing
(consistent with rollout) or flat (consistent with bug).

## Scope

- **In:** root-cause the gap, fix the linker path that isn't firing,
  backfill `link_method` on the 1,209 orders whose UTM is marked
  converted but whose order isn't linked.
- **Out:** changes to the UTM capture pipeline itself (capture is
  working fine — the gap is downstream).

## Related

- [[../../invariants/attribution]] §4 — the linking rules this is
  failing to satisfy.
- [[grapevine-integration]] Phase 3 — pivoted to survey-first because
  of this gap; will mostly become moot once this is fixed.
- [[../../research/posthog-shopify-stitching]] — the stitching design
  that underpins the pixel path.
- [[../../ops/PRIORITIES]] — instrument-first strategic frame.
