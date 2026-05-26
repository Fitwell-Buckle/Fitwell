import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listInfluencerOrders } from "@/lib/influencer/service";
import { parseDateRange } from "@/lib/date-range";
import { ListFilters } from "@/components/catalog/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InfluencerTrackingTable } from "./tracking-table";

export const metadata: Metadata = {
  title: "Influencer Orders | Fitwell Admin",
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
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const orders = await listInfluencerOrders();

  const rows = orders
    .filter((o) => o.issuedDate >= fromStr && o.issuedDate <= toStr)
    .filter((o) => skuSet.size === 0 || o.lineItems.some((l) => skuSet.has(l.sku)))
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
        <PageHeader title="Influencer Orders" />
        <Button asChild>
          <Link href="/influencer-tracking/new">New gifting order</Link>
        </Button>
      </div>

      <ListFilters />

      <InfluencerTrackingTable rows={rows} today={today} />
    </div>
  );
}
