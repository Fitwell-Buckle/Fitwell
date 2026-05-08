# Data Flows

Last updated: 2026-05-07

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
4. Cron job catches anything webhooks missed (pagination through recent updates)
5. Customer aggregates recalculated on each sync
6. Admin dashboard queries these tables for customer list, order list, individual customer views

**Latency**: Real-time via webhooks, max 2h gap filled by cron

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

## Flow 4: Unified Dashboard Views

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
