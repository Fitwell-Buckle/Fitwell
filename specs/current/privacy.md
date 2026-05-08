# Privacy & PII Inventory

Last updated: 2026-05-07

## PII Stored

| Data | Source | Table | Retention | Notes |
|------|--------|-------|-----------|-------|
| Customer email | Shopify sync | `customer` | Indefinite | Primary identifier for linking |
| Customer name | Shopify sync | `customer` | Indefinite | First + last name |
| Customer phone | Shopify sync | `customer` | Indefinite | Nullable |
| Customer address (city/state/country) | Shopify sync | `customer` | Indefinite | Default address only, no street |
| Order email | Shopify sync | `order` | Indefinite | May differ from customer email |
| Admin user email | Google OAuth | `user` | Indefinite | Small set of admins |
| UTM parameters | Landing pages | `utm_attribution` | Indefinite | Not PII per se, but tied to sessions |
| Referrer URL | Landing pages | `utm_attribution` | Indefinite | `document.referrer` |
| Landing page URL | Landing pages | `utm_attribution` | Indefinite | Path only |
| Google click ID (gclid) | Landing pages | `utm_attribution` | Indefinite | Pseudonymous identifier |
| PostHog distinct_id | PostHog cookie | Client-side only | PostHog retention | Anonymous by default |

## PII NOT Stored

| Data | Reason |
|------|--------|
| Payment card details | Shopify handles all checkout/payment |
| Full street address | Only city/state/country synced for geographic analysis |
| Customer passwords | No customer accounts in our system |
| IP addresses | Not captured or logged |
| Social security / government ID | Not applicable |

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
