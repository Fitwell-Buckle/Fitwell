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
  fmtMoney,
  skuSize,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { PoControls } from "./po-controls";
import { PoComments } from "./po-comments";
import { PoAttachments } from "./po-attachments";

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
        <PageHeader title={`PO ${po.shopifyPoNumber}`} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/modules/production/po/${po.id}/edit`}>Edit</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/modules/production">Back</Link>
          </Button>
        </div>
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
          <div>
            <div className="text-xs text-zinc-400">Company</div>
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
