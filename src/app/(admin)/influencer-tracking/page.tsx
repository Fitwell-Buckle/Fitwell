import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listInfluencerOrders } from "@/lib/influencer/service";
import { parseDateRange } from "@/lib/date-range";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  catalogSkusMatching,
  makeCollectionLookup,
  type CatalogVariant,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InfluencerTrackingTable } from "./tracking-table";

export const metadata: Metadata = {
  title: "Influencer Tracking | Fitwell Admin",
};

export default async function InfluencerTrackingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const collectionParam = typeof params.collection === "string" ? params.collection : "";
  const sizeParam = typeof params.size === "string" ? params.size : "";
  const colorParam = typeof params.color === "string" ? params.color : "";
  const materialParam = typeof params.material === "string" ? params.material : "";

  let catalog: CatalogVariant[] = [];
  let groups: CatalogCollectionGroup[] = [];
  const orders = await listInfluencerOrders();
  try {
    [catalog, groups] = await Promise.all([getCatalogCached(), getCatalogGroupsCached()]);
  } catch {
    /* filters degrade gracefully when Shopify is unavailable */
  }

  const { options: collectionOptions } = makeCollectionLookup(groups);
  const sizeOptions = [
    ...new Set(catalog.map((v) => v.sizeMm).filter((s): s is number => s != null)),
  ].sort((a, b) => a - b);
  const colorOptions = [
    ...new Set(catalog.map((v) => v.color).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b));
  const materialOptions = [
    ...new Set(catalog.map((v) => v.material).filter((m): m is string => !!m)),
  ].sort((a, b) => a.localeCompare(b));
  const matchingSkus = catalogSkusMatching(catalog, groups, {
    collection: collectionParam,
    size: sizeParam,
    color: colorParam,
    material: materialParam,
  });
  const matchSet = matchingSkus ? new Set(matchingSkus) : null;

  const rows = orders
    .filter((o) => o.issuedDate >= fromStr && o.issuedDate <= toStr)
    .filter((o) => !matchSet || o.lineItems.some((l) => matchSet.has(l.sku)))
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      influencerName: o.influencer?.name ?? "—",
      influencerHandle: o.influencer?.handle ?? null,
      issuedDate: o.issuedDate,
      contentDueDate: o.contentDueDate,
      publishedAt: o.publishedAt,
      affiliateLink: o.affiliateLink,
      status: o.status,
      subtotalCents: o.subtotalCents,
    }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Influencer Tracking" />
        <Button asChild>
          <Link href="/influencer-tracking/new">New gifting order</Link>
        </Button>
      </div>

      <CatalogFilters
        collections={collectionOptions}
        collection={collectionParam}
        sizeOptions={sizeOptions}
        size={sizeParam}
        colorOptions={colorOptions}
        color={colorParam}
        materialOptions={materialOptions}
        material={materialParam}
      />

      <InfluencerTrackingTable rows={rows} today={today} />
    </div>
  );
}
