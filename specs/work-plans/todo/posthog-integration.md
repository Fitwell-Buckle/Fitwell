# PostHog Integration

## Context
- PostHog is our product analytics platform for tracking visitor behavior on our landing pages and admin dashboard
- The key challenge: visitors land on OUR pages (tracked by PostHog) but convert on SHOPIFY (tracked by Shopify webhooks) — we need to link these two data streams
- PostHog captures the top of funnel (page views, UTM params, engagement) while Shopify captures the bottom (purchase, revenue, product choice)
- This integration closes the attribution loop: visitor → landing page → Shopify → purchase → back to PostHog person profile
- Reference: specs/current/integrations.md, specs/current/data-flows.md, specs/invariants/attribution.md
- Depends on Shopify integration being complete (need order/customer data flowing)

## Dependencies
- Shopify integration completed (orders and customers syncing to DB)
- PostHog project created with API keys
- Env vars: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST, POSTHOG_PERSONAL_API_KEY (for server-side API)
- Landing pages deployed (at least one public page to track)

## Scope
Included:
- Client-side PostHog SDK initialization with proper config
- Page view and custom event tracking on marketing pages
- UTM parameter capture and persistence (coordinate with utm_attribution table)
- Visitor identification flow (anonymous → known when they reach Shopify)
- Server-side PostHog client for backend event capture
- PostHog → NeonDB extraction cron (event rollups into posthog_daily)
- Shopify purchase events sent to PostHog (server-side, linking visitor to buyer)
- Feature flags infrastructure (for A/B testing landing page variants)
- PostHog /shopify cross-reference: enrich PostHog person profiles with Shopify purchase data
- Admin dashboard usage tracking (for our own UX improvement)

Excluded:
- Session replay (may add later, separate plan)
- Heatmaps (may add later)
- PostHog surveys
- A/B test creation (just the infrastructure for now)

## Implementation Phases

### Phase 1: Client-Side SDK Setup
- [ ] Configure PosthogProvider in src/components/providers/posthog-provider.tsx
- [ ] Initialize with NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST
- [ ] Configure: autocapture enabled, capture_pageview for SPA navigation, capture_pageleave
- [ ] Disable in development unless NEXT_PUBLIC_POSTHOG_KEY is set
- [ ] Add PostHog to CSP headers in next.config.ts (already partially done)
- [ ] Verify events appear in PostHog dashboard

#### Tests
- Manual: visit marketing page, verify pageview event in PostHog
- Unit: provider renders without key in dev mode (no crash)

### Phase 2: UTM Capture & Visitor Identity
- [ ] Enhance utm-capture.tsx component:
  - On mount, read UTM params from URL (source, medium, campaign, term, content)
  - Store in localStorage for persistence across pages
  - Set as PostHog person properties ($set_once for first-touch attribution)
  - Generate or retrieve a visitor_id (uuid stored in localStorage)
  - Write UTM data to utm_attribution table via API call (POST /api/tracking/utm)
- [ ] Create /api/tracking/utm route — receives visitor_id + UTM params + landing page + referrer, inserts into utm_attribution table
- [ ] Add landing page URL and referrer to capture
- [ ] Set PostHog distinct_id to our visitor_id for cross-reference

#### Tests
- Unit: UTM parsing from various URL formats
- Unit: first-touch vs returning visitor logic (localStorage check)
- Integration: UTM capture → API → DB round trip

### Phase 3: Shopify Purchase → PostHog Link
- [ ] When a Shopify order webhook arrives, look up the customer's email
- [ ] Search utm_attribution table for matching visitor (by email if captured, or by Shopify landing page referrer params)
- [ ] If match found, send PostHog server-side event: "purchase_completed" with properties (order_total, products, order_id) linked to the visitor's PostHog distinct_id
- [ ] Call PostHog /identify to merge the anonymous visitor_id with the customer's email as identified user
- [ ] This closes the loop: PostHog now knows that visitor X (who came from Google Ads campaign Y) bought product Z for $N
- [ ] Store the PostHog distinct_id on the customer record for future cross-reference

#### Tests
- Unit: visitor-to-customer matching logic
- Unit: PostHog event construction
- Integration: simulate order webhook → verify PostHog event sent (mock PostHog API)

### Phase 4: Server-Side PostHog Client
- [ ] Build server-side PostHog client in src/lib/analytics/posthog.ts (singleton, lazy init)
- [ ] Use posthog-node SDK
- [ ] Methods: capture(distinctId, event, properties), identify(distinctId, properties), shutdown()
- [ ] Add server-side event tracking for key admin actions (login, report viewed, settings changed)
- [ ] Flush events on serverless function completion (important for Vercel — no persistent process)

#### Tests
- Unit: client initialization and singleton behavior
- Unit: flush on shutdown

### Phase 5: PostHog Data Extraction
- [ ] Implement PostHog event extraction in src/lib/analytics/posthog.ts (extend existing)
- [ ] Use PostHog API: /api/projects/{project_id}/insights/trend/ or /api/event/ for raw events
- [ ] Daily extraction: aggregate events by name + date → upsert into posthog_daily table
- [ ] Key events to track: $pageview (by page), utm_captured, purchase_completed, admin_login
- [ ] Wire up /api/cron/extract-posthog route (every 3h per vercel.json)
- [ ] Historical backfill: scripts/backfill-posthog.ts

#### Tests
- Unit: PostHog API response parsing
- Unit: event aggregation logic
- Integration: extract events for one day, verify DB

### Phase 6: Conversion Tracker & Feature Flags
- [ ] Enhance conversion-tracker.tsx component:
  - Track key conversion events: landing_page_viewed, cta_clicked, shopify_redirect (when user clicks "Buy Now" going to Shopify)
  - Include UTM context and visitor_id in all events
- [ ] Set up PostHog feature flags client
  - Wrap in a useFeatureFlag() hook
  - Enable for landing page A/B testing (headline variants, CTA text, layout)
  - Server-side flag evaluation for API routes
- [ ] Add feature flag checks to marketing page components
- [ ] Document feature flag naming conventions in specs/current/integrations.md

#### Tests
- Unit: conversion event properties construction
- Unit: feature flag hook behavior (flag on/off/loading states)
- Manual: create a test flag in PostHog, verify it evaluates correctly

### Phase 7: Dashboard Integration
- [ ] Add PostHog data to admin dashboard:
  - Landing page traffic trends (from posthog_daily)
  - Conversion funnel: page_view → cta_click → shopify_redirect → purchase (cross-referencing Shopify data)
  - UTM attribution report: which campaigns drive purchases (not just visits)
  - Visitor-to-customer conversion rate
- [ ] Wire /api/admin/attribution to combine utm_attribution + customer purchase data
- [ ] Add funnel visualization to /api/admin/funnel using PostHog + Shopify data
- [ ] Create a "full journey" view for individual customers: PostHog events → Shopify order

#### Tests
- Unit: funnel calculation (conversion rates between steps)
- Unit: attribution query combining UTM + purchase data
- E2E: attribution page shows channel breakdown with conversion data

## Notes
- The visitor_id linking is the hardest part: visitors browse our site anonymously, then buy on Shopify. The link happens when Shopify sends us the customer's email, and we match it to a UTM capture that included the same email (if they signed up for something) or the same session context
- Consider adding a "notify me" or email capture form on landing pages to increase the linkage rate before purchase
- PostHog person profiles accumulate properties over time — use $set_once for first-touch UTM, $set for latest visit
- PostHog's free tier: 1M events/month — plenty for a niche DTC brand's landing pages
- Flush is critical on Vercel: posthog-node buffers events and flushes periodically, but serverless functions die after response. Always call flushAsync() before returning
- The cross-reference between PostHog visitor and Shopify customer is probabilistic when no email match exists — document the matching strategy and its limitations
- Feature flags enable no-code A/B testing of landing pages — this is powerful for optimizing conversion to Shopify
