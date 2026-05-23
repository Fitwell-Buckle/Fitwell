import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPoDetail } from "@/lib/production/service";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { STAGE_LABELS, derivePoStage } from "@/lib/production/stages";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { PoControls } from "./po-controls";

export const metadata: Metadata = {
  title: "Production PO | Fitwell Admin",
};

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const po = await getPoDetail(id);
  if (!po) notFound();

  const derivedStage = derivePoStage(po.lineItems.map((li) => li.currentStage));

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={`PO ${po.shopifyPoNumber}`} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/modules/production">Back</Link>
        </Button>
      </div>

      <Card className="mt-6 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-zinc-400">Supplier</div>
            <div className="mt-1 font-medium text-zinc-900">
              {po.supplier?.name ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Stage</div>
            <div className="mt-1">
              {derivedStage ? (
                <Badge className={cn(stageBadgeClass(derivedStage))}>
                  {derivedStage === "mixed" ? "Mixed" : STAGE_LABELS[derivedStage]}
                </Badge>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Status</div>
            <div className="mt-1">
              <Badge className={cn(statusBadgeClass(po.status))}>
                {STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ?? po.status}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Expected delivery</div>
            <div className="mt-1 text-zinc-700">{fmtDate(po.expectedDeliveryDate)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Issued</div>
            <div className="mt-1 text-zinc-700">{fmtDate(po.issuedDate)}</div>
          </div>
        </div>
        {po.notes && <p className="mt-4 text-sm text-zinc-600">{po.notes}</p>}
      </Card>

      <PoControls
        poId={po.id}
        status={po.status}
        lockStagesTogether={po.lockStagesTogether}
        lineItems={po.lineItems.map((li) => ({
          id: li.id,
          title: li.title,
          sku: li.sku,
          quantity: li.quantity,
          unitCost: fmtMoney(li.unitCostCents),
          currentStage: li.currentStage,
          customerName: li.customer
            ? `${li.customer.firstName ?? ""} ${li.customer.lastName ?? ""}`.trim() ||
              null
            : null,
          expectedCompletionDate: li.expectedCompletionDate,
        }))}
      />

      <Card className="mt-5 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Stage timeline</h2>
        <div className="mt-4 space-y-4">
          {po.lineItems.map((li) => (
            <div key={li.id}>
              <div className="text-xs font-medium text-zinc-500">
                {li.sku} — {li.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {li.stageEvents.map((ev) => (
                  <span
                    key={ev.id}
                    className="text-xs text-zinc-500"
                    title={ev.enteredAt?.toLocaleString("en-US")}
                  >
                    {STAGE_LABELS[ev.stage]}
                    <span className="ml-1 text-zinc-400">
                      {ev.enteredAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {" ›"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
