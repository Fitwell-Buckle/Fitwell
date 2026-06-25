"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteButton } from "@/components/ui/delete-button";
import { InvoiceAttachments } from "@/components/invoicing/invoice-attachments";
import { PROTOTYPE_STATUS_LABELS, type PrototypeStatus } from "@/lib/prototypes";
import { PrototypeStatusBadge } from "../prototype-manager";
import { PrototypeRounds, type RoundItem } from "./prototype-rounds";
import { FusionReferences, type ReferenceItem } from "./fusion-references";
import { PrototypeVendors, type CandidateVendor } from "./prototype-vendors";

interface SupplierOption {
  id: string;
  name: string;
}

interface PrototypeDetail {
  id: string;
  name: string;
  proposedSku: string | null;
  finalSku: string | null;
  // Awarded vendor (chosen from `vendors`); `vendors` is the candidate set.
  supplierId: string | null;
  vendors: CandidateVendor[];
  status: string;
  description: string | null;
  estUnitCostCents: number | null;
  notes: string | null;
  approvedAt: string | null;
  attachments: {
    id: string;
    blobUrl: string;
    filename: string;
    sizeBytes: number | null;
  }[];
  references: ReferenceItem[];
  rounds: RoundItem[];
}

// Statuses a user picks directly. "approved" is reached only through the
// promote action below (it needs a final SKU), so it's not in this list.
const EDITABLE_STATUSES: PrototypeStatus[] = [
  "concept",
  "in_development",
  "on_hold",
  "rejected",
];

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputCls =
  "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950";

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function PrototypeDetailView({
  prototype,
  suppliers,
}: {
  prototype: PrototypeDetail;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const isApproved = prototype.status === "approved";

  const [name, setName] = useState(prototype.name);
  const [proposedSku, setProposedSku] = useState(prototype.proposedSku ?? "");
  const [supplierId, setSupplierId] = useState(prototype.supplierId ?? "");
  const [status, setStatus] = useState(
    isApproved ? "in_development" : prototype.status,
  );
  const [estCost, setEstCost] = useState(centsToInput(prototype.estUnitCostCents));
  const [description, setDescription] = useState(prototype.description ?? "");
  const [notes, setNotes] = useState(prototype.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Promotion card state.
  const [finalSku, setFinalSku] = useState(
    prototype.finalSku ?? prototype.proposedSku ?? "",
  );
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/prototypes/${prototype.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Request failed.");
    }
    return true;
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    try {
      await patch({
        name: name.trim(),
        proposedSku: proposedSku.trim() || null,
        supplierId: supplierId || null,
        // Don't overwrite an "approved" status from the details form.
        ...(isApproved ? {} : { status }),
        estUnitCostCents:
          estCost.trim() === "" ? null : Math.round(Number(estCost) * 100),
        description: description.trim() || null,
        notes: notes.trim() || null,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setApproveError(null);
    if (!finalSku.trim()) return setApproveError("A final SKU is required.");
    setApproveBusy(true);
    try {
      await patch({ status: "approved", finalSku: finalSku.trim() });
      router.refresh();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setApproveBusy(false);
    }
  }

  async function reopen() {
    setApproveError(null);
    setApproveBusy(true);
    try {
      await patch({ status: "in_development" });
      router.refresh();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : "Could not reopen.");
    } finally {
      setApproveBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Details */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Details</h2>
            <PrototypeStatusBadge status={prototype.status} />
          </div>
          <DeleteButton
            entityKind="prototype"
            entityLabel={prototype.name}
            deleteUrl={`/api/prototypes/${prototype.id}`}
            redirectTo="/modules/production/prototypes"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabel}>Proposed SKU</label>
            <Input
              value={proposedSku}
              onChange={(e) => setProposedSku(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabel}>Awarded vendor</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputCls}
              disabled={prototype.vendors.length === 0}
            >
              <option value="">— Not awarded yet —</option>
              {prototype.vendors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">
              {prototype.vendors.length === 0
                ? "Add candidate vendors below first."
                : "The vendor you’re going with, chosen from the candidates below."}
            </p>
          </div>
          <div>
            <label className={fieldLabel}>Est. unit cost ($)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={estCost}
              onChange={(e) => setEstCost(e.target.value)}
            />
          </div>
          {!isApproved && (
            <div>
              <label className={fieldLabel}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputCls}
              >
                {EDITABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROTOTYPE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={fieldLabel}>Description / spec</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabel}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      {/* Candidate vendors + RFQs + quotes */}
      <PrototypeVendors
        prototypeId={prototype.id}
        vendors={prototype.vendors}
        awardedId={prototype.supplierId}
        allSuppliers={suppliers}
      />

      {/* Promotion to product */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Promote to product
        </h2>
        {isApproved ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Approved as <span className="font-semibold">{prototype.finalSku}</span>
                {prototype.approvedAt
                  ? ` on ${new Date(prototype.approvedAt).toLocaleDateString()}`
                  : ""}
                .
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Create the real product/variant for{" "}
              <span className="font-medium">{prototype.finalSku}</span> in Shopify
              manually — that step isn&apos;t automated.
            </p>
            {approveError && (
              <p className="mt-2 text-sm text-red-600">{approveError}</p>
            )}
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={reopen}
                disabled={approveBusy}
              >
                {approveBusy ? "Working…" : "Reopen for more development"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-xs text-zinc-500">
              Approving locks in the final SKU. You&apos;ll still create the
              product in Shopify by hand.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-full max-w-xs">
                <label className={fieldLabel}>Final SKU</label>
                <Input
                  value={finalSku}
                  onChange={(e) => setFinalSku(e.target.value)}
                  placeholder="e.g. FW-TI-002"
                />
              </div>
              <Button onClick={approve} disabled={approveBusy}>
                {approveBusy ? "Approving…" : "Approve & promote"}
              </Button>
            </div>
            {approveError && (
              <p className="mt-2 text-sm text-red-600">{approveError}</p>
            )}
          </div>
        )}
      </Card>

      {/* CAD references — Autodesk Fusion share links with inline 3D preview */}
      <FusionReferences
        prototypeId={prototype.id}
        references={prototype.references}
      />

      {/* Other uploaded files (spec sheets, photos, PDFs) */}
      <InvoiceAttachments
        uploadUrl={`/api/prototypes/${prototype.id}/attachments`}
        deleteUrlBase="/api/prototypes/attachments"
        attachments={prototype.attachments}
        title="Other files"
        buttonLabel="Add file"
        hint="Spec sheets, reference photos, or PDFs. Images or PDF, max 10MB."
      />

      {/* Sample rounds */}
      <PrototypeRounds prototypeId={prototype.id} rounds={prototype.rounds} />
    </div>
  );
}
