/**
 * Wipe all business data on the dev Neon branch and reseed with simulated
 * content suitable for screenshots / demos. Keeps auth (user/account/session/
 * verificationToken) and migration-seeded reference data (production_stage_def)
 * intact.
 *
 * REFUSES to run against the production Neon branch — it checks the DATABASE_URL
 * host and exits before doing anything destructive. Still: only run it against
 * `.env.local` (`oliver-dev` / `tom-dev` / `greg-dev`), never with prod env
 * pulled in.
 *
 * Usage:
 *   npx tsx scripts/reseed-dev.ts
 *
 * Re-runnable. Idempotency comes from the leading TRUNCATE.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  billingSettings,
  company,
  companyContact,
  customer,
  customerAddress,
  influencer,
  influencerOrder,
  influencerOrderLineItem,
  invoice,
  invoiceLineItem,
  order,
  orderLineItem,
  priceTier,
  productionPo,
  productionPoLineItem,
  productionStageAssignment,
  productionStageEvent,
  productionSupplierLineCost,
  supplier,
  supplierContact,
} from "@/lib/schema";

// ─── Safety: refuse to touch production ────────────────────────────────────
function assertNotProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^/:]+)/.exec(url)?.[1] ?? "";
  if (!host) {
    console.error("✗ DATABASE_URL has no host — refusing to run.");
    process.exit(1);
  }
  if (host.startsWith("ep-divine-field-aqvgidm6")) {
    console.error(`✗ Target host is PRODUCTION (${host}). Refusing.`);
    process.exit(1);
  }
  console.log(`✓ Target host: ${host}  (dev — proceeding)`);
}

// ─── 1. Truncate (cascade handles children) ────────────────────────────────
async function wipe(): Promise<void> {
  // Order is irrelevant with CASCADE, but listing parents catches the children.
  // Auth tables and production_stage_def are deliberately excluded.
  await db.execute(sql`
    TRUNCATE TABLE
      customer,
      company,
      price_tier,
      supplier,
      "order",
      utm_attribution,
      production_po,
      production_stage_def,
      invoice,
      influencer,
      admin_notification,
      billing_settings,
      customer_event
    RESTART IDENTITY CASCADE
  `);
  console.log("✓ Truncated business data");
}

// ─── 2. Re-seed reference rows that migrations would have populated ────────
async function seedStageDefs(): Promise<void> {
  // Mirror 0019_dynamic_stages.sql's seed.
  await db.execute(sql`
    INSERT INTO production_stage_def (key, label, position, active) VALUES
      ('supplier_po', 'Supplier PO', 0, true),
      ('stamping', 'Raw Material Stamping', 1, true),
      ('edm', 'EDM', 2, true),
      ('polishing', 'Polishing', 3, true),
      ('logo', 'Logo', 4, true),
      ('plating', 'Plating', 5, true),
      ('qc', 'QC', 6, true),
      ('packaging', 'Packaging', 7, true),
      ('complete', 'Complete', 8, true)
    ON CONFLICT (key) DO NOTHING
  `);
  console.log("✓ Re-seeded production_stage_def");
}

// ─── 3. Seed simulated data ────────────────────────────────────────────────
async function seedData(): Promise<void> {
  // ── Price tiers ────────────────────────────────────────────────────
  const [tierWholesale, tierRetail, tierPlatinum] = await db
    .insert(priceTier)
    .values([
      { name: "Wholesale", discountPercent: 30 },
      { name: "Retail Partner", discountPercent: 20 },
      { name: "Platinum", discountPercent: 40 },
    ])
    .returning();

  // ── Customers (Shopify-linked B2B + a few consumer) + addresses ────
  const customers = await db
    .insert(customer)
    .values([
      {
        shopifyId: "sim_cust_001",
        email: "buyer@aspenwatch.example",
        firstName: "Margaret",
        lastName: "Holm",
        phone: "+1-303-555-0142",
        orderCount: 4,
        totalSpent: 248000,
        tags: ["wholesale", "vip"],
      },
      {
        shopifyId: "sim_cust_002",
        email: "purchasing@vegatime.example",
        firstName: "Daniel",
        lastName: "Okafor",
        phone: "+1-415-555-0184",
        orderCount: 2,
        totalSpent: 96000,
        tags: ["wholesale"],
      },
      {
        shopifyId: "sim_cust_003",
        email: "orders@hartlandco.example",
        firstName: "Priya",
        lastName: "Sundaram",
        phone: "+1-617-555-0119",
        orderCount: 1,
        totalSpent: 12500,
        tags: ["retail-partner"],
      },
      {
        shopifyId: "sim_cust_004",
        email: "team@kestreltime.example",
        firstName: "Jonas",
        lastName: "Albright",
        phone: "+1-206-555-0167",
        orderCount: 6,
        totalSpent: 432000,
        tags: ["wholesale", "platinum"],
      },
      {
        shopifyId: "sim_cust_005",
        email: "ari@brunella.example",
        firstName: "Arielle",
        lastName: "Brunelli",
        phone: "+1-512-555-0193",
        orderCount: 0,
        totalSpent: 0,
        tags: [],
      },
      // A handful of consumer customers for the dashboard / customer list.
      ...["Alex Park", "Sam Tanaka", "Jordan Reyes", "Casey Mendez", "Riley Choi"].map((name, i) => {
        const [firstName, lastName] = name.split(" ");
        return {
          shopifyId: `sim_cust_consumer_${i + 1}`,
          email: `${firstName.toLowerCase()}@example.com`,
          firstName,
          lastName,
          phone: null,
          orderCount: 1,
          totalSpent: 12000 + i * 4000,
          tags: [],
        };
      }),
    ])
    .returning();

  const [cAspen, cVega, cHartland, cKestrel, cBrunella] = customers;

  // Default + secondary addresses for the four Shopify-linked B2B customers.
  await db.insert(customerAddress).values([
    {
      customerId: cAspen.id,
      shopifyAddressId: "sim_addr_001",
      firstName: "Margaret",
      lastName: "Holm",
      company: "Aspen Watch Co.",
      address1: "412 Larimer St, Suite 4",
      city: "Denver",
      province: "Colorado",
      provinceCode: "CO",
      country: "United States",
      countryCode: "US",
      zip: "80202",
      phone: "+1-303-555-0142",
      isDefault: true,
    },
    {
      customerId: cAspen.id,
      shopifyAddressId: "sim_addr_002",
      firstName: "Margaret",
      lastName: "Holm",
      company: "Aspen Watch Co. — Warehouse",
      address1: "8800 N Washington St",
      city: "Thornton",
      province: "Colorado",
      provinceCode: "CO",
      country: "United States",
      countryCode: "US",
      zip: "80229",
      phone: null,
      isDefault: false,
    },
    {
      customerId: cVega.id,
      shopifyAddressId: "sim_addr_003",
      firstName: "Daniel",
      lastName: "Okafor",
      company: "Vega Timepieces",
      address1: "210 Folsom St, Floor 5",
      city: "San Francisco",
      province: "California",
      provinceCode: "CA",
      country: "United States",
      countryCode: "US",
      zip: "94105",
      phone: "+1-415-555-0184",
      isDefault: true,
    },
    {
      customerId: cHartland.id,
      shopifyAddressId: "sim_addr_004",
      firstName: "Priya",
      lastName: "Sundaram",
      company: "Hartland & Co.",
      address1: "57 Newbury St",
      city: "Boston",
      province: "Massachusetts",
      provinceCode: "MA",
      country: "United States",
      countryCode: "US",
      zip: "02116",
      phone: "+1-617-555-0119",
      isDefault: true,
    },
    {
      customerId: cKestrel.id,
      shopifyAddressId: "sim_addr_005",
      firstName: "Jonas",
      lastName: "Albright",
      company: "Kestrel Timeworks",
      address1: "1900 Westlake Ave N",
      address2: "Suite 220",
      city: "Seattle",
      province: "Washington",
      provinceCode: "WA",
      country: "United States",
      countryCode: "US",
      zip: "98109",
      phone: "+1-206-555-0167",
      isDefault: true,
    },
  ]);

  // ── B2B brands ──────────────────────────────────────────────────────
  const companies = await db
    .insert(company)
    .values([
      {
        name: "Aspen Watch Co.",
        contactName: "Margaret Holm",
        contactEmail: "buyer@aspenwatch.example",
        address: "412 Larimer St, Suite 4\nDenver, CO 80202",
        customerId: cAspen.id,
        priceTierId: tierWholesale.id,
        depositPercent: 50,
        notes: "Standing order monthly. Approves artwork via email.",
      },
      {
        name: "Vega Timepieces",
        contactName: "Daniel Okafor",
        contactEmail: "purchasing@vegatime.example",
        address: "210 Folsom St, Floor 5\nSan Francisco, CA 94105",
        customerId: cVega.id,
        priceTierId: tierWholesale.id,
        depositPercent: 30,
        notes: null,
      },
      {
        name: "Hartland & Co.",
        contactName: "Priya Sundaram",
        contactEmail: "orders@hartlandco.example",
        address: "57 Newbury St\nBoston, MA 02116",
        customerId: cHartland.id,
        priceTierId: tierRetail.id,
        depositPercent: 0,
        notes: "Pays on NET-30. No deposit required.",
      },
      {
        name: "Kestrel Timeworks",
        contactName: "Jonas Albright",
        contactEmail: "team@kestreltime.example",
        address: "1900 Westlake Ave N, Suite 220\nSeattle, WA 98109",
        customerId: cKestrel.id,
        priceTierId: tierPlatinum.id,
        depositPercent: 50,
        notes: "Custom co-branded buckles. Stamped logo on each.",
      },
      {
        name: "Brunella Watchworks",
        contactName: "Arielle Brunelli",
        contactEmail: "ari@brunella.example",
        address: null,
        customerId: cBrunella.id,
        priceTierId: tierRetail.id,
        depositPercent: 25,
        notes: "New partner — first PO pending.",
      },
    ])
    .returning();

  const [coAspen, coVega, coHartland, coKestrel] = companies;

  await db.insert(companyContact).values([
    {
      companyId: coAspen.id,
      email: "buyer@aspenwatch.example",
      name: "Margaret Holm",
    },
    {
      companyId: coAspen.id,
      email: "ap@aspenwatch.example",
      name: "Accounts Payable",
    },
    {
      companyId: coKestrel.id,
      email: "team@kestreltime.example",
      name: "Jonas Albright",
    },
  ]);

  // ── Suppliers ───────────────────────────────────────────────────────
  const suppliers = await db
    .insert(supplier)
    .values([
      {
        name: "Northwind Stamping",
        contactName: "Hideo Yamaguchi",
        contactEmail: "hideo@northwindstamp.example",
        shippingAddress: "Plot 14, Yangshan Industrial Park\nNingbo, China 315000",
        notes: "Stamping + EDM. Reliable, 3-week lead.",
      },
      {
        name: "Vermont Polish",
        contactName: "Sara Beaumont",
        contactEmail: "sara@vermontpolish.example",
        shippingAddress: "98 Industrial Dr\nBurlington, VT 05401",
        notes: "Hand-polished finish. Premium.",
      },
      {
        name: "Iron Crown Plating",
        contactName: "Marcus Adler",
        contactEmail: "marcus@ironcrown.example",
        shippingAddress: "2200 Steel Way\nPittsburgh, PA 15201",
        notes: "PVD black + rose gold. 5-day turnaround.",
      },
      {
        name: "EPower Manufacturing",
        contactName: "Jared Haw",
        contactEmail: "jared@epower.example",
        shippingAddress: "Block C, 88 Liantang Rd\nDongguan, China 523000",
        notes: "Full-stack supplier — does the whole run when needed.",
      },
      {
        name: "Sutherland QC",
        contactName: "Nia Sutherland",
        contactEmail: "nia@sutherlandqc.example",
        shippingAddress: "640 5th Ave SW\nCalgary, AB T2P 3G4, Canada",
        notes: "Final inspection + packaging.",
      },
    ])
    .returning();

  const [sNorthwind, sVermont, sIron, sEpower, sSutherland] = suppliers;

  await db.insert(supplierContact).values([
    { supplierId: sNorthwind.id, email: "hideo@northwindstamp.example", name: "Hideo Yamaguchi" },
    { supplierId: sNorthwind.id, email: "ops@northwindstamp.example", name: "Operations" },
    { supplierId: sVermont.id, email: "sara@vermontpolish.example", name: "Sara Beaumont" },
    { supplierId: sIron.id, email: "marcus@ironcrown.example", name: "Marcus Adler" },
    { supplierId: sEpower.id, email: "jared@epower.example", name: "Jared Haw" },
    { supplierId: sSutherland.id, email: "nia@sutherlandqc.example", name: "Nia Sutherland" },
  ]);

  // ── Orders (a handful — populates the Customer / Order list pages) ──
  const orderRows = await db
    .insert(order)
    .values(
      customers.slice(0, 8).map((c, i) => ({
        shopifyId: `sim_order_${1000 + i}`,
        shopifyOrderNumber: 1000 + i,
        customerId: c.id,
        totalPrice: 4900 + i * 1200,
        subtotalPrice: 4900 + i * 1200,
        currency: "USD",
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
        sourceName: i % 3 === 0 ? "wholesale" : "web",
        createdAt: new Date(Date.now() - (30 - i * 3) * 86400000),
        processedAt: new Date(Date.now() - (30 - i * 3) * 86400000),
      })),
    )
    .returning();

  await db.insert(orderLineItem).values(
    orderRows.map((o, i) => ({
      orderId: o.id,
      sku: i % 2 === 0 ? "FWB001-BL-16" : "FWB001-BL-18",
      title: `Fitwell M1 Black Buckle — ${i % 2 === 0 ? "16mm" : "18mm"} Width / 316L Stainless Steel / Black`,
      quantity: 1,
      price: o.totalPrice ?? 4900,
    })),
  );

  // ── Production POs ──────────────────────────────────────────────────
  // PO #1 — Master with 2 sub-POs (Kestrel custom run, in-progress)
  const today = new Date();
  const days = (n: number) => new Date(today.getTime() - n * 86400000);

  const [poMaster] = await db
    .insert(productionPo)
    .values({
      shopifyPoNumber: "00118",
      supplierId: sNorthwind.id,
      companyId: coKestrel.id,
      status: "active",
      issuedDate: days(14).toISOString().slice(0, 10),
      expectedDeliveryDate: days(-21).toISOString().slice(0, 10),
      locationName: "Seattle DC",
      notes: "Kestrel co-branded run. Logo on plate, PVD black finish.",
      lockStagesTogether: false,
    })
    .returning();

  const subPos = await db
    .insert(productionPo)
    .values([
      {
        shopifyPoNumber: "00118",
        poSuffix: "A",
        parentPoId: poMaster.id,
        supplierId: sNorthwind.id,
        companyId: coKestrel.id,
        status: "active",
        issuedDate: days(14).toISOString().slice(0, 10),
        expectedDeliveryDate: days(-21).toISOString().slice(0, 10),
        locationName: "Seattle DC",
      },
      {
        shopifyPoNumber: "00118",
        poSuffix: "B",
        parentPoId: poMaster.id,
        supplierId: sIron.id,
        companyId: coKestrel.id,
        status: "active",
        issuedDate: days(14).toISOString().slice(0, 10),
        expectedDeliveryDate: days(-21).toISOString().slice(0, 10),
        locationName: "Seattle DC",
      },
    ])
    .returning();

  // Stage assignments: Northwind owns stamping+edm+polishing+logo; Iron owns plating+qc+packaging.
  await db.insert(productionStageAssignment).values([
    { poId: poMaster.id, supplierId: sNorthwind.id, stage: "stamping" },
    { poId: poMaster.id, supplierId: sNorthwind.id, stage: "edm" },
    { poId: poMaster.id, supplierId: sNorthwind.id, stage: "polishing" },
    { poId: poMaster.id, supplierId: sNorthwind.id, stage: "logo" },
    { poId: poMaster.id, supplierId: sIron.id, stage: "plating" },
    { poId: poMaster.id, supplierId: sIron.id, stage: "qc" },
    { poId: poMaster.id, supplierId: sIron.id, stage: "packaging" },
  ]);

  const masterLines = await db
    .insert(productionPoLineItem)
    .values([
      {
        poId: poMaster.id,
        sku: "FWK-CO-BL-16",
        title: "Kestrel Co-brand Buckle — 16mm / 316L SS / PVD Black",
        quantity: 250,
        unitCostCents: 1200,
        currentStage: "logo",
      },
      {
        poId: poMaster.id,
        sku: "FWK-CO-BL-18",
        title: "Kestrel Co-brand Buckle — 18mm / 316L SS / PVD Black",
        quantity: 200,
        unitCostCents: 1200,
        currentStage: "logo",
      },
      {
        poId: poMaster.id,
        sku: "FWK-CO-BL-20",
        title: "Kestrel Co-brand Buckle — 20mm / 316L SS / PVD Black",
        quantity: 200,
        unitCostCents: 1200,
        currentStage: "polishing",
      },
    ])
    .returning();

  // Stage events (entered_at) per line item — walk through the early stages.
  await db.insert(productionStageEvent).values(
    masterLines.flatMap((li, i) => [
      { lineItemId: li.id, stage: "supplier_po", enteredAt: days(14 - i) },
      { lineItemId: li.id, stage: "stamping", enteredAt: days(10 - i) },
      { lineItemId: li.id, stage: "edm", enteredAt: days(7 - i) },
      { lineItemId: li.id, stage: "polishing", enteredAt: days(4 - i) },
      ...(li.currentStage === "logo" ? [{ lineItemId: li.id, stage: "logo" as const, enteredAt: days(2 - i) }] : []),
    ]),
  );

  // Supplier line costs (multi-supplier) — distribute the cost across Northwind + Iron.
  await db.insert(productionSupplierLineCost).values(
    masterLines.flatMap((li) => [
      { poId: poMaster.id, supplierId: sNorthwind.id, lineItemId: li.id, unitCostCents: 700 },
      { poId: poMaster.id, supplierId: sIron.id, lineItemId: li.id, unitCostCents: 500 },
    ]),
  );

  // PO #2 — Single-supplier in-progress (Aspen restock)
  const [poAspen] = await db
    .insert(productionPo)
    .values({
      shopifyPoNumber: "00119",
      supplierId: sEpower.id,
      companyId: coAspen.id,
      status: "active",
      issuedDate: days(8).toISOString().slice(0, 10),
      expectedDeliveryDate: days(-14).toISOString().slice(0, 10),
      locationName: "Denver Warehouse",
      lockStagesTogether: true,
    })
    .returning();

  const aspenLines = await db
    .insert(productionPoLineItem)
    .values([
      {
        poId: poAspen.id,
        sku: "FWB001-SS-18",
        title: "Fitwell M1 Buckle — 18mm / 316L SS / Polished",
        quantity: 500,
        unitCostCents: 820,
        currentStage: "polishing",
      },
      {
        poId: poAspen.id,
        sku: "FWB001-SS-20",
        title: "Fitwell M1 Buckle — 20mm / 316L SS / Polished",
        quantity: 500,
        unitCostCents: 820,
        currentStage: "polishing",
      },
    ])
    .returning();

  await db.insert(productionStageEvent).values(
    aspenLines.flatMap((li) => [
      { lineItemId: li.id, stage: "supplier_po", enteredAt: days(8) },
      { lineItemId: li.id, stage: "stamping", enteredAt: days(5) },
      { lineItemId: li.id, stage: "edm", enteredAt: days(2) },
      { lineItemId: li.id, stage: "polishing", enteredAt: days(0) },
    ]),
  );

  // PO #3 — Draft (just raised)
  await db.insert(productionPo).values({
    shopifyPoNumber: "00120",
    supplierId: sNorthwind.id,
    companyId: coVega.id,
    status: "draft",
    issuedDate: today.toISOString().slice(0, 10),
    expectedDeliveryDate: days(-28).toISOString().slice(0, 10),
    locationName: "SF DC",
    lockStagesTogether: true,
  });

  // PO #4 — Complete, received
  const [poComplete] = await db
    .insert(productionPo)
    .values({
      shopifyPoNumber: "00115",
      supplierId: sEpower.id,
      companyId: coHartland.id,
      status: "complete",
      issuedDate: days(60).toISOString().slice(0, 10),
      expectedDeliveryDate: days(20).toISOString().slice(0, 10),
      locationName: "Boston DC",
      shopifyReceivedAt: days(15),
    })
    .returning();
  const completeLines = await db
    .insert(productionPoLineItem)
    .values([
      {
        poId: poComplete.id,
        sku: "FWB001-RG-20",
        title: "Fitwell M1 Buckle — 20mm / Rose Gold PVD",
        quantity: 100,
        unitCostCents: 1450,
        currentStage: "complete",
      },
    ])
    .returning();
  await db.insert(productionStageEvent).values(
    completeLines.flatMap((li) => [
      { lineItemId: li.id, stage: "supplier_po", enteredAt: days(60) },
      { lineItemId: li.id, stage: "stamping", enteredAt: days(55) },
      { lineItemId: li.id, stage: "edm", enteredAt: days(50) },
      { lineItemId: li.id, stage: "polishing", enteredAt: days(40) },
      { lineItemId: li.id, stage: "logo", enteredAt: days(35) },
      { lineItemId: li.id, stage: "plating", enteredAt: days(28) },
      { lineItemId: li.id, stage: "qc", enteredAt: days(22) },
      { lineItemId: li.id, stage: "packaging", enteredAt: days(18) },
      { lineItemId: li.id, stage: "complete", enteredAt: days(15) },
    ]),
  );

  // ── Invoices in different states ────────────────────────────────────
  // INV-00100: draft, 50% deposit (Aspen) — for the Payment-preview shot
  // Lines: 50@$40 + 100@$40 + 50@$40 = 200 × $40 = $8000 retail.
  // 30% partner discount: $8000 × 0.70 = $5600 total; deposit 50% = $2800.
  const [invAspenDraft] = await db
    .insert(invoice)
    .values({
      invoiceNumber: "INV-00100",
      companyId: coAspen.id,
      status: "draft",
      issuedDate: today.toISOString().slice(0, 10),
      dueDate: days(-21).toISOString().slice(0, 10),
      subtotalCents: 800000,
      discountPercent: 30,
      discountCents: 240000,
      totalCents: 560000,
      depositPercent: 50, // explicit override (also matches brand default)
      depositCents: 280000,
      notes: "Restock — please confirm artwork by Friday.",
    })
    .returning();
  await db.insert(invoiceLineItem).values([
    {
      invoiceId: invAspenDraft.id,
      sku: "FWB001-SS-18",
      title: "Fitwell M1 Buckle — 18mm / 316L SS / Polished",
      quantity: 50,
      unitPriceCents: 4000,
    },
    {
      invoiceId: invAspenDraft.id,
      sku: "FWB001-SS-20",
      title: "Fitwell M1 Buckle — 20mm / 316L SS / Polished",
      quantity: 100,
      unitPriceCents: 4000,
    },
    {
      invoiceId: invAspenDraft.id,
      sku: "FWB001-BL-16",
      title: "Fitwell M1 Buckle — 16mm / 316L SS / PVD Black",
      quantity: 50,
      unitPriceCents: 4000,
    },
  ]);

  // INV-00101: sent + deposit paid (Kestrel) — for the History + Linked PO tabs
  // Lines: 250@$48 + 200@$48 + 200@$48 = 650 × $48 = $31,200 retail.
  // 40% platinum discount: $18,720; deposit 50% = $9,360.
  const [invKestrel] = await db
    .insert(invoice)
    .values({
      invoiceNumber: "INV-00101",
      companyId: coKestrel.id,
      sourcePoId: poMaster.id,
      status: "partial",
      issuedDate: days(14).toISOString().slice(0, 10),
      dueDate: days(-21).toISOString().slice(0, 10),
      sentAt: days(13),
      depositPaidAt: days(12),
      subtotalCents: 3120000,
      discountPercent: 40,
      discountCents: 1248000,
      totalCents: 1872000,
      depositPercent: 50,
      depositCents: 936000,
      shopifyDraftOrderId: "gid://shopify/DraftOrder/sim-001",
      shopifyInvoiceUrl: "https://fitwell-buckles.myshopify.com/invoices/sim-deposit-001",
    })
    .returning();
  await db.insert(invoiceLineItem).values([
    {
      invoiceId: invKestrel.id,
      sku: "FWK-CO-BL-16",
      title: "Kestrel Co-brand Buckle — 16mm / 316L SS / PVD Black",
      quantity: 250,
      unitPriceCents: 4800,
    },
    {
      invoiceId: invKestrel.id,
      sku: "FWK-CO-BL-18",
      title: "Kestrel Co-brand Buckle — 18mm / 316L SS / PVD Black",
      quantity: 200,
      unitPriceCents: 4800,
    },
    {
      invoiceId: invKestrel.id,
      sku: "FWK-CO-BL-20",
      title: "Kestrel Co-brand Buckle — 20mm / 316L SS / PVD Black",
      quantity: 200,
      unitPriceCents: 4800,
    },
  ]);

  // INV-00102: paid in full (Hartland) — for the audit history
  // Lines: 100@$80 = $8000 retail. 20% retail-partner discount: $6,400.
  const [invHartland] = await db
    .insert(invoice)
    .values({
      invoiceNumber: "INV-00102",
      companyId: coHartland.id,
      sourcePoId: poComplete.id,
      status: "paid",
      issuedDate: days(45).toISOString().slice(0, 10),
      dueDate: days(15).toISOString().slice(0, 10),
      sentAt: days(45),
      fulfilledAt: days(18),
      paidAt: days(10),
      balancePaidAt: days(10),
      subtotalCents: 800000,
      discountPercent: 20,
      discountCents: 160000,
      totalCents: 640000,
      depositPercent: null,
      depositCents: 0,
    })
    .returning();
  await db.insert(invoiceLineItem).values({
    invoiceId: invHartland.id,
    sku: "FWB001-RG-20",
    title: "Fitwell M1 Buckle — 20mm / Rose Gold PVD",
    quantity: 100,
    unitPriceCents: 8000,
  });

  // INV-00103: void (Vega) — 50@$40 = $2000 retail. 30% = $1400 total.
  const [invVega] = await db
    .insert(invoice)
    .values({
      invoiceNumber: "INV-00103",
      companyId: coVega.id,
      status: "void",
      issuedDate: days(25).toISOString().slice(0, 10),
      sentAt: days(25),
      subtotalCents: 200000,
      discountPercent: 30,
      discountCents: 60000,
      totalCents: 140000,
      notes: "Voided — replaced by INV-00104.",
    })
    .returning();
  await db.insert(invoiceLineItem).values({
    invoiceId: invVega.id,
    sku: "FWB001-SS-20",
    title: "Fitwell M1 Buckle — 20mm / 316L SS / Polished",
    quantity: 50,
    unitPriceCents: 4000,
  });

  // INV-00104: sent, unpaid (Brunella — new customer)
  // Lines: 75@$40 = $3000 retail. 20% = $2400 total. 25% deposit = $600.
  const [invBrunella] = await db
    .insert(invoice)
    .values({
      invoiceNumber: "INV-00104",
      companyId: companies[4].id, // Brunella
      status: "sent",
      issuedDate: days(2).toISOString().slice(0, 10),
      dueDate: days(-28).toISOString().slice(0, 10),
      sentAt: days(2),
      subtotalCents: 300000,
      discountPercent: 20,
      discountCents: 60000,
      totalCents: 240000,
      depositPercent: 25,
      depositCents: 60000,
    })
    .returning();
  await db.insert(invoiceLineItem).values({
    invoiceId: invBrunella.id,
    sku: "FWB001-SS-18",
    title: "Fitwell M1 Buckle — 18mm / 316L SS / Polished",
    quantity: 75,
    unitPriceCents: 4000,
  });

  // ── Influencers + gifting orders ────────────────────────────────────
  const influencers = await db
    .insert(influencer)
    .values([
      {
        name: "Maya Ortega",
        handle: "@maya.wrist",
        platform: "instagram",
        notes: "Watch reviewer, daily-wear focus. ~84k followers.",
      },
      {
        name: "Cole Bennett",
        handle: "@coleonwatches",
        platform: "youtube",
        notes: "Long-form reviews. 12-15min videos. ~142k subs.",
      },
      {
        name: "Annika Lindberg",
        handle: "@annika.time",
        platform: "tiktok",
        notes: "Short-form, lifestyle. ~220k followers.",
      },
    ])
    .returning();

  const [iMaya, iCole, iAnnika] = influencers;

  const inflOrders = await db
    .insert(influencerOrder)
    .values([
      {
        orderNumber: "GIFT-00100",
        influencerId: iMaya.id,
        status: "sent",
        issuedDate: days(20).toISOString().slice(0, 10),
        subtotalCents: 8000,
        totalCents: 0,
        discountPercent: 100,
        discountCents: 8000,
        contentDueDate: days(-3).toISOString().slice(0, 10),
        publishedAt: days(1).toISOString().slice(0, 10),
        affiliateLink: "https://fitwellbuckle.co/?ref=maya",
        notes: "Gifted M1 set in 16/18/20mm.",
      },
      {
        orderNumber: "GIFT-00101",
        influencerId: iCole.id,
        status: "sent",
        issuedDate: days(15).toISOString().slice(0, 10),
        subtotalCents: 4000,
        totalCents: 0,
        discountPercent: 100,
        discountCents: 4000,
        contentDueDate: days(-10).toISOString().slice(0, 10),
        affiliateLink: null,
      },
      {
        orderNumber: "GIFT-00102",
        influencerId: iAnnika.id,
        status: "draft",
        issuedDate: today.toISOString().slice(0, 10),
        subtotalCents: 4000,
        totalCents: 0,
        discountPercent: 100,
        discountCents: 4000,
        contentDueDate: days(-21).toISOString().slice(0, 10),
      },
    ])
    .returning();

  await db.insert(influencerOrderLineItem).values([
    {
      orderId: inflOrders[0].id,
      sku: "FWB001-SS-18",
      title: "Fitwell M1 Buckle — 18mm Polished",
      quantity: 1,
      unitPriceCents: 0,
    },
    {
      orderId: inflOrders[0].id,
      sku: "FWB001-BL-20",
      title: "Fitwell M1 Buckle — 20mm PVD Black",
      quantity: 1,
      unitPriceCents: 0,
    },
    {
      orderId: inflOrders[1].id,
      sku: "FWB001-RG-20",
      title: "Fitwell M1 Buckle — 20mm Rose Gold",
      quantity: 1,
      unitPriceCents: 0,
    },
    {
      orderId: inflOrders[2].id,
      sku: "FWB001-SS-16",
      title: "Fitwell M1 Buckle — 16mm Polished",
      quantity: 1,
      unitPriceCents: 0,
    },
  ]);

  // ── Misc settings + notifications ───────────────────────────────────
  await db.insert(billingSettings).values({
    instructions:
      "Pay by wire / ACH:\n\n  Bank: Mountain Pacific Bank\n  Account: 8842-019-002\n  Routing: 121000358\n  Reference: invoice number\n\nFor questions, reply to this invoice email.",
  });

  await db.insert(adminNotification).values([
    {
      type: "stage_handoff",
      title: "Northwind Stamping completed their stage on PO 00118-A",
      body: "Kestrel Co-brand Buckle handed off from Northwind Stamping to Iron Crown Plating.",
      poId: poMaster.id,
      supplierId: sNorthwind.id,
    },
    {
      type: "note_for_admin",
      title: "EPower Manufacturing added a note on PO 00119",
      body: "Polishing done, moving to logo next week.",
      poId: poAspen.id,
      supplierId: sEpower.id,
    },
  ]);

  console.log(
    `✓ Seeded: ${customers.length} customers, ${companies.length} brands, ${suppliers.length} suppliers, ${orderRows.length} orders, 4 POs, 5 invoices, ${influencers.length} influencers`,
  );
}

async function main(): Promise<void> {
  assertNotProd();
  await wipe();
  await seedStageDefs();
  await seedData();
  console.log("\n✅ Reseed complete.");
}

main().catch((err) => {
  console.error("✗ Reseed failed:", err);
  process.exit(1);
});
