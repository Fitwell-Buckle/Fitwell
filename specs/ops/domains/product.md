# Domain: Product

Last updated: 2026-05-07

## Current Understanding

**Catalog + mechanics confirmed 2026-06-20** from the live storefront
(`fitwellbuckle.co/products.json`). Resolves several open questions below.

- **M1 Micro-Adjust Buckle**: Core product. *Replaces* the strap's existing
  pin/tang buckle — no strap modification. Smooth **3mm "half-hole"
  on-wrist adjustment** for warm/cold wrist-size swing. Ships with one
  installed spring bar **+ one spare**. "Doubles the number of usable fit
  positions." Compatible with most leather, rubber, or fabric straps.
  Variants: titanium, stainless steel, + yellow-gold / rose-gold / black
  finishes.
- **M4 Universal Micro-Adjust Link**: Complementary product. An **inline
  connector installed *between* the strap and its existing closure** — a
  slide mechanism giving up to **3mm** adjustment while adding only ~5.5mm
  of length (<one hole). **Works with both deployant clasps *and* pin
  buckles** — i.e. the answer when you *can't or won't* swap the buckle.
  No tools, no strap mod. Uses standard 1.5mm spring bars (1.6mm on the
  22mm link). Finishes: black, yellow gold, rose gold, stainless steel.
- **Accessories**: Wide 2.25mm Tang for M1 (for straps with wider holes),
  Fitwell Spring Bar (replacement part).
- **Currently live products = M1 and M4** (Tom, 2026-06-20). The
  `products.json` pull also surfaced an "M3 Keeperless (LE)" listing, but
  it is **not a current product** — ignore it for marketing/flows.
- **M1 vs M4 (the key distinction):** M1 *becomes* the buckle (cleanest, for
  swappable pin-buckle straps); M4 *adds a link* without removing anything
  (for deployant clasps, branded/integrated buckles, or maxed straps). They
  are complementary, not either/or — the natural cross-sell pair.
- **Sizing rule (both M1 and M4):** measure **strap width at the buckle, not
  lug-to-lug**. For tapered straps, measure at the buckle end. (Corrects the
  earlier "lug widths" note — the storefront is explicit it's the buckle
  width.)
- Products are precision-manufactured — quality and engineering are key
  differentiators.

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

- [x] ~~What is the full SKU matrix (sizes x finishes x models)?~~ — models
  resolved 2026-06-20 (M1, M4, M3 LE, Wide Tang, Spring Bar; see above).
  Per-size variant list still worth a full pull if needed.
- [ ] Which SKU combinations are best sellers?
- [ ] Return/exchange rate and primary reasons?
- [ ] Customer complaints or common issues? (Known from review corpus: M1
  auto-loosening objection — see `specs/strategy/vocabulary-map.md`
  Trust-Objection. Setup email D1 preempts it.)
- [~] Product roadmap — new models planned? **Partial (Tom, 2026-06-20):**
  **M2, M3, M5** are planned future products (names only; specs TBD). Build
  marketing automations to extend to new product branches cleanly — don't
  hard-code an M1/M4 binary.
- [x] ~~What materials are used?~~ — titanium + stainless steel; yellow-gold /
  rose-gold / black finishes (plating vs solid unconfirmed). Resolved 2026-06-20.
- [x] ~~How does M1 micro-adjust mechanism work technically?~~ — resolved
  2026-06-20: replaces pin buckle, 3mm "half-hole" on-wrist slide; M4 is an
  inline slide link between strap and closure. See Current Understanding.
- [ ] Fit compatibility — which watch brands/strap widths are supported?
  (Sizing is by strap width at the buckle; width variants 18/20/22mm typical.)
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
