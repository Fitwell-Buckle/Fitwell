import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTradeShow, listVendors } from "@/lib/tradeshows/service";
import { TriageTable } from "./triage-table";

export const metadata: Metadata = {
  title: "Triage | Fitwell Admin",
};

export default async function TradeShowTriagePage({
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
    <TriageTable
      showId={id}
      showName={show.name}
      vendors={vendors.map((v) => ({
        id: v.id,
        companyName: v.companyName,
        booth: v.booth,
        category: v.category,
        side: v.side,
        followUpTemp: v.followUpTemp,
        leadValue: v.leadValue,
        seedNotes: v.seedNotes,
        notes: v.notes,
      }))}
    />
  );
}
