# Shopify Integration

## Context
- Shopify is the source of truth for all commerce data — orders, customers, products, inventory
- We need to sync this data into our NeonDB so we can build analytics, attribution, and customer insights without being limited by Shopify's built-in analytics
- Reference: specs/current/integrations.md (Shopify section), specs/invariants/data-sync.md, specs/current/schema.md
- The Shopify store domain is fitwellbuckle.myshopify.com

## Dependencies
- NeonDB project created with DATABASE_URL configured
- Shopify Admin API token generated (read access to orders, customers, products)
- Shopify webhook endpoint accessible (Vercel deployment or ngrok for dev)
- Initial database migration applied (customer, order, order_line_item tables)

## Scope

### Included
- Shopify Admin REST API client with rate limiting
- Webhook receiver with HMAC-SHA256 verification
- Order sync (create + update) via webhook + cron backfill
- Customer sync (create + update) via webhook + cron backfill
- Product/variant data sync for SKU analytics
- Historical backfill script for existing orders
- Shopify CLI tooling for store management
- /shopify skill for ongoing Shopify operations

### Excluded
- Shopify GraphQL API (REST is sufficient for our read patterns)
- Inventory management / stock level tracking (future)
- Discount code tracking (future)
- Shopify Storefront API (we're not building a custom storefront)

## Implementation Phases

### Phase 1: Shopify API Client & Authentication
- [ ] Configure Shopify Admin API credentials (.env)
- [ ] Build Shopify REST API client with automatic rate limit handling (Shopify uses X-Shopify-Shop-Api-Call-Limit header, 40 requests/bucket with 2/sec leak rate)
- [ ] Add retry logic with exponential backoff for 429 responses
- [ ] Implement typed response parsing for Orders, Customers, Products endpoints
- [ ] Test client against live Shopify store (read a single order)

#### Tests
- Unit: rate limit header parsing, retry backoff calculation
- Integration: fetch single order from dev store (can be skipped in CI)

### Phase 2: Webhook Receiver
- [ ] Implement HMAC-SHA256 webhook verification using SHOPIFY_WEBHOOK_SECRET
- [ ] Build webhook topic router (orders/create, orders/updated, customers/create, customers/update)
- [ ] Handle order webhook → upsert into order + order_line_item tables (use shopify_id as dedup key)
- [ ] Handle customer webhook → upsert into customer table
- [ ] Return 200 quickly, process asynchronously if needed (Shopify times out webhooks at 5s)
- [ ] Add webhook registration script (or document manual setup in Shopify admin)
- [ ] Log webhook events for debugging (topic, shopify_id, timestamp)

#### Tests
- Unit: HMAC verification with known test payload
- Unit: order upsert logic (new order vs update)
- Unit: customer upsert logic
- Integration: simulate webhook POST with signed payload → verify DB state

### Phase 3: Cron Sync (Backfill & Catch-up)
- [ ] Implement extract-shopify cron route (runs every 2h per vercel.json)
- [ ] Sync orders from last 24h (overlap window for webhook gaps)
- [ ] Sync customers modified in last 24h
- [ ] Handle Shopify pagination (Link header, max 250 per page)
- [ ] Track sync cursor/timestamp for incremental sync
- [ ] Add sync status logging (orders synced, customers synced, errors)
- [ ] Verify cron secret authorization (CRON_SECRET bearer token)

#### Tests
- Unit: pagination cursor extraction from Link header
- Unit: sync window calculation (24h overlap)
- Integration: full sync cycle → verify DB matches Shopify data

### Phase 4: Historical Backfill
- [ ] Create scripts/backfill-shopify.ts — one-time script to import all historical orders and customers
- [ ] Paginate through entire order history (could be thousands)
- [ ] Paginate through entire customer list
- [ ] Sync product catalog (products + variants for SKU reference)
- [ ] Add progress logging (page X of Y, N records imported)
- [ ] Make idempotent (safe to re-run — upserts on shopify_id)

#### Tests
- Manual: run against production Shopify, verify order counts match

### Phase 5: Shopify CLI & Skill
- [ ] Create scripts/shopify-cli.ts — a CLI tool for common Shopify operations:
  - `shopify orders [--since DATE] [--status STATUS]` — list/search orders
  - `shopify customers [--email EMAIL] [--since DATE]` — list/search customers
  - `shopify products` — list products with variants and inventory
  - `shopify order <id>` — get full order detail
  - `shopify customer <id>` — get full customer detail with order history
  - `shopify sync-status` — show last sync time, record counts, any errors
  - `shopify webhooks` — list registered webhooks and their status
- [ ] Add npm script: `"shopify": "tsx scripts/shopify-cli.ts"`
- [ ] Create .claude/skills/shopify/SKILL.md — a skill for Claude to interact with the Shopify store:
  - Read orders, customers, products from both Shopify API and local DB
  - Compare local vs Shopify data for drift detection
  - Trigger manual sync
  - Look up specific customer or order by email/number
  - Check webhook health (are we receiving events?)
  - Surface relevant data when investigating customer issues
- [ ] Document the CLI and skill in specs/current/integrations.md

#### Tests
- Manual: exercise each CLI command against live store

### Phase 6: Admin Dashboard Integration
- [ ] Wire /api/admin/customers to query synced customer table with pagination, search, sort
- [ ] Wire /api/admin/orders to query synced order table with filters (date range, status, product)
- [ ] Wire /api/admin/customers/[id] to show customer detail + order history + computed LTV
- [ ] Add customer count, order count, revenue totals to /api/admin/funnel
- [ ] Update dashboard page to show real metrics from synced data
- [ ] Add "last synced" timestamp display in admin settings

#### Tests
- Unit: customer list query with pagination
- Unit: LTV calculation from order history
- E2E: navigate to customers page, verify table renders with data

## Notes
- All monetary values stored in cents (integer) — Shopify sends decimals, convert on ingest
- Shopify order IDs are globally unique — use as primary dedup key
- Customer merge: Shopify can merge customers — handle by updating shopify_id references
- Webhook ordering: events may arrive out of order — always use updated_at comparison, not arrival order
- The 5-second webhook timeout means we must return 200 fast — do heavy processing after response
- Shopify rate limit: 40-request bucket, 2/sec leak. Backfill must respect this (add delays between pages)
- Financial status values: pending, authorized, partially_paid, paid, partially_refunded, refunded, voided
- Fulfillment status: null (unfulfilled), partial, fulfilled
- Consider adding a shopify_raw_payload jsonb column for debugging edge cases (can drop later)
