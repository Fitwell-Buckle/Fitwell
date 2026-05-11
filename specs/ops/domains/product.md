# Domain: Product

Last updated: 2026-05-07

## Current Understanding

- **M1 Micro-Adjust Buckle**: Core product. Precision micro-adjustment mechanism for watch straps. Allows fine-tuning of strap fit without traditional pin-and-hole limitations.
- **M4 Universal Link**: Complementary product. Universal compatibility with various strap styles.
- Products are precision-manufactured — quality and engineering are key differentiators
- Size variants exist (lug widths: 18mm, 20mm, 22mm typical for watches)
- Finish variants (brushed, polished, PVD black, etc.)
- Compatible with most leather and rubber watch straps

## Channel & Inventory Issues

**Problem (discovered 2026-05-11):** Shopify uses a single inventory pool per location. Wholesale/OEM orders (entered as draft orders) decrement the same inventory that web DTC orders draw from. A wholesale order for 50 units can deplete the 20 units reserved for web customers, causing the site to show "sold out" even though those units were earmarked for online sales.

**Example:** A wholesale order for 50 units was placed. Only 20 were physically in stock (intended for web). Shopify decremented to -30, turning off sales for multiple products on the website. The plan was to wait for the next production run to fulfill wholesale, not ship from web-reserved stock.

**Key insight:** Draft orders = wholesale/OEM. Web orders = DTC. Shopify's `source_name` field distinguishes these (`draft_orders` vs `web`).

**Possible solutions:**
- [ ] Separate Shopify locations for DTC vs wholesale inventory pools
- [ ] Shopify B2B/wholesale channel with independent inventory rules
- [ ] Inventory threshold alerts: warn when web-available stock drops below N
- [ ] Dashboard separation of DTC vs wholesale metrics (revenue, volume, inventory impact)

**What we're tracking now:** `source_name` captured on every synced order so we can distinguish DTC from wholesale in analytics.

## Open Questions

- [ ] What is the full SKU matrix (sizes x finishes x models)?
- [ ] Which SKU combinations are best sellers?
- [ ] Return/exchange rate and primary reasons?
- [ ] Customer complaints or common issues?
- [ ] Product roadmap — new models planned?
- [ ] What materials are used? (316L stainless steel? Titanium?)
- [ ] How does M1 micro-adjust mechanism work technically?
- [ ] Fit compatibility — which watch brands/strap widths are supported?
- [ ] Are there fit issues driving returns (e.g., strap thickness compatibility)?
- [ ] Patent/IP status on the micro-adjust mechanism?
- [ ] How should inventory be split between DTC and wholesale channels?
- [ ] What's the typical wholesale order size and frequency?
- [ ] Are wholesale orders always entered as draft orders in Shopify?

## Data Sources

- Shopify order line items (product mix, variant popularity)
- Shopify product catalog (SKU matrix)
- Customer reviews/feedback (qualitative)
- Return/exchange data from Shopify
