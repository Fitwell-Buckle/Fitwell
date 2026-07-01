import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import {
  getPoDetail,
  getPoStageEstimates,
  getSubPos,
  getSupplierLineCosts,
} from "@/lib/production/service";
import { invoiceForPo } from "@/lib/invoicing/service";
import { PageHeader } from "@/components/ui/page-header";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { nextStage, derivePoStage, isTerminal, terminalStage, type ProductionStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { formatPoNumber, planSubPos, subPoStageState } from "@/lib/production/sub-po";
import { stagesOwnedBySupplier } from "@/lib/production/stage-owners";
import { getCatalogCached, makeLineAttrs } from "@/lib/catalog/load";
import { usesRawBlankSummary, summarizeRawBlanks } from "@/lib/production/raw-blank";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
  fmtMoney,
  skuSize,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { PoControls } from "./po-controls";
import { PoReceive } from "./po-receive";
import { PoCreateInvoice } from "./po-create-invoice";
import { SubPoCovers, type SubPoCoverRow } from "./sub-po-covers";
import { PoSentControl } from "./po-sent-control";
import { PoTimeline } from "@/components/production/po-timeline";
import { ProductionTimeline } from "@/components/production/production-timeline";
import { buildPoTimeline } from "@/lib/production/timeline";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { DeleteButton } from "@/components/ui/delete-button";

export const metadata: Metadata = {
  title: "Production PO | Fitwell Admin",
};

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
  const [stageLabels, order, estimates, perPoStageEstimates] = await Promise.all([
    getStageLabels(),
    getStageOrder(),
    getStageEstimates(),
    getPoStageEstimates(id),
  ]);
  const workStages = order.slice(0, -1);

  // Multi-supplier framing: a PO with sub-POs is a master; a PO with a parent
  // is a sub-PO. The per-supplier stage split comes from the master's
  // stage→supplier assignments.
  const subPos = await getSubPos(po.id);
  const isMaster = subPos.length > 0;
  const isSubPo = !!po.parentPoId;

  // Edit-history events for the activity feed. On a master, include the
  // master's events PLUS each sub-PO's (so the admin sees the full picture);
  // on a sub-PO or standalone, just its own.
  const activityPoIds = isMaster
    ? [po.id, ...subPos.map((s) => s.id)]
    : [po.id];
  const events = await db
    .select({
      id: adminNotification.id,
      title: adminNotification.title,
      body: adminNotification.body,
      type: adminNotification.type,
      createdAt: adminNotification.createdAt,
    })
    .from(adminNotification)
    .where(inArray(adminNotification.poId, activityPoIds))
    .then((rows) =>
      rows
        .filter(
          (r) =>
            r.type === "update_for_admin" || r.type === "update_for_supplier",
        )
        .map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body ?? "",
          type: r.type,
          createdAt: r.createdAt,
        })),
    );

  // Master's ETA is locked/derived = the latest across its sub-POs (each
  // One invoice per PO — if it's already been invoiced, link to it instead.
  const existingInvoice = isSubPo ? null : await invoiceForPo(po.id);
  const plan = isMaster ? planSubPos(order, workStages, po.stageAssignments, po.supplierId) : [];
  const stagesBySupplier = new Map(plan.map((p) => [p.supplierId, p.stages]));

  // Sub-PO: load the master so we can show (read-only) what this sub-PO covers —
  // its own line items are empty by design (the master holds them).
  const subMaster = isSubPo ? await getPoDetail(po.parentPoId as string) : null;
  let subStageKeys: ProductionStage[] = [];
  if (subMaster) {
    const mplan = planSubPos(order, workStages, subMaster.stageAssignments, subMaster.supplierId);
    subStageKeys = mplan.find((p) => p.supplierId === po.supplierId)?.stages ?? [];
  }
  // Show only real work stages in the prefix; the opening "supplier_po" state is
  // owned for routing but isn't a labelled step.
  const subStages = subStageKeys
    .filter((s) => s !== order[0])
    .map((s) => stageLabels[s]);
  const subItems = subMaster
    ? [...subMaster.lineItems].sort(
        (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
      )
    : [];
  const subTerminal = terminalStage(order);
  let subRawBlanks: ReturnType<typeof summarizeRawBlanks> = [];
  if (subMaster && usesRawBlankSummary(subStageKeys)) {
    try {
      const attrs = makeLineAttrs(await getCatalogCached());
      subRawBlanks = summarizeRawBlanks(
        subItems.map((li) => ({
          sku: li.sku,
          quantity: li.quantity,
          sizeMm: attrs.sizeOf(li),
          material: attrs.materialOf(li),
          lineItemId: li.id,
        })),
      );
    } catch {
      /* catalog unavailable — fall back to per-SKU */
    }
  }

  // Sub-PO: this supplier's per-line unit costs (keyed on the master) + the
  // lifecycle state + the stage dropdown options (owned stages + handoff).
  const subState = isSubPo
    ? subPoStageState(order, subStageKeys, subItems.map((li) => li.currentStage))
    : null;
  // Dropdown the supplier sees: only their OWN work stages, plus a single
  // "Complete" that hands the batch to the next team (they don't see the next
  // team's stage name). supplier_po is the internal kickoff — never shown.
  const subWorkStages = subStageKeys.filter((s) => s !== order[0]);
  // "Accepted = started": a sub-PO's internal `supplier_po` kickoff isn't a stage
  // the supplier tracks — once the PO is issued the batch is already in its first
  // owned work stage. Collapse supplier_po → that first work stage on every sub-PO
  // display surface (header badge, dropdown, timeline) so they read consistently.
  // The dropdown already showed the first work stage; this aligns the badge and
  // timeline to match. The sub-PO timeline block below remaps the kickoff
  // stage_event the same way so the bar keeps its issue-date start.
  const subFirstWorkStage = subWorkStages[0] ?? null;
  const presentSubStage = (s: ProductionStage): ProductionStage =>
    s === order[0] && subFirstWorkStage ? subFirstWorkStage : s;
  const subHandoffStage = subStageKeys.length
    ? nextStage(order, subStageKeys[subStageKeys.length - 1])
    : null;
  const subStageOptions = isSubPo
    ? [
        ...subWorkStages.map((s) => ({ value: s as string, label: stageLabels[s] })),
        ...(subHandoffStage ? [{ value: subHandoffStage as string, label: "Complete" }] : []),
      ]
    : [];
  // The select's current value: a not-started (supplier_po) batch presents as its
  // first work stage — the same collapse the badge and timeline apply.
  const subCurrentStageValue =
    isSubPo && subState?.currentStage
      ? presentSubStage(subState.currentStage)
      : null;
  let subCoverRows: SubPoCoverRow[] = [];
  if (isSubPo && subMaster) {
    const costs = await getSupplierLineCosts(subMaster.id);
    const myCost = new Map(
      costs
        .filter((c) => c.supplierId === po.supplierId)
        .map((c) => [c.lineItemId, c.unitCostCents]),
    );
    const etaByLine = new Map(
      subItems.map((li) => [li.id, li.expectedCompletionDate ?? null]),
    );
    if (subRawBlanks.length > 0) {
      // SKU → product title, so the printable shows what each SKU under the
      // blank actually is.
      const titleBySku = new Map(subItems.map((li) => [li.sku, li.title ?? ""]));
      subCoverRows = subRawBlanks.map((g) => ({
        key: g.label,
        primary: g.label,
        covers: g.skus.map((sku) => ({ sku, title: titleBySku.get(sku) ?? "" })),
        lineItemIds: g.lineItemIds,
        quantity: g.quantity,
        // Every SKU in the blank shares one per-piece price; read the first.
        unitCents: g.lineItemIds.length ? myCost.get(g.lineItemIds[0]) ?? null : null,
        eta: g.lineItemIds.length ? etaByLine.get(g.lineItemIds[0]) ?? null : null,
      }));
    } else {
      subCoverRows = subItems.map((li) => ({
        key: li.id,
        sku: li.sku,
        primary: li.title,
        lineItemIds: [li.id],
        quantity: li.quantity,
        unitCents: myCost.get(li.id) ?? null,
        eta: li.expectedCompletionDate ?? null,
      }));
    }
  }

  // Master: roll every supplier's per-line unit cost up onto each line item.
  const supplierColumns = isMaster
    ? subPos.map((s) => ({
        supplierId: s.supplierId,
        label: `${s.poSuffix ?? ""} · ${s.supplier?.name ?? "—"}`.replace(/^ · /, ""),
      }))
    : [];
  const masterCostMap = new Map<string, number | null>();
  if (isMaster) {
    const costs = await getSupplierLineCosts(po.id);
    for (const c of costs) masterCostMap.set(`${c.supplierId}:${c.lineItemId}`, c.unitCostCents);
  }

  const derivedStage = derivePoStage(po.lineItems.map((li) => li.currentStage));
  // A sub-PO has no line items of its own, so its header stage comes from the
  // master's lines that this supplier currently holds.
  const displayStage: ProductionStage | "mixed" | null = isSubPo
    ? subState?.currentStage
      ? presentSubStage(subState.currentStage)
      : null
    : derivedStage;
  // Sub-POs listed in pipeline (route) order, not by suffix letter.
  const subPoRank = new Map(plan.map((p, i) => [p.supplierId, i]));
  const orderedSubPos = [...subPos].sort(
    (a, b) => (subPoRank.get(a.supplierId) ?? 99) - (subPoRank.get(b.supplierId) ?? 99),
  );

  // Order line items by buckle size (16, 18, 20, 22…), matching the create form.
  const sortedLineItems = [...po.lineItems].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
  const totalCents = po.lineItems.reduce(
    (sum, li) => sum + (li.unitCostCents ?? 0) * li.quantity,
    0,
  );

  // Master rollup grand total: Σ (qty × sum of every supplier's unit cost).
  const masterLineUnitSum = (lineItemId: string) =>
    supplierColumns.reduce(
      (s, col) => s + (masterCostMap.get(`${col.supplierId}:${lineItemId}`) ?? 0),
      0,
    );
  const masterGrandTotalCents = isMaster
    ? sortedLineItems.reduce(
        (sum, li) => sum + masterLineUnitSum(li.id) * li.quantity,
        0,
      )
    : 0;

  return (
    <div>
      {/* Breadcrumb: show the real PO number as the current crumb, and for a
          sub-PO insert its master before it → POs › PO-…-Master › PO-…-B. */}
      <SetBreadcrumb
        label={formatPoNumber(po.shopifyPoNumber, { isMaster, suffix: po.poSuffix })}
        trail={
          isSubPo
            ? [
                {
                  label: formatPoNumber(po.shopifyPoNumber, { isMaster: true }),
                  href: `/modules/production/po/${po.parentPoId}`,
                },
              ]
            : undefined
        }
      />
      <div className="flex items-center justify-between">
        <PageHeader
          title={formatPoNumber(po.shopifyPoNumber, { isMaster, suffix: po.poSuffix })}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/modules/production/po/${po.id}/send`}>Print or Send</Link>
          </Button>
          {!isSubPo && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/modules/production/po/${po.id}/edit`}>Edit</Link>
              </Button>
              <PoCreateInvoice poId={po.id} existingInvoiceId={existingInvoice?.id ?? null} />
            </>
          )}
          <DeleteButton
            entityKind="PO"
            entityLabel={formatPoNumber(po.shopifyPoNumber, { isMaster, suffix: po.poSuffix })}
            deleteUrl={`/api/production/po/${po.id}`}
            redirectTo="/modules/production"
          />
        </div>
      </div>

      {isSubPo && (
        <Card className="mt-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This is sub-PO{" "}
          <span className="font-mono font-medium">
            {formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix })}
          </span>
          {" — "}
          <Link
            href={`/modules/production/po/${po.parentPoId}`}
            className="font-medium underline underline-offset-2"
          >
            open the master ({formatPoNumber(po.shopifyPoNumber, { isMaster: true })})
          </Link>
          . Advance this supplier&apos;s stages below; editing, receiving, and
          invoicing live on the master.
        </Card>
      )}

      <Card className="mt-6 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-zinc-400">Supplier</div>
            <div className="mt-1 font-medium text-zinc-900">
              {isMaster ? "Multiple suppliers" : po.supplier?.name ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Stage</div>
            <div className="mt-1">
              {displayStage ? (
                <Badge className={cn(stageBadgeClass(displayStage))}>
                  {displayStage === "mixed" ? "Mixed" : stageLabels[displayStage]}
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
          {/* Expected delivery is set per LINE in the Line items table below
            *  — lines often have independent dates. Master rollup ETA still
            *  flows through to the sub-PO list section if you need it. */}
          <div>
            <div className="text-xs text-zinc-400">Issued</div>
            <div className="mt-1 text-zinc-700">{fmtDate(po.issuedDate)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Customer</div>
            <div className="mt-1 text-zinc-700">
              {po.company?.name ?? "—"}
              {po.company?.priceTier && (
                <span className="ml-2 text-xs text-zinc-400">
                  {po.company.priceTier.name} ({po.company.priceTier.discountPercent}% off)
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Warehouse</div>
            <div className="mt-1 text-zinc-700">{po.locationName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Sent to supplier</div>
            <PoSentControl
              poId={po.id}
              sentAtIso={po.sentAt ? po.sentAt.toISOString() : null}
              sentVia={po.sentVia}
            />
          </div>
        </div>
        {po.notes && <p className="mt-4 text-sm text-zinc-600">{po.notes}</p>}
      </Card>

      {isMaster && (
        <Card className="mt-5 p-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
            Sub-POs
            <InfoTooltip>
              One PO per supplier — each supplier advances their own stages on
              their sub-PO. Receiving and invoicing stay on this master.
            </InfoTooltip>
          </h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {orderedSubPos.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/modules/production/po/${s.id}`}
                    className="font-mono text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                  >
                    {formatPoNumber(s.shopifyPoNumber, { suffix: s.poSuffix })}
                  </Link>
                  <span className="ml-2 text-sm text-zinc-600">{s.supplier?.name ?? "—"}</span>
                  {s.sentAt && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Sent ✓
                    </span>
                  )}
                  <div className="mt-0.5 truncate text-xs text-zinc-400">
                    {(stagesBySupplier.get(s.supplierId) ?? [])
                      .filter((st) => st !== order[0])
                      .map((st) => stageLabels[st])
                      .join(", ") || "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">
                    ETA: {s.expectedDeliveryDate ? fmtDate(s.expectedDeliveryDate) : "—"}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/modules/production/po/${s.id}/send`}>Print or Send</Link>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sub-PO: same tabbed layout as the master — Items (this supplier's
       *  covered lines + costs/ETA), a supplier-scoped Production timeline, and
       *  Activity (this supplier's own notes/documents thread). */}
      {isSubPo && (
        <DetailTabs
          tabs={[
            ...(subState
              ? [
                  {
                    value: "items",
                    label: "Items",
                    content: (
                      <SubPoCovers
                        poId={po.id}
                        isRawBlank={subRawBlanks.length > 0}
                        stagePrefix={subStages.join(", ")}
                        rows={subCoverRows}
                        status={subState.status}
                        currentStage={subCurrentStageValue}
                        stageOptions={subStageOptions}
                      />
                    ),
                  },
                ]
              : []),
            {
              value: "progress",
              label: "Production timeline",
              content: (
                <ProductionTimeline
                  pos={[
                    {
                      id: po.id,
                      shopifyPoNumber: po.shopifyPoNumber,
                      supplier: po.supplier ? { name: po.supplier.name } : null,
                      stageTargets: po.stageEtas,
                      stageEstimates: perPoStageEstimates,
                      // Scope each line to this supplier's owned stages, anchoring
                      // its last owned stage to the per-line ETA — the same shape
                      // the supplier portal renders.
                      lineItems: subItems.map((li) => {
                        // Work stages only — supplier_po is collapsed into the
                        // first work stage ("accepted = started"), so it's not a
                        // segment or legend chip on the sub-PO timeline.
                        const scopedStages = [
                          ...subWorkStages.filter(
                            (s) =>
                              !li.stages ||
                              li.stages.length === 0 ||
                              li.stages.includes(s),
                          ),
                          subTerminal,
                        ];
                        const lastOwned = scopedStages[scopedStages.length - 2];
                        // Remap a line still at the kickoff (and its supplier_po
                        // stage_event) onto its first owned work stage. Remapping
                        // the event rather than dropping it keeps the bar's start
                        // anchored to the PO issue date — the acceptance span folds
                        // into raw material instead of collapsing to a today sliver.
                        const lineFirstWork = scopedStages[0] ?? subTerminal;
                        const remapStage = (s: ProductionStage): ProductionStage =>
                          s === order[0] ? lineFirstWork : s;
                        const currentIdx = order.indexOf(li.currentStage);
                        return {
                          id: li.id,
                          sku: li.sku,
                          title: li.title,
                          currentStage: remapStage(li.currentStage),
                          stages: scopedStages,
                          stageTargets:
                            lastOwned && li.expectedCompletionDate
                              ? [
                                  {
                                    stage: lastOwned,
                                    targetEndDate: li.expectedCompletionDate,
                                  },
                                ]
                              : undefined,
                          stageEvents: li.stageEvents
                            .filter((ev) => subStageKeys.includes(ev.stage))
                            .filter((ev) => order.indexOf(ev.stage) <= currentIdx)
                            .map((ev) => ({
                              id: ev.id,
                              stage: remapStage(ev.stage),
                              enteredAt: ev.enteredAt,
                              exitedAt: ev.exitedAt,
                            })),
                        };
                      }),
                    },
                  ]}
                  estimates={estimates}
                  stageLabels={stageLabels}
                  order={[...subWorkStages, subTerminal]}
                  estimateSaveRouteBase="/api/production/po"
                />
              ),
            },
            {
              value: "activity",
              label: "Activity",
              content: (
                <PoTimeline
                  poId={po.id}
                  viewer="admin"
                  currentUserId={session.user?.id}
                  entries={buildPoTimeline(po.comments, po.attachments, events)}
                  showRelatedEmails
                />
              ),
            },
          ]}
        />
      )}

      {!isSubPo && (
        <>
      {/* C2 receiving: show once the PO is complete, or after it's been received. */}
      {((!!derivedStage && derivedStage !== "mixed" && isTerminal(order, derivedStage)) ||
        po.shopifyReceivedAt) && (
        <PoReceive
          poId={po.id}
          receivedAt={
            po.shopifyReceivedAt
              ? po.shopifyReceivedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null
          }
        />
      )}

      {!isMaster && (
        <PoControls
          poId={po.id}
          status={po.status}
          lockStagesTogether={po.lockStagesTogether}
          totalCents={totalCents}
          lineItems={sortedLineItems.map((li) => ({
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
            // Effective company / warehouse: line override falls back to the PO default.
            company: li.company?.name ?? po.company?.name ?? null,
            companyOverridden: !!li.company,
            warehouse: li.locationName ?? po.locationName ?? null,
            warehouseOverridden: !!li.locationName,
            // Per-line stage config — drives the scoped Stage dropdown (a SKU
            // that skips stages won't list them). null/empty = full pipeline.
            stages: li.stages ?? null,
          }))}
        />
      )}

      <DetailTabs
        tabs={[
          ...(isMaster
            ? [
                {
                  value: "items",
                  label: "Items",
                  content: (
                    <Card className="p-6">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Product</TableHead>
                              {supplierColumns.map((col) => (
                                <TableHead key={col.supplierId} className="text-right">
                                  {col.label}
                                </TableHead>
                              ))}
                              <TableHead className="text-right">Unit cost</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Total cost</TableHead>
                              <TableHead className="text-right">Artwork</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedLineItems.map((li) => {
                              const perSupplier = supplierColumns.map(
                                (col) =>
                                  masterCostMap.get(`${col.supplierId}:${li.id}`) ?? null,
                              );
                              const anyCost = perSupplier.some((c) => c != null);
                              const unitSum = perSupplier.reduce<number>(
                                (s, c) => s + (c ?? 0),
                                0,
                              );
                              return (
                                <TableRow key={li.id}>
                                  <TableCell className="font-mono text-xs">
                                    {li.sku}
                                  </TableCell>
                                  <TableCell>{li.title}</TableCell>
                                  {perSupplier.map((c, i) => (
                                    <TableCell
                                      key={supplierColumns[i].supplierId}
                                      className="text-right text-zinc-500"
                                    >
                                      {fmtMoney(c)}
                                    </TableCell>
                                  ))}
                                  <TableCell className="text-right font-medium text-zinc-900">
                                    {anyCost ? fmtMoney(unitSum) : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-zinc-500">
                                    {li.quantity}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-zinc-900">
                                    {anyCost ? fmtMoney(unitSum * li.quantity) : "—"}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap pr-2 text-right">
                                    <Link
                                      href={`/products/${encodeURIComponent(li.sku)}/label`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 hover:decoration-zinc-600"
                                      title="Open the printable label artwork for this SKU"
                                    >
                                      Label
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
                        <span className="text-sm text-zinc-500">
                          Total production cost (USD)
                        </span>
                        <span className="ml-3 text-base font-semibold text-zinc-900">
                          {fmtMoney(masterGrandTotalCents)}
                        </span>
                      </div>
                    </Card>
                  ),
                },
              ]
            : []),
          {
            value: "progress",
            label: "Production timeline",
            content: (
              <ProductionTimeline
                pos={[
                  {
                    id: po.id,
                    shopifyPoNumber: po.shopifyPoNumber,
                    supplier: po.supplier ? { name: po.supplier.name } : null,
                    stageTargets: po.stageEtas,
                    stageEstimates: perPoStageEstimates,
                    lineItems: sortedLineItems.map((li) => {
                      // Last walked stage before terminal — used to anchor the
                      // line's bar to its expectedCompletionDate when set.
                      const walkOrder =
                        li.stages && li.stages.length > 0 ? li.stages : order;
                      const terminal = walkOrder[walkOrder.length - 1];
                      const lastWorkStage = walkOrder
                        .filter((s) => s !== terminal)
                        .at(-1);
                      return {
                        id: li.id,
                        sku: li.sku,
                        title: li.title,
                        currentStage: li.currentStage,
                        stages: li.stages,
                        // Per-line ETA → anchor the last walked work stage so
                        // the line's bar ends on its own promise date.
                        stageTargets:
                          lastWorkStage && li.expectedCompletionDate
                            ? [
                                {
                                  stage: lastWorkStage,
                                  targetEndDate: li.expectedCompletionDate,
                                },
                              ]
                            : undefined,
                        stageEvents: li.stageEvents.map((ev) => ({
                          id: ev.id,
                          stage: ev.stage,
                          enteredAt: ev.enteredAt,
                          exitedAt: ev.exitedAt,
                        })),
                      };
                    }),
                  },
                ]}
                estimates={estimates}
                stageLabels={stageLabels}
                order={order}
                estimateSaveRouteBase="/api/production/po"
              />
            ),
          },
          {
            value: "activity",
            label: "Activity",
            content: (
              <PoTimeline
                poId={po.id}
                viewer="admin"
                currentUserId={session.user?.id}
                entries={buildPoTimeline(po.comments, po.attachments, events)}
                showRelatedEmails
              />
            ),
          },
        ]}
      />
        </>
      )}
    </div>
  );
}
