import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getVendor } from "@/lib/tradeshows/service";
import { VendorDetail } from "./vendor-detail";

export const metadata: Metadata = {
  title: "Vendor | Fitwell Admin",
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string; vendorId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id, vendorId } = await params;
  const vendor = await getVendor(vendorId);
  if (!vendor || vendor.tradeShowId !== id) notFound();

  return (
    <VendorDetail
      showId={id}
      showName={vendor.tradeShow?.name ?? "Trade Show"}
      vendor={{
        id: vendor.id,
        booth: vendor.booth,
        companyName: vendor.companyName,
        category: vendor.category,
        side: vendor.side,
        priority: vendor.priority,
        visited: vendor.visited,
        contactName: vendor.contactName,
        title: vendor.title,
        email: vendor.email,
        phone: vendor.phone,
        website: vendor.website,
        notes: vendor.notes,
        nextSteps: vendor.nextSteps,
        followUpStatus: vendor.followUpStatus,
        cardImageUrl: vendor.cardImageUrl,
        seedNotes: vendor.seedNotes,
        responseRaw: vendor.responseRaw,
        meetingRaw: vendor.meetingRaw,
        leadId: vendor.leadId,
        supplierLeadId: vendor.supplierLeadId,
      }}
      voiceNotes={(vendor.voiceNotes ?? []).map((n) => ({
        id: n.id,
        blobUrl: n.blobUrl,
        transcript: n.transcript,
        durationSec: n.durationSec,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
