# Domain: Costs

Last updated: 2026-06-06

## Per-Unit COGS (confirmed 2026-06-06 by Tom)

| SKU family | Avg unit cost | Retail | Gross margin at $40 | Contribution per unit |
|---|---:|---:|---:|---:|
| M1 Stainless Steel | $3.65 | $40 | 90.9% | $36.35 |
| M1 Titanium | $4.50 | $40 | 88.8% | $35.50 |
| M4 (Universal Link) | $3.65 | $40 | 90.9% | $36.35 |

Notes:
- "Avg unit cost" is the per-variant average across widths (16/18/20mm) within
  each finish. Variant-level cost is tracked in the production PO table
  (`production_po_line_item.unit_cost_cents`) but rolled up here for
  strategy use.
- M3 Keeperless (limited edition) and OEM/custom buckles have separate cost
  structures not captured here yet — flag if a strategy decision touches them.
- Other margin-affecting costs (shipping, platform fees, packaging, ad spend)
  layer on top of this — see "Current Understanding" and "Open Questions"
  below. The per-unit contribution figures above are pre-shipping,
  pre-platform-fee, pre-allocated-ad-spend.

## Strategic implications

The 90%+ gross margin profile materially changes the math on
discount-based mechanics. Specifically:

- **Card / coupon margin-transfer concerns are softer than a 60% margin
  business** — an $11 discount on a $40 buckle is ~31% of contribution at
  90% margin vs 46% at 60% margin. Break-even thresholds for any
  discount-based retention play are lower than the analyses that assumed
  60% margin had implied.
- **Per-unit incremental contribution is high**, which makes acquisition
  and retention spend that lifts even modest %-points of buyer behavior
  net-positive at the contribution-margin level (CAC ceilings willing).
- Cited in: [[../../strategy/bundle-strategy]] (re-evaluation pending),
  [[../../strategy/in-box-card-strategy]] (re-evaluation pending — using
  updated $36.35 contribution).

## Current Understanding

- **COGS**: Per-unit costs confirmed above for M1 / M4. Likely additional
  per-order packaging + shipping material costs not yet quantified.
- **Shipping**: Free shipping above threshold (firing on 85% of 2-unit
  orders per bundle analysis Cut 5). Eats margin per unit; magnitude TBD.
- **Platform fees**: Shopify monthly + transaction fees (~2.9% + 30c on
  Shopify Payments). At $40 AOV that's ~$1.46/order before any volume tier.
- **Ad spend**: Meta-heavy historically; Google branded search only on the
  paid Google side. Amount monthly TBD.
- **Infrastructure**: Vercel (likely Pro plan ~$20/mo), NeonDB (free tier
  or Pro), domain, email.
- **No employees**: Founder-run, manufacturing outsourced.

## Open Questions

- [x] ~~What is the per-unit COGS for M1 and M4?~~ — resolved 2026-06-06.
- [ ] Shipping cost per order (average)?
- [ ] Monthly Meta + Google ad spend?
- [ ] Shopify plan tier and monthly cost?
- [ ] Total monthly fixed costs (platform, tools, subscriptions)?
- [ ] Manufacturing lead times and MOQs?
- [ ] Packaging costs per order?
- [ ] What does fully-loaded contribution margin look like
      (post shipping, packaging, platform fees, allocated fixed costs)?
- [ ] COGS for M3 Keeperless + OEM/custom buckles?
- [ ] Infrastructure costs as we add more tools (PostHog now live, Sentry
      descoped)?

## Data Sources

- Shopify (transaction fees, shipping costs)
- Google Ads (ad spend)
- Manual (COGS, fixed costs, manufacturing)
- Vercel/NeonDB billing dashboards
