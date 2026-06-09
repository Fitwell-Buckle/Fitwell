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
import { sql, sum, count, and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCatalogCached } from "@/lib/catalog/load";
import { parseDateRange } from "@/lib/date-range";

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
  // Sales totals bound by the shared header date picker; Incoming + catalog
  // are "now" state and stay un-filtered.
  const { from, to } = parseDateRange(await searchParams);

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

  const title = variant
    ? variant.variantTitle
      ? `${variant.title} — ${variant.variantTitle}`
      : variant.title
    : salesRow?.title ?? sku;
  const incoming = Number(incomingRow?.qty ?? 0);
  const unitsSold = Number(salesRow?.unitsSold ?? 0);
  const orderCount = Number(salesRow?.orderCount ?? 0);
  const revenue = Number(salesRow?.revenue ?? 0);

  return (
    <div>
      <PageHeader title={title} />

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

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Incoming" value={incoming.toLocaleString("en-US")} />
        <Stat label="Units sold" value={unitsSold.toLocaleString("en-US")} />
        <Stat label="Orders" value={orderCount.toLocaleString("en-US")} />
        <Stat label="Revenue" value={fmtMoney(revenue)} />
      </div>

      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Packaging label
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Print-ready 4 × 5″ artwork with the SKU, title, and Code 128
              barcode.
            </p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 font-mono text-lg text-zinc-900">{value}</div>
    </Card>
  );
}
