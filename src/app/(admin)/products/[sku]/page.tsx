import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  order,
  orderLineItem,
  productionPoLineItem,
  productionPo,
} from "@/lib/schema";
import {
  sql,
  sum,
  count,
  and,
  eq,
  gte,
  isNull,
  isNotNull,
  lt,
  lte,
  ne,
  type AnyColumn,
} from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCatalogCached } from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import { parseDateRange } from "@/lib/date-range";
import { STORE_TZ } from "@/lib/timezone";
import {
  dateToBucketKey,
  generateBucketKeys,
  formatBucketLabel,
} from "@/lib/chart-utils";
import { MetricCard } from "@/components/charts/metric-card";
import type { MetricPoint } from "@/components/charts/metric-sparkline";
import { getProductCadModel, listReadyCadModels } from "@/lib/cad/products";
import { matchFinish } from "@/lib/cad/finishes";
import { ProductCadModelCard } from "./product-cad-model";
import { DashboardViewToggle } from "../../dashboard/view-toggle";

export const metadata: Metadata = {
  title: "Product | Fitwell Admin",
};

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);
  // Sales totals bound by the shared header date picker; the On hand + Incoming
  // tiles show "now" state and stay un-filtered. The graph view reconstructs a
  // running curve for each metric across the selected window.
  const sp = await searchParams;
  const { from, to, granularity } = parseDateRange(sp);
  const isGraph = sp.view === "graph";

  // Bucket a timestamp column by the store day/week/month, matching the
  // dashboard so trend lines line up with Shopify's store-local reporting.
  const bucketOf = (col: AnyColumn) =>
    granularity === "day"
      ? sql`date_trunc('day', (${col} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
      : granularity === "week"
        ? sql`date_trunc('week', (${col} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
        : sql`date_trunc('month', (${col} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`;

  // Find the variant in the cached Shopify catalog. If it isn't in the catalog
  // (e.g. archived), fall back to whatever the sales rows tell us so historic
  // SKUs still resolve.
  const catalog = await getCatalogCached();
  const variant = catalog.find((v) => v.sku === sku);

  // Sales aggregate for just this SKU, bounded by date range.
  const [salesRow] = await db
    .select({
      title: orderLineItem.title,
      unitsSold: sum(orderLineItem.quantity).mapWith(Number),
      orderCount: count(sql`DISTINCT ${orderLineItem.orderId}`),
      revenue: sql<number>`coalesce(sum(${orderLineItem.price} * ${orderLineItem.quantity}), 0)::int`,
    })
    .from(orderLineItem)
    .innerJoin(order, eq(order.id, orderLineItem.orderId))
    .where(
      and(
        eq(orderLineItem.sku, sku),
        gte(order.processedAt, from),
        lte(order.processedAt, to),
      ),
    )
    .groupBy(orderLineItem.title)
    .orderBy(sql`sum(${orderLineItem.quantity}) desc`)
    .limit(1);

  if (!variant && !salesRow) notFound();

  // Incoming = produced-but-not-yet-received units for this SKU.
  const [incomingRow] = await db
    .select({
      qty: sum(productionPoLineItem.quantity).mapWith(Number),
    })
    .from(productionPoLineItem)
    .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
    .where(
      and(
        eq(productionPoLineItem.sku, sku),
        isNull(productionPoLineItem.shopifyReceivedAt),
        ne(productionPo.status, "cancelled"),
      ),
    );

  const notCancelled = ne(productionPo.status, "cancelled");

  const [
    readyModels,
    cadLink,
    salesByBucket,
    recvByBucket,
    createdByBucket,
    [soldBeforeRow],
    [recvBeforeRow],
    [createdBeforeRow],
    [recvAllRow],
    [soldAllRow],
  ] = await Promise.all([
    listReadyCadModels(),
    getProductCadModel(sku),
    // Per-bucket sales flow (units / orders / revenue) within the window.
    db
      .select({
        bucket: bucketOf(order.processedAt),
        units: sum(orderLineItem.quantity).mapWith(Number),
        orders: count(sql`DISTINCT ${orderLineItem.orderId}`),
        revenue: sql<number>`coalesce(sum(${orderLineItem.price} * ${orderLineItem.quantity}), 0)::int`,
      })
      .from(orderLineItem)
      .innerJoin(order, eq(order.id, orderLineItem.orderId))
      .where(
        and(
          eq(orderLineItem.sku, sku),
          gte(order.processedAt, from),
          lte(order.processedAt, to),
        ),
      )
      .groupBy(bucketOf(order.processedAt)),
    // Units received into stock per bucket (production receipts).
    db
      .select({
        bucket: bucketOf(productionPoLineItem.shopifyReceivedAt),
        qty: sum(productionPoLineItem.quantity).mapWith(Number),
      })
      .from(productionPoLineItem)
      .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
      .where(
        and(
          eq(productionPoLineItem.sku, sku),
          isNotNull(productionPoLineItem.shopifyReceivedAt),
          gte(productionPoLineItem.shopifyReceivedAt, from),
          lte(productionPoLineItem.shopifyReceivedAt, to),
          notCancelled,
        ),
      )
      .groupBy(bucketOf(productionPoLineItem.shopifyReceivedAt)),
    // Units that entered production (became "incoming") per bucket.
    db
      .select({
        bucket: bucketOf(productionPoLineItem.createdAt),
        qty: sum(productionPoLineItem.quantity).mapWith(Number),
      })
      .from(productionPoLineItem)
      .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
      .where(
        and(
          eq(productionPoLineItem.sku, sku),
          gte(productionPoLineItem.createdAt, from),
          lte(productionPoLineItem.createdAt, to),
          notCancelled,
        ),
      )
      .groupBy(bucketOf(productionPoLineItem.createdAt)),
    // Baselines before the window, so the running curves start at the right
    // level instead of from zero.
    db
      .select({ q: sum(orderLineItem.quantity).mapWith(Number) })
      .from(orderLineItem)
      .innerJoin(order, eq(order.id, orderLineItem.orderId))
      .where(and(eq(orderLineItem.sku, sku), lt(order.processedAt, from))),
    db
      .select({ q: sum(productionPoLineItem.quantity).mapWith(Number) })
      .from(productionPoLineItem)
      .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
      .where(
        and(
          eq(productionPoLineItem.sku, sku),
          isNotNull(productionPoLineItem.shopifyReceivedAt),
          lt(productionPoLineItem.shopifyReceivedAt, from),
          notCancelled,
        ),
      ),
    db
      .select({ q: sum(productionPoLineItem.quantity).mapWith(Number) })
      .from(productionPoLineItem)
      .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
      .where(
        and(
          eq(productionPoLineItem.sku, sku),
          lt(productionPoLineItem.createdAt, from),
          notCancelled,
        ),
      ),
    // Lifetime received vs. sold → current On hand (un-filtered, "now" state,
    // like Incoming). On hand = total received into stock − total sold.
    db
      .select({ q: sum(productionPoLineItem.quantity).mapWith(Number) })
      .from(productionPoLineItem)
      .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
      .where(
        and(
          eq(productionPoLineItem.sku, sku),
          isNotNull(productionPoLineItem.shopifyReceivedAt),
          notCancelled,
        ),
      ),
    db
      .select({ q: sum(orderLineItem.quantity).mapWith(Number) })
      .from(orderLineItem)
      .where(eq(orderLineItem.sku, sku)),
  ]);

  const title = variant
    ? variant.variantTitle
      ? `${variant.title} — ${variant.variantTitle}`
      : variant.title
    : salesRow?.title ?? sku;
  const incoming = Number(incomingRow?.qty ?? 0);
  // On hand = Shopify's live inventory for this variant. Fall back to the
  // receipts−sales reconstruction only if inventory isn't tracked there or
  // Shopify is unreachable, so the tile never breaks.
  const reconstructedOnHand =
    Number(recvAllRow?.q ?? 0) - Number(soldAllRow?.q ?? 0);
  let onHandNow = reconstructedOnHand;
  if (variant?.shopifyVariantId) {
    try {
      const live = await getShopifyClient().getVariantInventoryQuantity(
        variant.shopifyVariantId,
      );
      if (live != null) onHandNow = live;
    } catch (err) {
      console.error("Live inventory fetch failed; using reconstruction:", err);
    }
  }

  // Build zero-filled, per-bucket series. Units/orders/revenue are flows; On
  // hand and Incoming are running levels (received−sold, created−received)
  // carried forward from the pre-window baseline.
  const keyOf = (b: unknown) =>
    dateToBucketKey(new Date(b as string), granularity);
  const salesMap = new Map(salesByBucket.map((r) => [keyOf(r.bucket), r]));
  const recvMap = new Map(
    recvByBucket.map((r) => [keyOf(r.bucket), Number(r.qty ?? 0)]),
  );
  const createdMap = new Map(
    createdByBucket.map((r) => [keyOf(r.bucket), Number(r.qty ?? 0)]),
  );

  let onHand =
    Number(recvBeforeRow?.q ?? 0) - Number(soldBeforeRow?.q ?? 0);
  let incomingLevel =
    Number(createdBeforeRow?.q ?? 0) - Number(recvBeforeRow?.q ?? 0);
  const onHandSeries: MetricPoint[] = [];
  const incomingSeries: MetricPoint[] = [];
  const unitsSeries: MetricPoint[] = [];
  const ordersSeries: MetricPoint[] = [];
  const revenueSeries: MetricPoint[] = [];
  let unitsSold = 0;
  let orderCount = 0;
  let revenue = 0;
  for (const key of generateBucketKeys(from, to, granularity)) {
    const s = salesMap.get(key);
    const soldB = Number(s?.units ?? 0);
    const ordB = Number(s?.orders ?? 0);
    const revB = Number(s?.revenue ?? 0);
    const recvB = recvMap.get(key) ?? 0;
    const createdB = createdMap.get(key) ?? 0;
    onHand += recvB - soldB;
    incomingLevel += createdB - recvB;
    const label = formatBucketLabel(key, granularity);
    onHandSeries.push({ label, value: onHand });
    incomingSeries.push({ label, value: incomingLevel });
    unitsSeries.push({ label, value: soldB });
    ordersSeries.push({ label, value: ordB });
    revenueSeries.push({ label, value: revB });
    unitsSold += soldB;
    orderCount += ordB;
    revenue += revB;
  }

  // Anchor the On hand curve to Shopify's live number: the received−sold flow
  // gives the curve's *shape*, but the live value gives its absolute *level*.
  // Shift the whole series so its final point equals on-hand now (the constant
  // offset cancels the POS-derived baseline, which was the source of impossible
  // negative levels). Assumes the window ends ~now — true for Today/7d/30d/YTD.
  if (onHandSeries.length > 0) {
    const shift = onHandNow - onHandSeries[onHandSeries.length - 1].value;
    if (shift !== 0) for (const p of onHandSeries) p.value += shift;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={title} />
        {/* Table (numbers) vs graph (per-tile line charts) — same toggle as the
            dashboard, driving the `view` URL param. */}
        <DashboardViewToggle />
      </div>

      <Card className="mt-6 p-6">
        <div className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-zinc-400">SKU</div>
            <div className="mt-1 font-mono text-zinc-900">{sku}</div>
          </div>
          {variant?.sizeMm != null && (
            <div>
              <div className="text-xs text-zinc-400">Size</div>
              <div className="mt-1 text-zinc-900">{variant.sizeMm}mm</div>
            </div>
          )}
          {variant?.material && (
            <div>
              <div className="text-xs text-zinc-400">Material</div>
              <div className="mt-1 text-zinc-900">{variant.material}</div>
            </div>
          )}
          {variant?.color && (
            <div>
              <div className="text-xs text-zinc-400">Color</div>
              <div className="mt-1 text-zinc-900">{variant.color}</div>
            </div>
          )}
          {variant && (
            <div>
              <div className="text-xs text-zinc-400">Shopify price</div>
              <div className="mt-1 text-zinc-900">
                {fmtMoney(variant.priceCents)}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="On hand"
          value={onHandNow.toLocaleString("en-US")}
          graph={isGraph}
          series={onHandSeries}
          seriesFormat="number"
        />
        <MetricCard
          label="Incoming"
          value={incoming.toLocaleString("en-US")}
          graph={isGraph}
          series={incomingSeries}
          seriesFormat="number"
        />
        <MetricCard
          label="Units sold"
          value={unitsSold.toLocaleString("en-US")}
          graph={isGraph}
          series={unitsSeries}
          seriesFormat="number"
        />
        <MetricCard
          label="Orders"
          value={orderCount.toLocaleString("en-US")}
          graph={isGraph}
          series={ordersSeries}
          seriesFormat="number"
        />
        <MetricCard
          label="Revenue"
          value={fmtMoney(revenue)}
          graph={isGraph}
          series={revenueSeries}
          seriesFormat="currency"
        />
      </div>

      <ProductCadModelCard
        sku={sku}
        readyModels={readyModels.map((m) => ({
          id: m.id,
          name: m.name,
          glbUrl: m.glbUrl,
        }))}
        initialCadModelId={cadLink?.cadModelId ?? null}
        shopifyPublishedAt={
          cadLink?.shopifyPublishedAt
            ? cadLink.shopifyPublishedAt.toISOString()
            : null
        }
        defaultFinishId={
          matchFinish([variant?.color, title].filter(Boolean).join(" "))?.id ??
          null
        }
      />

      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
              Packaging label
              <InfoTooltip>
                Print-ready 4 × 5″ artwork with the SKU, title, and Code 128
                barcode.
              </InfoTooltip>
            </h2>
          </div>
          <Button asChild size="sm">
            <Link
              href={`/products/${encodeURIComponent(sku)}/label`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open label
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
