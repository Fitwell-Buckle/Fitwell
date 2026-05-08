# Invariant: Data Sync Rules

Last updated: 2026-05-07

These rules govern how data flows from Shopify into our database. They must hold at all times.

## Core Rules

### 1. Idempotent Upserts
Every sync operation must be idempotent. Running the same sync twice with the same data must produce the same result.

- All inserts use `ON CONFLICT (shopify_id) DO UPDATE`
- Updates are last-write-wins based on Shopify's `updated_at`
- Never insert duplicate rows for the same Shopify entity

### 2. No Data Loss
We never delete customer or order data from our database, even if deleted from Shopify.

- No `DELETE` statements in sync code
- Soft delete via `deleted_at` timestamp if Shopify signals deletion
- Historical orders remain even if customer is deleted from Shopify

### 3. Shopify is Source of Truth
For orders and customers, Shopify is canonical. Our database is a read replica for analytics.

- Never modify order/customer data locally (except computed fields like `order_count`)
- Computed fields are recalculated on each sync, not incremented
- If our data conflicts with Shopify, Shopify wins

### 4. Sync Window Safety
Cron jobs must overlap their query windows to avoid missing records.

- Query `updated_at_min` should be `last_synced_at - 5 minutes` (overlap buffer)
- This handles clock skew and records updated during the previous sync
- Idempotent upserts make the overlap safe

### 5. Webhook + Cron Complementary
Webhooks provide real-time updates; cron provides completeness guarantee.

- Webhooks handle the happy path (immediate updates)
- Cron catches anything webhooks miss (network issues, Shopify delays)
- Both paths use the same upsert logic
- Neither path alone is sufficient

### 6. Aggregate Consistency
Customer aggregate fields must be recomputed, not incremented.

- `order_count` = `SELECT COUNT(*) FROM order WHERE customer_id = ?`
- `total_spent` = `SELECT SUM(total_price) FROM order WHERE customer_id = ? AND financial_status = 'paid'`
- `last_order_at` = `SELECT MAX(ordered_at) FROM order WHERE customer_id = ?`
- Never do `order_count = order_count + 1` — leads to drift

### 7. Pagination Completeness
API pagination must be exhaustive — never stop early.

- Follow Shopify's `Link` header for REST pagination
- Process all pages before marking sync complete
- Log total records processed for verification

## Error Handling

- Partial sync is acceptable — process what we can, log what fails
- Never update `last_synced_at` if the sync failed entirely
- Individual record failures should not abort the entire sync
- All failures reported to Sentry with context (shopify_id, error, endpoint)
