# Test Cases

Last updated: 2026-05-07

## Testing Strategy

| Layer | Tool | Location | Runs |
|-------|------|----------|------|
| Unit tests | Vitest | `src/**/*.test.ts` | `npm test`, CI |
| E2E tests | Playwright | `e2e/` | `npm run test:e2e`, CI |
| Type checking | TypeScript | — | `npm run typecheck`, CI |

## Unit Test Cases

### Shopify Sync (`src/lib/shopify.ts`)

| # | Case | Input | Expected | Status |
|---|------|-------|----------|--------|
| 1 | Parse valid order | Shopify order JSON | Correct DB row shape | [ ] |
| 2 | Parse order with missing optional fields | Partial order JSON | Defaults applied, no crash | [ ] |
| 3 | Idempotent upsert | Same order twice | Single row, no duplicates | [ ] |
| 4 | Customer aggregate recalculation | 3 orders for customer | order_count=3, total_spent=sum | [ ] |
| 5 | HMAC verification (valid) | Body + correct secret | Returns true | [ ] |
| 6 | HMAC verification (invalid) | Body + wrong secret | Returns false | [ ] |
| 7 | HMAC verification (missing header) | No HMAC header | Returns false | [ ] |
| 8 | Pagination detection | Response with Link header | Extracts next page URL | [ ] |

### UTM Attribution (`src/lib/attribution.ts`)

| # | Case | Input | Expected | Status |
|---|------|-------|----------|--------|
| 9 | Parse full UTM params | URL with all 5 params | All fields populated | [ ] |
| 10 | Parse partial UTM params | URL with source only | Source set, others null | [ ] |
| 11 | No UTM params | Clean URL | No attribution record created | [ ] |
| 12 | GCLID capture | URL with gclid | gclid stored, source=google | [ ] |
| 13 | Purchase linking | Email match | customer_id linked, converted=true | [ ] |
| 14 | Attribution window expiry | Record older than 30 days | Not linked to purchase | [ ] |
| 15 | Deduplication | Same session, two pageviews | Single attribution record | [ ] |

### Analytics Extraction

| # | Case | Input | Expected | Status |
|---|------|-------|----------|--------|
| 16 | GA4 daily insert | API response | Correct rows in ga4_daily | [ ] |
| 17 | GSC daily insert | API response | Correct rows in gsc_daily | [ ] |
| 18 | Google Ads daily insert | API response | Correct rows in google_ads_daily | [ ] |
| 19 | PostHog aggregation | Raw events | Aggregated rows in posthog_daily | [ ] |
| 20 | Empty API response | No data for date | No rows inserted, no error | [ ] |

### API Routes

| # | Case | Input | Expected | Status |
|---|------|-------|----------|--------|
| 21 | Admin API without auth | No session | 401 response | [ ] |
| 22 | Admin API with auth | Valid session | 200 + data | [ ] |
| 23 | Cron without secret | No CRON_SECRET | 401 response | [ ] |
| 24 | Cron with secret | Valid CRON_SECRET | 200 + execution | [ ] |
| 25 | Customer list pagination | page=2, limit=20 | Correct offset, total count | [ ] |
| 26 | Customer search | query="john" | Matching customers | [ ] |
| 27 | Health check | GET /api/health | 200 + status OK | [ ] |

## E2E Test Cases

| # | Case | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 28 | Admin login flow | Visit /dashboard → redirect → login → redirect back | Dashboard visible | [ ] |
| 29 | Customer list loads | Login → /customers | Table with customer rows | [ ] |
| 30 | Customer detail | Click customer → /customers/[id] | Order history, LTV visible | [ ] |
| 31 | Marketing homepage | Visit / | Hero, CTAs render, no errors | [ ] |
| 32 | UTM capture | Visit /?utm_source=test | Cookie set, PostHog event fired | [ ] |
| 33 | Comparison page | Visit /compare/deployant-vs-micro-adjust | Content renders, schema present | [ ] |

## Open Questions

- [ ] Mock strategy for Shopify API in unit tests?
- [ ] Test database — use in-memory SQLite or test NeonDB instance?
- [ ] Playwright — test against local dev or preview deployment?
- [ ] Snapshot tests for structured data (JSON-LD) output?
