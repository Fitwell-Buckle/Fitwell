# Invariant: Attribution Rules

Last updated: 2026-05-07

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
UTM data persists in a first-party cookie for linking post-purchase.

- Cookie name: `fw_attribution`
- Cookie lifetime: 30 days (matches attribution window)
- Contains: session_id, utm params, timestamp
- HttpOnly: false (needs client-side read for PostHog)
- SameSite: Lax

### 4. Purchase Linking
When a Shopify order is synced, attempt to link it to an attribution record.

- Match by customer email: `utm_attribution.customer_id` linked via email lookup
- If multiple attribution records exist, use the most recent within the window
- Set `converted = true` and `converted_at` on the attribution record
- If no attribution record exists, the purchase is "direct/unattributed"

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
