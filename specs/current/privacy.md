# Privacy & PII Inventory

Last updated: 2026-05-28

## PII Stored

| Data | Source | Table | Retention | Notes |
|------|--------|-------|-----------|-------|
| Customer email | Shopify sync | `customer` | Indefinite | Primary identifier for linking |
| Customer name | Shopify sync | `customer` | Indefinite | First + last name |
| Customer phone | Shopify sync | `customer` | Indefinite | Nullable |
| Customer addresses — full street + phone | Shopify sync | `customer_address` | Indefinite | One row per Shopify address (default + saved); see [Customer addresses](#customer-addresses) below. **Added 2026-05-28** (migration 0022) |
| Order email | Shopify sync | `order` | Indefinite | May differ from customer email |
| Admin user email | Google OAuth | `user` | Indefinite | Small set of admins |
| Admin's Google OAuth access/refresh tokens | NextAuth | `account` | Until sign-out or revoke | Includes `gmail.readonly` scope as of 2026-05-28; see [Gmail integration](#gmail-integration) below |
| Customer-supplied invoice documents (PDF POs, etc.) | Admin upload | Vercel Blob via `invoice_attachment` | Indefinite | Public URLs with `addRandomSuffix: true` (unenumerable but readable by anyone with the link) |
| UTM parameters | Landing pages | `utm_attribution` | Indefinite | Not PII per se, but tied to sessions |
| Referrer URL | Landing pages | `utm_attribution` | Indefinite | `document.referrer` |
| Landing page URL | Landing pages | `utm_attribution` | Indefinite | Path only |
| Google click ID (gclid) | Landing pages | `utm_attribution` | Indefinite | Pseudonymous identifier |
| PostHog distinct_id | PostHog cookie | Client-side only | PostHog retention | Anonymous by default |

### Customer addresses

As of 2026-05-28, the customer sync also stores Shopify customer addresses (`customer_address` table) so the B2B admin can see them when working with linked brands. Sync is delete-and-replace from Shopify's payload on every customer upsert, so removing an address in Shopify removes it locally on the next sync. Fields include `first_name`, `last_name`, `company`, `address1`, `address2`, `city`, `province`, `country`, `zip`, `phone`. Surfaced on `/customers/brands/[id]` only; not used for marketing/analytics. Backfill of existing ~15K customers is opt-in via `scripts/backfill-customer-addresses.ts`.

### Gmail integration

The Google provider's scope set now includes `https://www.googleapis.com/auth/gmail.readonly`. When an admin signs in, their OAuth access token (with that scope) is stored on the `account` row. Used **only** server-side, **only** for the signed-in admin, **only** when they explicitly issue a `GET /api/gmail/search?q=…` (no background scanning). The route returns parsed email addresses + names from From/To/Cc headers and the message snippet for each match. Tokens auto-refresh from the stored `refresh_token`; the `signIn` callback force-writes the latest tokens to the row on every sign-in (NextAuth's adapter wouldn't on its own — see `integrations.md` → Gmail).

## PII NOT Stored

| Data | Reason |
|------|--------|
| Payment card details | Shopify handles all checkout/payment |
| Customer passwords | No customer accounts in our system |
| IP addresses | Not captured or logged |
| Social security / government ID | Not applicable |
| Gmail message bodies | The Gmail integration only reads headers (`metadataHeaders=From,To,Cc`) + the snippet Google returns by default. Full bodies are never fetched or stored |

## Data Processing

- **No direct payment processing** — Shopify owns the checkout flow
- **No customer-facing accounts** — admin-only authentication
- **PostHog** — configured for US data residency (`us.i.posthog.com`)
- **GA4** — Google's standard data processing terms apply
- **NeonDB** — data encrypted at rest and in transit

## Access Controls

- Admin dashboard requires Google OAuth (allowlisted emails only)
- API routes behind auth middleware
- Cron endpoints protected by `CRON_SECRET`
- Webhook endpoints verify Shopify HMAC signature
- No public API exposing customer data

## Compliance Notes

- Privacy policy at `/privacy` discloses analytics usage
- Terms of service at `/terms`
- Cookie consent needed for PostHog and GA4 in EU markets
- Shopify handles GDPR data subject requests for their customer data
- We should support data deletion requests for our synced copy

## Open Questions

- [ ] GDPR data deletion flow — webhook from Shopify `customers/data_request` + `customers/redact`?
- [ ] Cookie consent banner for EU visitors?
- [ ] Data retention policy for analytics staging tables?
- [ ] PostHog privacy controls — property blacklist for sensitive fields?
