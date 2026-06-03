import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPoDetail } from "@/lib/production/service";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { derivePoStage, terminalStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { supplierHasAnyStage, stagesOwnedBySupplier } from "@/lib/production/stage-owners";
import { subPoStageTargets } from "@/lib/production/service";
import { formatPoNumber } from "@/lib/production/sub-po";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
  fmtMoney,
  skuSize,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { SupplierLineItems } from "./supplier-line-items";
import { PoTimeline } from "@/components/production/po-timeline";
import { buildPoTimeline } from "@/lib/production/timeline";

export default async function SupplierPoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await getSupplierScope();
  if (!scope) redirect("/supplier/login");

  const { id } = await params;
  const po = await getPoDetail(id);
  const [stageLabels, order] = await Promise.all([getStageLabels(), getStageOrder()]);
  // Scope: a supplier may open a PO only if they're its primary supplier OR own
  // at least one of its stages.
  if (
    !po ||
    (po.supplierId !== scope.supplierId &&
      !supplierHasAnyStage(order, po.stageAssignments, po.supplierId, scope.supplierId))
  ) {
    notFound();
  }

  const derivedStage = derivePoStage(po.lineItems.map((li) => li.currentStage));
  const sortedLineItems = [...po.lineItems].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
  const totalCents = po.lineItems.reduce(
    (sum, li) => sum + (li.unitCostCents ?? 0) * li.quantity,
    0,
  );

  // The stages this supplier owns + the handoff target, for the stage dropdown.
  // Exclude the terminal stage (e.g. "Complete"): it's the done-state, not a
  // workable stage, and it has no explicit assignment so it would otherwise
  // fall back to the primary supplier and show up as a duplicate "Complete"
  // (alongside the relabeled handoff target). The handoff target after the
  // supplier's last work stage already renders as "Complete".
  const terminal = terminalStage(order);
  const ownedStages = stagesOwnedBySupplier(
    order,
    po.stageAssignments,
    po.supplierId,
    scope.supplierId,
  ).filter((s) => s !== terminal);
  // Suppliers see only their own work stages + a single "Complete" (hand off to
  // the next team) — never the next team's stage name or the kickoff state.
  const stageOptions = subPoStageTargets(order, ownedStages)
    .filter((s) => s !== order[0])
    .map((s) => ({
      value: s as string,
      label: ownedStages.includes(s) ? stageLabels[s] : "Complete",
    }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix })} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/supplier">Back</Link>
        </Button>
      </div>

      {/* Production-relevant fields only — no company / customer / price-tier. */}
      <Card className="mt-6 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-zinc-400">Stage</div>
            <div className="mt-1">
              {derivedStage ? (
                <Badge className={cn(stageBadgeClass(derivedStage))}>
                  {derivedStage === "mixed" ? "Mixed" : stageLabels[derivedStage]}
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
            <div className="text-xs text-zinc-400">Issued</div>
            <div className="mt-1 text-zinc-700">{fmtDate(po.issuedDate)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Expected delivery</div>
            <div className="mt-1 text-zinc-700">{fmtDate(po.expectedDeliveryDate)}</div>
          </div>
        </div>
        {po.notes && <p className="mt-4 text-sm text-zinc-600">{po.notes}</p>}
      </Card>

      <SupplierLineItems
        poId={po.id}
        totalCents={totalCents}
        ownedStages={ownedStages as string[]}
        stageOptions={stageOptions}
        lineItems={sortedLineItems.map((li) => ({
          id: li.id,
          title: li.title,
          sku: li.sku,
          quantity: li.quantity,
          unitCost: fmtMoney(li.unitCostCents),
          currentStage: li.currentStage,
        }))}
      />

      <Card className="mt-5 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Stage timeline</h2>
        <div className="mt-4 space-y-4">
          {sortedLineItems.map((li) => (
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
                    {stageLabels[ev.stage]}
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

      <PoTimeline
        poId={po.id}
        viewer="supplier"
        entries={buildPoTimeline(po.comments, po.attachments)}
      />
    </div>
  );
}
