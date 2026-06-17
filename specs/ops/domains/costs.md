# Domain: Costs

Last updated: 2026-06-15

## Live COGS calculation (added 2026-06-15)

Per-SKU COGS is now computed in-app at **`/cogs`** (admin → Product → COGS).
Each SKU's unit cost is the **quantity-weighted average of actual purchase-order
unit costs**, applied to units sold over a date range for COGS + gross margin.

- **Cost basis**: PO lines that are *received* OR linked to a *paid invoice*
  (customers routinely prepay before goods arrive — that cost is recognized as
  soon as the money lands), on non-cancelled POs, with the multi-supplier cost
  rollup. Logic in `src/lib/cogs/` (pure math in `compute.ts`, unit-tested).
- **History**: Shopify has no PO API, so the company's historical POs (PO3–PO19,
  Feb 2024 → Dec 2025, 154 line items) were parsed from the Shopify PO **PDF
  exports** into `scripts/shopify-pos.json` (reconciled: qty×cost==line
  total, Σ==subtotal, count==declared) and imported via
  `npm run import:shopify-pos -- --apply` into the `production_po` tables
  (`origin='shopify_pdf'`). Ongoing production POs blend in automatically.
- **Cost policy**: volume discounts are prorated into unit costs; one-time
  tooling is excluded from per-unit cost (capital, not marginal COGS).

Actual quantity-weighted averages from the imported history (silver/natural
widths) land near: **M1 Stainless ≈ $3.0–3.1**, **M1 Titanium ≈ $4.4–4.6**,
**M4 Universal $3.32 flat** — close to Tom's confirmed figures below, now
drift-free and recomputed on every page load. Note early pre-production runs
(PO3 "coming soon", PO4) are naturally down-weighted by their small quantities.

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

- **COGS**: Per-unit costs confirmed above for M1 / M4, and now computed live
  per SKU at `/cogs` from actual PO history (see "Live COGS calculation"
  above). Likely additional
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
