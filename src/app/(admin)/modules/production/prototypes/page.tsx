import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prototype, supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { PrototypeManager } from "./prototype-manager";

export const metadata: Metadata = {
  title: "Prototypes | Fitwell Admin",
};

export default async function PrototypesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [rows, suppliers] = await Promise.all([
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
  ]);

  return (
    <div>
      <PageHeader title="Prototypes" />
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Proposed SKUs in the sample phase. Track candidate vendors, request
        quotes, and each round of samples until a prototype is approved and
        promoted to a real product.
      </p>

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
