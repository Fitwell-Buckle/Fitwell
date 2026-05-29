# Data Flows

Last updated: 2026-05-28

## Overview

```
                    ┌─────────────┐
                    │   Shopify    │
                    │  (commerce)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ webhooks    │ cron/2h    │
              ▼            ▼            │
         ┌─────────┐ ┌─────────┐       │
         │ webhook  │ │  cron   │       │
         │ handler  │ │  sync   │       │
         └────┬─────┘ └────┬────┘       │
              │            │            │
              ▼            ▼            │
         ┌──────────────────────┐       │
         │  customer / order    │       │
         │      tables          │       │
         └──────────┬───────────┘       │
                    │                   │
                    ▼                   │
         ┌──────────────────────┐       │
         │   Admin Dashboard    │◄──────┘
         │  (customers, orders, │
         │   funnel, cohort)    │
         └──────────────────────┘

  ┌───────────┐  ┌──────┐  ┌──────────┐  ┌─────────┐
  │  GA4      │  │ GSC  │  │Google Ads│  │ PostHog │
  └─────┬─────┘  └──┬───┘  └────┬─────┘  └────┬────┘
        │           │           │              │
        │ cron      │ cron      │ cron         │ cron
        │ daily     │ daily     │ daily        │ /3h
        ▼           ▼           ▼              ▼
  ┌──────────────────────────────────────────────────┐
  │          Analytics Staging Tables                 │
  │  (ga4_daily, gsc_daily, google_ads_daily,        │
  │   posthog_daily)                                  │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Campaign Dashboard │
              │  (attribution, ROAS, │
              │   traffic, keywords) │
              └──────────────────────┘
```

## Flow 1: Shopify → Customer & Order Data

**Trigger**: Webhooks (real-time) + Cron (every 2h)

1. Shopify fires webhook on `orders/create`, `orders/updated`, `customers/update`
2. Webhook handler verifies HMAC signature
3. Upserts order/customer into database
4. `upsertCustomer` also calls `syncCustomerAddresses` — delete-and-replaces every row in `customer_address` for that customer from the Shopify payload's `addresses[]` (falls back to `default_address` alone if the array isn't present)
5. Cron job catches anything webhooks missed (pagination through recent updates)
6. Customer aggregates recalculated on each sync
7. Admin dashboard queries these tables for customer list, order list, individual customer views; B2B brand page (`/customers/brands/[id]`) reads `customer_address` for the linked customer

**Latency**: Real-time via webhooks, max 2h gap filled by cron

**Backfill**: `scripts/backfill-customer-addresses.ts` re-fetches every existing customer from Shopify so the new `customer_address` table catches up on legacy data — sequential, rate-limit-aware, idempotent (~25 min for ~15K customers).

## Flow 2: Landing Pages → Attribution

**Trigger**: User visits marketing page

1. User arrives at `/micro-adjust?utm_source=google&utm_medium=cpc&utm_campaign=spring`
2. `utm-capture` component reads URL params
3. UTM data stored in cookie + sent to PostHog as person properties
4. Row inserted into `utm_attribution` with session context
5. If user purchases (detected via Shopify webhook matching email), `customer_id` linked
6. Attribution dashboard shows channel → conversion mapping

**Latency**: UTM capture is instant; purchase linking happens at next Shopify sync

## Flow 3: Analytics Platforms → Staging Tables

**Trigger**: Daily/periodic cron jobs

1. GA4 cron (6:30 UTC) pulls previous day's traffic by source/medium/campaign
2. Google Ads cron (6:45 UTC) pulls campaign spend and conversions
3. GSC cron (7:00 UTC) pulls keyword/page performance (3-day lag)
4. PostHog cron (every 3h) aggregates event counts by name/page/date
5. All data inserted into respective staging tables
6. Campaign dashboard joins these tables for unified view

**Latency**: Daily data available by ~7:30 UTC; PostHog data within 3h

## Flow 4: B2B Invoice → Shopify Draft Order → Customer Payment

**Trigger**: Admin clicks Print & Send on an invoice for a Shopify-linked brand

1. Admin opens `/invoices/[id]/send`, optionally edits the To address + message
2. Send route reads the effective deposit % (per-invoice override `invoice.deposit_percent` if set, else `company.deposit_percent`)
3. `snapshotInvoiceDeposit` stamps `deposit_percent` + computed `deposit_cents` onto the invoice so terms are frozen
4. `createDraftOrderInvoice` (`lib/shopify/client.ts`) is called with either the real line items (no-deposit case) **or** a single "Deposit (X%)" custom line at the deposit amount (deposit case) — requires the `write_draft_orders` scope on the granted app token
5. Shopify creates a draft order; `draftOrderInvoiceSend` triggers Shopify's hosted-invoice email to the customer with a pay link
6. Resend sends Fitwell's own branded invoice email (`buildInvoiceEmailHtml`), CC'd to the sending admin
7. Customer pays the Shopify hosted invoice → Shopify completes the draft order → fires `orders/create` → our webhook upserts a real Order row
8. Later: admin clicks Fulfill (`POST /api/invoices/[id]/fulfill`). If a deposit was taken, `markInvoiceFulfilled` creates a **second** Shopify draft order for the balance (custom line "Balance due — INV-N") and stores `shopify_balance_draft_order_id` / `shopify_balance_invoice_url`. That balance pay link is emailed to the customer
9. Deposit/balance can be marked paid granularly via `POST /api/invoices/[id]/deposit-paid` and `.../balance-paid`, or coarsely by flipping the status dropdown to "paid"

**Blocking semantics**: If step 4 fails (e.g. `write_draft_orders` not granted), the route returns 409 (scope) / 502 (other) and the invoice is **not** marked sent and **not** emailed — avoids handing a Shopify-linked customer a linkless invoice. For brands not linked to a Shopify customer, the invoice emails normally with no pay link.

**Two-orders nuance**: A deposit-split invoice produces **two** Shopify orders (deposit + balance), each a custom-money line — neither carries the real product SKUs/variants. No-deposit invoices produce one draft order with the real line items.

**Gap (not yet automated)**: `deposit_paid_at` is never written by `upsertOrder` — the webhook doesn't match the deposit payment back to the source invoice. Currently the only signal is the admin manually marking it paid.

## Flow 5: Unified Dashboard Views

**Consumers**: Admin dashboard pages

| Dashboard Page | Data Sources |
|----------------|-------------|
| `/dashboard` | orders, ga4_daily, google_ads_daily |
| `/customers` | customer, order, utm_attribution |
| `/customers/[id]` | customer, order, order_line_item, customer_event, utm_attribution |
| `/orders` | order, order_line_item |
| `/campaigns` | campaign, google_ads_daily, utm_attribution |
| `/attribution` | utm_attribution, order, customer |
| `/funnel` | posthog_daily, utm_attribution, order |
| `/products` | order_line_item, order |

## Open Questions

- [ ] How to handle attribution for customers who visit multiple times before purchasing?
- [ ] Should we pre-aggregate dashboard queries or compute on-the-fly?
- [ ] Event stream for real-time dashboard updates vs polling?
