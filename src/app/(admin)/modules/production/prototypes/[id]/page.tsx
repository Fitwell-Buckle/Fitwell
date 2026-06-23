import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { getPrototypeDetail } from "@/lib/prototypes/service";
import { PageHeader } from "@/components/ui/page-header";
import { PrototypeDetailView } from "./prototype-detail-view";

export const metadata: Metadata = {
  title: "Prototype | Fitwell Admin",
};

export default async function PrototypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const [proto, suppliers] = await Promise.all([
    getPrototypeDetail(id),
    db.query.supplier.findMany({
      columns: { id: true, name: true },
      orderBy: asc(supplier.name),
    }),
  ]);
  if (!proto) notFound();

  return (
    <div>
      <PageHeader title={proto.name} />
      <PrototypeDetailView
        prototype={{
          id: proto.id,
          name: proto.name,
          proposedSku: proto.proposedSku,
          finalSku: proto.finalSku,
          supplierId: proto.supplierId,
          status: proto.status,
          description: proto.description,
          estUnitCostCents: proto.estUnitCostCents,
          notes: proto.notes,
          approvedAt: proto.approvedAt ? proto.approvedAt.toISOString() : null,
          attachments: proto.attachments.map((a) => ({
            id: a.id,
            blobUrl: a.blobUrl,
            filename: a.filename,
            sizeBytes: a.sizeBytes,
          })),
          references: proto.references.map((r) => ({
            id: r.id,
            url: r.url,
            embedUrl: r.embedUrl,
            title: r.title,
          })),
          rounds: proto.rounds.map((r) => ({
            id: r.id,
            roundNumber: r.roundNumber,
            status: r.status,
            requestedAt: r.requestedAt,
            expectedAt: r.expectedAt,
            receivedAt: r.receivedAt,
            sampleQty: r.sampleQty,
            unitCostCents: r.unitCostCents,
            feedback: r.feedback,
            attachments: r.attachments.map((a) => ({
              id: a.id,
              blobUrl: a.blobUrl,
              filename: a.filename,
              sizeBytes: a.sizeBytes,
            })),
          })),
        }}
        suppliers={suppliers}
      />
    </div>
  );
}
