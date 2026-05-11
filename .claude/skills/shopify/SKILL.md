---
name: shopify
description: Query and manage Shopify store data — orders, customers, products, sync status
---

# Shopify Store Operations

Use this skill to interact with the Fitwell Shopify store and local synced data.

## Commands

Run via `npx tsx scripts/shopify-cli.ts <command>`:

| Command | Source | Description |
|---------|--------|-------------|
| `orders [--since DATE] [--limit N]` | Local DB | List recent orders |
| `customers [--email X] [--limit N]` | Local DB | List customers |
| `products` | Shopify API | List products with SKUs and pricing |
| `order <shopify-id>` | Shopify API | Full order detail |
| `customer <shopify-id>` | Shopify API | Full customer detail |
| `sync-status` | Both | Compare local vs Shopify counts |
| `webhooks` | Shopify API | List registered webhooks |
| `sync [--since DATE]` | Shopify API | Trigger manual sync to local DB |

## When to Use

- Investigating a specific order or customer issue
- Checking sync health (local DB vs Shopify drift)
- Reviewing product catalog and SKUs
- Verifying webhook configuration
- Running ad-hoc data pulls for analysis

## Data Model

- Shopify → webhooks + cron (every 2h) → local NeonDB → admin dashboard
- Tables: `customer`, `order`, `order_line_item`
- All money values in cents (integer). Display as dollars: cents / 100
- Shopify IDs are the canonical dedup keys
- Cron sync uses 25h overlap window to catch webhook gaps
