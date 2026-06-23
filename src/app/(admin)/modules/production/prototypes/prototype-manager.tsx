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
import { cn } from "@/lib/utils";

interface PrototypeListItem {
  id: string;
  name: string;
  proposedSku: string | null;
  finalSku: string | null;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
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
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          proposedSku: proposedSku.trim() || null,
          supplierId: supplierId || null,
          description: description.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
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
        <div>
          <label className={fieldLabel}>Vendor</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <option value="">— No vendor yet —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
    return [p.name, p.proposedSku, p.finalSku, p.supplierName].some((v) =>
      v?.toLowerCase().includes(q),
    );
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
                    {p.supplierId ? (
                      <Link
                        href={`/modules/production/suppliers/${p.supplierId}`}
                        className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                      >
                        {p.supplierName}
                      </Link>
                    ) : (
                      "—"
                    )}
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
