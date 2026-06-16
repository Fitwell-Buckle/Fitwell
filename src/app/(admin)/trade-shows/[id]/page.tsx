import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTradeShow, listVendors } from "@/lib/tradeshows/service";
import { VendorWorklist } from "./vendor-worklist";

export const metadata: Metadata = {
  title: "Trade Show | Fitwell Admin",
};

export default async function TradeShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const show = await getTradeShow(id);
  if (!show) notFound();

  const vendors = await listVendors(id);

  return (
    <VendorWorklist
      showId={show.id}
      showName={show.name}
      vendors={vendors.map((v) => ({
        id: v.id,
        booth: v.booth,
        companyName: v.companyName,
        category: v.category,
        side: v.side,
        priority: v.priority,
        visited: v.visited,
        followUpStatus: v.followUpStatus,
        hasCard: Boolean(v.cardImageUrl),
        leadId: v.leadId,
        supplierLeadId: v.supplierLeadId,
      }))}
    />
  );
}
