# Review-Request Campaign — Repeat Buyers, No Review (Judge.me)

> **Status (2026-06-30):** List built + scheduled-ready. Paused at the Judge.me
> UI setup step. Tom to finish tomorrow. Nothing has been sent.

## Context

Goal: get **verified** Judge.me reviews from repeat D2C buyers who haven't
reviewed yet. Founder-led ask, **no discount in the copy** (the existing
post-review coupon stays, as a surprise thank-you — see Decisions).

## What's done

- **Target list computed from prod DB:** D2C customers with **2+ orders** whose
  email is **not** in the `review` table (matched lowercased/trimmed, same join
  as `getRetentionLoop()` in `src/lib/funnel/strategy.ts`).
  - 160 repeat buyers → 132 with no review → **129 after removing the 2 founders**
    (`oliver.r.r@gmail.com`, and `tomsimson1@gmail.com` which was mislabeled
    "Oliver Rowen" in Shopify — worth cleaning up sometime).
- **File ready:** `~/Downloads/judgeme-review-requests-129.csv`
  - Judge.me manual-request format: `reviewer_name, reviewer_email, product_id,
    fulfilled_at, quantity, processed_at`
  - `product_id` = each person's most-recent purchased product (13 distinct).
    `fulfilled_at` = that order's processed date, `dd/mm/yyyy`.
  - **`processed_at = 08/07/2026` (Wed) on every row** → scheduled send, not immediate.
  - 4 rows have blank `reviewer_name` (fine — Judge.me falls back to the name on
    the email account).
- **Integration check (browser, today):** Judge.me↔Klaviyo connected (enabled
  today) but **no per-profile review link in Klaviyo** → can't merge a verified
  link into a one-time Klaviyo campaign. So we use Judge.me's own request system,
  whose order-tied link guarantees the Verified badge. Confirmed Judge.me's
  "Request reviews from customer segments or lists → upload spreadsheet" path
  takes our CSV.

## TODO tomorrow (all in the Judge.me panel: Shopify Admin → Apps → Judge.me Reviews → Settings)

1. **Email templates** → create/edit a custom review-request template; paste the
   founder copy below. **Edit sender settings** → from-name = `Tom & Oliver, Fitwell`.
2. **Confirm the coupon isn't gated on a positive review** (Email templates →
   Discounts and rewards → Coupon). It should fire for *any* review, not just 5-star.
3. **Request reviews → "Request reviews from customer segments or lists" → Get
   started → upload** `~/Downloads/judgeme-review-requests-129.csv`.
   - Verify the preview shows a **future send date (08/07/2026)**. If the date
     column doesn't take, just upload on the morning of the 8th instead.
   - There's a ~10-min cancel window per request after processing.

## Final copy (no em dashes, two founders, no discount language)

**Sender:** `Tom & Oliver, Fitwell`  **Subject:** `You were early`

> Hi {{ first name }},
>
> You gave us a shot, and then came back for more. For two guys who started this
> from nothing, that means the world.
>
> Almost no one knows micro-adjust on a tang buckle even exists yet. You do. You
> were early, and you still are.
>
> And the honest truth? Your words will move people in a way our ads never will.
> Someone out there has a watch sitting in a drawer right now because it won't sit
> right, and they'll believe you, not us.
>
> So here's our ask: two minutes to leave a review. Just tell people **which watch
> it brought back to your wrist**.
>
> **[ Leave your review ]**  ← Judge.me's verified review button
>
> Thank you, truly,
> **Tom & Oliver**, Fitwell Buckle Co.

(Use Judge.me's own merge-tag picker for the first name.)

## Decisions / rationale (so we don't relitigate)

- **No discount in the copy.** The post-review coupon already promised to these
  customers stays ON, but as a *surprise thank-you after* the review — not bait in
  the ask. This is a post-purchase thank-you to existing buyers, not the
  acquisition discounting the brand guardrail prohibits. (Per `fitwell-brand`.)
- **Why Judge.me, not a branded Klaviyo campaign:** verification. Judge.me's
  order-tied link guarantees the Verified badge; a Klaviyo blast can't merge a
  per-person verified link (only an event property usable in a flow).
- **Future ongoing engine (separate project):** a Klaviyo *flow* off the new
  Judge.me event ("Send review requests via Klaviyo…" row in Judge.me) for every
  new customer going forward. Not part of this backfill.

## Regenerating the list (if needed)

Logic lived in throwaway scripts (`scripts/_tmp-*.ts`, since deleted). To rebuild:
replicate the `getRetentionLoop()` join — D2C orders grouped by customer (`D2C_ONLY`
filter), `count >= 2`, exclude emails in `review.reviewer_email`. For the Judge.me
CSV, add most-recent order's `orderLineItem.shopifyProductId` (strip to numeric)
and `order.processedAt` as `fulfilled_at`. Query **prod**, not the dev branch.
