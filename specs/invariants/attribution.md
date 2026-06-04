# Invariant: Attribution Rules

Last updated: 2026-06-03

These rules govern how marketing touchpoints are attributed to customer conversions.

## Attribution Model

### First-Touch Attribution (Default)
The first marketing touchpoint that brought a visitor to the site gets credit for the conversion.

- **Rationale**: For a considered purchase like a watch buckle, the discovery moment matters most
- UTM params from the first visit are stored on the customer record
- This is the primary model used for ROAS calculations

### Attribution Window
A UTM attribution record can be linked to a purchase within a defined window.

- **Window**: 30 days from first touch
- Attribution records older than 30 days are not linked to new purchases
- Window is configurable but must be documented when changed

## Capture Rules

### 1. Capture on Landing
UTM parameters are captured the moment a user lands on any marketing page.

- All five UTM params: `source`, `medium`, `campaign`, `term`, `content`
- Plus: `referrer`, `landing_page`, `gclid`
- Stored in `utm_attribution` table immediately
- Also set as PostHog person properties

### 2. No Overwrite
Once a session's UTM params are captured, they are not overwritten if the user navigates to another page.

- First pageview in a session captures the attribution
- Subsequent pageviews in the same session do not create new attribution records
- A new session (new visit, >30 min gap) creates a new attribution record

### 3. Cookie Persistence
A first-party cookie marks the first-touch capture so subsequent pageviews don't re-POST.

- Cookie name: `fw_attribution`
- Cookie lifetime: 30 days (matches attribution window)
- Contains: PostHog `$session_id` of the touch (functions as a marker; the row of data lives in `utm_attribution`)
- HttpOnly: false (set client-side from the theme snippet)
- SameSite: Lax
- **Domain: `.fitwellbuckle.co`** — required. The entire funnel (landing, storefront, checkout) is one Shopify site under `www.fitwellbuckle.co`; the cookie must span the registrable domain so the first-touch flag survives navigation across pages.
- Visitor identity uses PostHog's own distinct_id, kept in the standard `ph_<token>_posthog` cookie. PostHog's default cookie handling shares it across the storefront and the Custom Pixel iframe (both are same-origin under `www.fitwellbuckle.co`). No separate identity bridge cookie is needed — see `specs/research/posthog-shopify-stitching.md`.

### 4. Purchase Linking
When a Shopify order is synced, link it to an attribution record. Two methods, in priority order:

Note: PostHog's standard Shopify install already identifies every purchase by customer email (`posthog.identify(email)` in the checkout pixel) — purchases are never anonymous. These methods govern how the order is linked back to the *pre-purchase attribution touch*.

1. **Pixel-stitched (preferred, `link_method = 'pixel'`)**: the storefront snippet's posthog-js distinct_id carries through to the Custom Pixel via the shared `.fitwellbuckle.co` posthog cookie. The pixel's `posthog.identify(email)` on `checkout_completed` triggers posthog-js's standard `$anon_distinct_id` merge, so the pre-purchase anonymous Person and the email-keyed Person become one. The `utm_attribution` row written at first-touch is linked to the order via that distinct_id (stored on the order/customer rows during the `orders/create` webhook — Phase 3).
2. **Email match (fallback, `link_method = 'email_match'`)**: for orders predating the pixel or where the distinct_id was lost. Match `utm_attribution` email ↔ order email; if multiple, use the most recent within the 30-day window. Lower confidence — surfaced separately in reporting.

- Set `converted = true` and `converted_at` on the attribution record.
- If neither method resolves, the purchase is "direct/unattributed".

### 5. Deduplication
Prevent double-counting conversions.

- One order can only be attributed to one UTM attribution record
- One UTM attribution record can only be linked to one conversion
- If a customer has multiple orders, each order gets its own attribution (or none)

## Channel Mapping

| utm_source | utm_medium | Channel |
|-----------|-----------|---------|
| google | cpc | Google Ads |
| google | organic | Organic Search |
| (direct) | (none) | Direct |
| shopify | referral | Shopify Marketplace |
| partner name | referral | Partner Referral |
| facebook | cpc | Meta Ads |
| email | email | Email Marketing |
| — | — | Unattributed |

## Open Questions

- [ ] Should we track multi-touch attribution as a secondary model?
- [ ] How to handle cross-device attribution (same customer, different devices)?
- [ ] View-through conversions from Google Ads — worth tracking?
- [ ] Should partner referrals use UTM or a separate mechanism?
