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
import { VendorInlineCreate } from "@/components/production/vendor-inline-create";
import { PrototypeStatusBadge } from "../prototype-manager";
import { PrototypeRounds, type RoundItem } from "./prototype-rounds";
import { FusionReferences, type ReferenceItem } from "./fusion-references";

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
  vendors: SupplierOption[];
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

// Candidate vendor set (RFQ recipients) for a prototype: add existing vendors,
// create new ones inline, or remove them. The awarded vendor is marked here and
// chosen from this set in the Details card above. Server-backed; refreshes the
// route on every change so the awarded dropdown stays in sync.
function VendorsManager({
  prototypeId,
  vendors,
  awardedId,
  allSuppliers,
}: {
  prototypeId: string;
  vendors: SupplierOption[];
  awardedId: string | null;
  allSuppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickId, setPickId] = useState("");

  const added = new Set(vendors.map((v) => v.id));
  const available = allSuppliers.filter((s) => !added.has(s.id));

  async function mutate(method: "POST" | "DELETE", supplierId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/prototypes/${prototypeId}/suppliers`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Vendors</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Every vendor you’ll request a quote from for this prototype. We’ll send
        RFQs to each through the system.
      </p>

      <div className="mt-4 space-y-2">
        {vendors.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
            No vendors yet.
          </p>
        ) : (
          vendors.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2"
            >
              <span className="text-sm text-zinc-800">
                {v.name}
                {v.id === awardedId && (
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-green-600">
                    awarded
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => mutate("DELETE", v.id)}
                disabled={busy}
                className="text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 hover:decoration-red-400 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {available.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={fieldLabel}>Add an existing vendor</label>
              <select
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                className={inputCls}
                disabled={busy}
              >
                <option value="">— Choose a vendor —</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !pickId}
              onClick={() => {
                const id = pickId;
                setPickId("");
                mutate("POST", id);
              }}
            >
              Add
            </Button>
          </div>
        )}

        {adding ? (
          <VendorInlineCreate
            onCreated={(v) => {
              setAdding(false);
              mutate("POST", v.id);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
          >
            + Create a new vendor
          </button>
        )}
      </div>
    </Card>
  );
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

      {/* Candidate vendors (RFQ recipients) */}
      <VendorsManager
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
