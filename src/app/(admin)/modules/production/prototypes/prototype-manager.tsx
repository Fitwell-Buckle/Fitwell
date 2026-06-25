"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  PROTOTYPE_STATUSES,
  PROTOTYPE_STATUS_BADGE,
  PROTOTYPE_STATUS_LABELS,
  type PrototypeStatus,
} from "@/lib/prototypes";
import { VendorMultiSelect } from "@/components/production/vendor-inline-create";
import { isAllowedFusionUrl } from "@/lib/prototypes/fusion";
import { cn } from "@/lib/utils";

interface PrototypeVendor {
  id: string;
  name: string;
}

interface PrototypeListItem {
  id: string;
  name: string;
  proposedSku: string | null;
  finalSku: string | null;
  status: string;
  // The awarded vendor (if chosen). `vendors` is the full candidate set.
  supplierId: string | null;
  supplierName: string | null;
  vendors: PrototypeVendor[];
  roundCount: number;
  updatedAt: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

export function PrototypeStatusBadge({ status }: { status: string }) {
  const cls =
    PROTOTYPE_STATUS_BADGE[status as PrototypeStatus] ?? "bg-zinc-100 text-zinc-600";
  const label = PROTOTYPE_STATUS_LABELS[status as PrototypeStatus] ?? status;
  return <Badge className={cls}>{label}</Badge>;
}

// The Vendor column: the candidate vendor set, with the awarded one (if any)
// surfaced first and marked. Shows up to two names, then "+N more".
function VendorCell({
  vendors,
  awardedId,
}: {
  vendors: PrototypeVendor[];
  awardedId: string | null;
}) {
  if (vendors.length === 0) return <span className="text-zinc-400">—</span>;
  // Awarded vendor first, then the rest alphabetically as given.
  const ordered = [...vendors].sort((a, b) =>
    a.id === awardedId ? -1 : b.id === awardedId ? 1 : 0,
  );
  const shown = ordered.slice(0, 2);
  const extra = ordered.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {shown.map((v, i) => (
        <span key={v.id}>
          <Link
            href={`/modules/production/suppliers/${v.id}`}
            className={cn(
              "underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600",
              v.id === awardedId && "font-medium text-zinc-900",
            )}
          >
            {v.name}
          </Link>
          {v.id === awardedId && (
            <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-green-600">
              awarded
            </span>
          )}
          {i < shown.length - 1 && <span className="text-zinc-300">,</span>}
        </span>
      ))}
      {extra > 0 && <span className="text-zinc-400">+{extra} more</span>}
    </span>
  );
}

function NewPrototypeForm({
  suppliers,
  onClose,
}: {
  suppliers: SupplierOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [proposedSku, setProposedSku] = useState("");
  // Local copy so inline-created vendors show up immediately in the list.
  const [vendors, setVendors] = useState<SupplierOption[]>(suppliers);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [fusionUrl, setFusionUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const link = fusionUrl.trim();
    if (link && !isAllowedFusionUrl(link)) {
      return setError(
        "That doesn’t look like a Fusion share link (a360.co or autodesk360.com). Leave it blank to add one later.",
      );
    }
    setBusy(true);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          proposedSku: proposedSku.trim() || null,
          supplierIds,
          description: description.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      // Best-effort: attach the Fusion CAD link to the new prototype. The
      // prototype already exists, so a link failure shouldn't block — the user
      // lands on the detail page and can add/retry it under CAD references.
      if (link) {
        await fetch(`/api/prototypes/${d.data.id}/references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link, title: null }),
        }).catch(() => {});
      }
      router.push(`/modules/production/prototypes/${d.data.id}`);
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">New prototype</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Titanium micro-adjust v2"
          />
        </div>
        <div>
          <label className={fieldLabel}>Proposed SKU</label>
          <Input
            value={proposedSku}
            onChange={(e) => setProposedSku(e.target.value)}
            placeholder="Optional — planned SKU"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>
            Vendors{" "}
            <span className="font-normal text-zinc-400">
              — select every vendor you&apos;ll request a quote from
            </span>
          </label>
          <VendorMultiSelect
            vendors={vendors}
            selectedIds={supplierIds}
            onChange={setSupplierIds}
            onVendorCreated={(v) => setVendors((prev) => [...prev, v])}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>
            Fusion / CAD link{" "}
            <span className="font-normal text-zinc-400">
              — optional; renders as an inline 3D preview. You can add more later.
            </span>
          </label>
          <Input
            value={fusionUrl}
            onChange={(e) => setFusionUrl(e.target.value)}
            placeholder="https://a360.co/…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Description / spec</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Design intent, materials, dimensions…"
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Creating…" : "Create prototype"}
        </Button>
      </div>
    </Card>
  );
}

export function PrototypeManager({
  prototypes,
  suppliers,
}: {
  prototypes: PrototypeListItem[];
  suppliers: SupplierOption[];
}) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  // "" = all; otherwise a specific status.
  const [statusFilter, setStatusFilter] = useState<"" | PrototypeStatus>("");

  const q = search.trim().toLowerCase();
  const filtered = prototypes.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!q) return true;
    return [
      p.name,
      p.proposedSku,
      p.finalSku,
      p.supplierName,
      ...p.vendors.map((v) => v.name),
    ].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, SKU, or vendor…"
            className="flex h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | PrototypeStatus)}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
          >
            <option value="">All statuses</option>
            {PROTOTYPE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROTOTYPE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>Add prototype</Button>
        )}
      </div>

      {creating && (
        <NewPrototypeForm
          suppliers={suppliers}
          onClose={() => setCreating(false)}
        />
      )}

      <DataTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Rounds</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  {prototypes.length === 0
                    ? "No prototypes yet."
                    : "No prototypes match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/modules/production/prototypes/${p.id}`}
                      className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {p.finalSku ?? p.proposedSku ?? "—"}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    <VendorCell
                      vendors={p.vendors}
                      awardedId={p.supplierId}
                    />
                  </TableCell>
                  <TableCell>
                    <PrototypeStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className={cn("text-right text-zinc-500")}>
                    {p.roundCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
