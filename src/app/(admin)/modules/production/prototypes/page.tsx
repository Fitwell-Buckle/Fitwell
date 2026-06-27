import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prototype, supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { PrototypeManager } from "./prototype-manager";
import { ProductIdeasManager } from "./product-ideas-manager";
import { listIdeas } from "@/lib/product-ideas/service";

export const metadata: Metadata = {
  title: "Road Map & Prototypes | Fitwell Admin",
};

export default async function PrototypesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [rows, suppliers, ideas] = await Promise.all([
    db.query.prototype.findMany({
      orderBy: desc(prototype.updatedAt),
      with: {
        supplier: { columns: { id: true, name: true } },
        candidateVendors: {
          with: { supplier: { columns: { id: true, name: true } } },
        },
        rounds: { columns: { id: true, roundNumber: true } },
      },
    }),
    db.query.supplier.findMany({
      columns: { id: true, name: true },
      orderBy: asc(supplier.name),
    }),
    listIdeas(),
  ]);

  return (
    <div>
      <PageHeader title="Road Map & Prototypes" />
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Capture rough product ideas, score and vet them, then promote the strong
        ones to prototypes — through sampling, vendor quotes, and approval into a
        real product.
      </p>

      <div className="mt-6">
        <ProductIdeasManager
          ideas={ideas.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            status: i.status,
            impact: i.impact,
            confidence: i.confidence,
            ease: i.ease,
            notes: i.notes,
            fusionUrl: i.fusionUrl,
            fusionEmbedUrl: i.fusionEmbedUrl,
            promotedPrototypeId: i.promotedPrototypeId,
            promotedPrototypeName: i.promotedPrototype?.name ?? null,
            createdAtMs: i.createdAt ? i.createdAt.getTime() : 0,
          }))}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">Prototypes</h2>
      <PrototypeManager
        prototypes={rows.map((p) => ({
          id: p.id,
          name: p.name,
          proposedSku: p.proposedSku,
          finalSku: p.finalSku,
          status: p.status,
          supplierId: p.supplierId,
          supplierName: p.supplier?.name ?? null,
          vendors: p.candidateVendors
            .map((cv) => cv.supplier)
            .filter((s): s is { id: string; name: string } => !!s),
          roundCount: p.rounds.length,
          updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
        }))}
        suppliers={suppliers}
      />
    </div>
  );
}
