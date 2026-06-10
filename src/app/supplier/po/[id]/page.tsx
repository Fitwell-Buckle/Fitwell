import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  productionAttachment,
  productionComment,
  productionPo,
} from "@/lib/schema";
import { getPoDetail, getPoStageEstimates } from "@/lib/production/service";
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
import { ProductionTimeline } from "@/components/production/production-timeline";
import { buildPoTimeline } from "@/lib/production/timeline";
import { getStageEstimates } from "@/lib/production/cycle-time-data";

export default async function SupplierPoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await getSupplierScope();
  if (!scope) redirect("/external/login");

  const { id } = await params;
  const po = await getPoDetail(id);
  const [stageLabels, order, estimates] = await Promise.all([
    getStageLabels(),
    getStageOrder(),
    getStageEstimates(),
  ]);
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

  // ETA target rules:
  //   - Standalone PO (no children): edit the PO's own ETA.
  //   - Master PO (has children): each sub-PO carries its own ETA, so target
  //     the viewing supplier's sub-PO (the one Fitwell sent them, e.g.
  //     "00104-A"). Suppliers work the master scoped to their stages — see
  //     /supplier/page.tsx — so this is how a stage-owner's ETA lives.
  //   - Master without a sub-PO for this supplier (rare stage-only access):
  //     stay read-only; there's no row that's "theirs" to edit.
  const childPo = await db.query.productionPo.findFirst({
    where: eq(productionPo.parentPoId, po.id),
    columns: { id: true },
  });
  const mySubPo = childPo
    ? await db.query.productionPo.findFirst({
        where: and(
          eq(productionPo.parentPoId, po.id),
          eq(productionPo.supplierId, scope.supplierId),
        ),
        columns: { id: true, expectedDeliveryDate: true, poSuffix: true },
        // Pull the sub-PO's notes + documents AND its stage ETA targets
        // alongside so the timeline below can be scoped to the supplier's
        // own thread + targets (each sub-PO carries its own — distinct from
        // the master's and from the other suppliers').
        with: {
          stageEtas: { columns: { stage: true, targetEndDate: true } },
          comments: {
            orderBy: asc(productionComment.createdAt),
            with: {
              author: { columns: { name: true, email: true, role: true } },
            },
          },
          attachments: {
            orderBy: desc(productionAttachment.uploadedAt),
            with: {
              uploadedBy: { columns: { name: true, email: true, role: true } },
            },
          },
        },
      })
    : null;
  const totalCents = po.lineItems.reduce(
    (sum, li) => sum + (li.unitCostCents ?? 0) * li.quantity,
    0,
  );

  // Per-PO stage day overrides for THIS supplier's view: scoped to the
  // sub-PO when one exists, else the master / standalone. Saved via the
  // legend's click-to-edit on the timeline below.
  const perPoStageEstimates = await getPoStageEstimates(mySubPo?.id ?? po.id);

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
        {/* Show the supplier's OWN sub-PO suffix (e.g. "PO-00105-A") rather than
          *  the bare master number — the supplier dashboard links here with
          *  the master id (suppliers work the master scoped to their stages)
          *  but the supplier always saw their sub-PO number on the dashboard. */}
        <PageHeader
          title={formatPoNumber(po.shopifyPoNumber, {
            suffix: mySubPo?.poSuffix ?? po.poSuffix,
          })}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/supplier/po/${po.id}/print`}>Print / Save PDF</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/supplier">Back</Link>
          </Button>
        </div>
      </div>

      {/* Production-relevant fields only — no company / customer / price-tier.
        *  Expected delivery moved to the Line items table so the supplier can
        *  set independent ETAs per line (a 16mm rose-gold buckle may finish
        *  before a 22mm steel one of the same PO). */}
      <Card className="mt-6 p-6">
        <div className="grid grid-cols-3 gap-4 text-sm sm:grid-cols-3">
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
        </div>
        {po.notes && <p className="mt-4 text-sm text-zinc-600">{po.notes}</p>}
      </Card>

      <SupplierLineItems
        poId={po.id}
        totalCents={totalCents}
        ownedStages={ownedStages as string[]}
        stageOptions={stageOptions}
        // The packaging label is only meaningful for the supplier that
        // physically packages the product — surface the Label link only when
        // they own the packaging stage on this PO. The stage KEY ("packaging")
        // is stable even if its display label is renamed.
        canDownloadLabels={ownedStages.includes("packaging")}
        lineItems={sortedLineItems.map((li) => ({
          id: li.id,
          title: li.title,
          sku: li.sku,
          quantity: li.quantity,
          unitCost: fmtMoney(li.unitCostCents),
          currentStage: li.currentStage,
          expectedCompletionDate: li.expectedCompletionDate,
        }))}
      />

      {/* Supplier-scoped, read-only timeline: only the stages THIS supplier
        *  owns are visible. Each line's bar ends at ITS OWN
        *  expectedCompletionDate (the per-line ETA edited in the Line items
        *  table above) — different SKUs often have independent deadlines.
        *  The click-to-edit interaction on segments is removed; ETAs live in
        *  the Line items table where they're more discoverable. */}
      <ProductionTimeline
        pos={[
          {
            // Read-only id: the timeline doesn't write targets back any more.
            id: mySubPo?.id ?? po.id,
            shopifyPoNumber: po.shopifyPoNumber,
            supplier: po.supplier ? { name: po.supplier.name } : null,
            // PO-level seeded targets are the baseline; per-line overrides
            // (below in lineItems[].stageTargets) win per row.
            stageTargets: mySubPo?.stageEtas ?? po.stageEtas,
            stageEstimates: perPoStageEstimates,
            lineItems: sortedLineItems.map((li) => {
              const scopedStages = [
                ...ownedStages.filter(
                  (s) => !li.stages || li.stages.length === 0 || li.stages.includes(s),
                ),
                terminal,
              ];
              const lastOwned = scopedStages[scopedStages.length - 2]; // skip terminal
              return {
                id: li.id,
                sku: li.sku,
                title: li.title,
                currentStage: li.currentStage,
                // Walk only the supplier's owned stages (+ terminal so the
                // projector knows when to stop). Intersect with the line's
                // own subset so a spring-bar line that skips the supplier's
                // assigned stage stays empty rather than projecting through it.
                stages: scopedStages,
                // Per-line target override: if this line has an ETA, anchor
                // its LAST owned stage to that date. Other lines on the same
                // PO with different ETAs get their own anchors via the same
                // mechanism on their own row.
                stageTargets:
                  lastOwned && li.expectedCompletionDate
                    ? [
                        {
                          stage: lastOwned,
                          targetEndDate: li.expectedCompletionDate,
                        },
                      ]
                    : undefined,
                // Filter to the supplier's owned stages AND drop events for
                // stages later than the line's current stage. The second
                // filter hides orphan history from prior advance-then-move-
                // back testing.
                stageEvents: (() => {
                  const currentIdx = order.indexOf(li.currentStage);
                  return li.stageEvents
                    .filter((ev) => ownedStages.includes(ev.stage))
                    .filter((ev) => order.indexOf(ev.stage) <= currentIdx)
                    .map((ev) => ({
                      id: ev.id,
                      stage: ev.stage,
                      enteredAt: ev.enteredAt,
                      exitedAt: ev.exitedAt,
                    }));
                })(),
              };
            }),
          },
        ]}
        estimates={estimates}
        stageLabels={stageLabels}
        order={[...ownedStages, terminal]}
        estimateSaveRouteBase="/api/supplier/po"
      />

      <PoTimeline
        poId={mySubPo?.id ?? po.id}
        viewer="supplier"
        // When viewing a master, merge its thread (admin's broadcast to every
        // supplier) with the viewing supplier's own sub-PO thread (their
        // private back-and-forth). Posting still targets the sub-PO via
        // `poId` above — supplier replies stay scoped to that supplier.
        // Edit-history events are pulled from admin_notification (every
        // notifyPoUpdate writes a row) so the feed shows what changed,
        // who, and when — alongside the notes and documents.
        entries={buildPoTimeline(
          mySubPo ? [...po.comments, ...mySubPo.comments] : po.comments,
          mySubPo ? [...po.attachments, ...mySubPo.attachments] : po.attachments,
          await db
            .select({
              id: adminNotification.id,
              title: adminNotification.title,
              body: adminNotification.body,
              type: adminNotification.type,
              createdAt: adminNotification.createdAt,
            })
            .from(adminNotification)
            .where(
              inArray(
                adminNotification.poId,
                mySubPo ? [po.id, mySubPo.id] : [po.id],
              ),
            )
            .then((rows) =>
              rows
                .filter((r) =>
                  r.type === "update_for_admin" || r.type === "update_for_supplier",
                )
                .map((r) => ({
                  id: r.id,
                  title: r.title,
                  body: r.body ?? "",
                  type: r.type,
                  createdAt: r.createdAt,
                })),
            ),
        )}
      />
    </div>
  );
}
