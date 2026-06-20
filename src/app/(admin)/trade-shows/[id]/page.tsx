import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getTradeShow,
  listVendors,
  vendorContactCounts,
} from "@/lib/tradeshows/service";
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

  const [vendors, counts] = await Promise.all([
    listVendors(id),
    vendorContactCounts(id),
  ]);

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
        sampleGiven: v.sampleGiven,
        followUpStatus: v.followUpStatus,
        contactCount: counts[v.id] ?? 0,
        leadId: v.leadId,
        supplierLeadId: v.supplierLeadId,
      }))}
    />
  );
}
