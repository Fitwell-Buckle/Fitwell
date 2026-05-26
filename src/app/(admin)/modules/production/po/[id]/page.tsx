import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPoDetail, getSubPos } from "@/lib/production/service";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { STAGE_LABELS, STAGES, derivePoStage } from "@/lib/production/stages";
import { formatPoNumber, planSubPos } from "@/lib/production/sub-po";
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
import { PoComments } from "./po-comments";
import { PoAttachments } from "./po-attachments";
import { PoReceive } from "./po-receive";
import { PoStageTimeline } from "./po-stage-timeline";
import { PoCreateInvoice } from "./po-create-invoice";

function fmtBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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

  // Multi-supplier framing: a PO with sub-POs is a master; a PO with a parent
  // is a sub-PO. The per-supplier stage split comes from the master's
  // stage→supplier assignments.
  const subPos = await getSubPos(po.id);
  const isMaster = subPos.length > 0;
  const isSubPo = !!po.parentPoId;
  const workStages = STAGES.filter((s) => s !== "complete");
  const plan = isMaster ? planSubPos(workStages, po.stageAssignments, po.supplierId) : [];
  const stagesBySupplier = new Map(plan.map((p) => [p.supplierId, p.stages]));

  const derivedStage = derivePoStage(po.lineItems.map((li) => li.currentStage));

  // Order line items by buckle size (16, 18, 20, 22…), matching the create form.
  const sortedLineItems = [...po.lineItems].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
  const totalCents = po.lineItems.reduce(
    (sum, li) => sum + (li.unitCostCents ?? 0) * li.quantity,
    0,
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`PO ${formatPoNumber(po.shopifyPoNumber, { isMaster, suffix: po.poSuffix })}`}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/modules/production/po/${po.id}/send`}>Print &amp; Send</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/modules/production/po/${po.id}/edit`}>Edit</Link>
          </Button>
          <PoCreateInvoice poId={po.id} />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/modules/production">Back</Link>
          </Button>
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
          . Line items, editing, receiving, and invoicing live on the master.
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
          <div>
            <div className="text-xs text-zinc-400">Brand</div>
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
        </div>
        {po.notes && <p className="mt-4 text-sm text-zinc-600">{po.notes}</p>}
      </Card>

      {isMaster && (
        <Card className="mt-5 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Sub-POs</h2>
          <p className="mt-1 text-xs text-zinc-500">
            One PO per supplier — send each to its supplier. Editing, receiving,
            and invoicing stay on this master.
          </p>
          <div className="mt-3 divide-y divide-zinc-100">
            {subPos.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/modules/production/po/${s.id}`}
                    className="font-mono text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                  >
                    {formatPoNumber(s.shopifyPoNumber, { suffix: s.poSuffix })}
                  </Link>
                  <span className="ml-2 text-sm text-zinc-600">{s.supplier?.name ?? "—"}</span>
                  <div className="mt-0.5 truncate text-xs text-zinc-400">
                    {(stagesBySupplier.get(s.supplierId) ?? [])
                      .map((st) => STAGE_LABELS[st])
                      .join(", ") || "—"}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/modules/production/po/${s.id}/send`}>Print &amp; Send</Link>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* C2 receiving: show once the PO is complete, or after it's been received. */}
      {(derivedStage === "complete" || po.shopifyReceivedAt) && (
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
        }))}
      />

      <PoStageTimeline
        lines={sortedLineItems.map((li) => ({
          id: li.id,
          sku: li.sku,
          title: li.title,
          events: li.stageEvents.map((ev) => ({
            id: ev.id,
            stage: ev.stage,
            date: ev.enteredAt.toISOString().slice(0, 10),
          })),
        }))}
      />

      <PoAttachments
        poId={po.id}
        attachments={po.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          url: a.blobUrl,
          size: fmtBytes(a.sizeBytes),
        }))}
      />

      <PoComments
        poId={po.id}
        comments={po.comments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author?.name || c.author?.email || "Unknown",
          when: c.createdAt.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        }))}
      />
    </div>
  );
}
