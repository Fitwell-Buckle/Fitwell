"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { type ProductionStage } from "@/lib/production/stages";
import { useStageLabels, useStageOrder } from "@/components/production/stage-labels-provider";
import { PO_STATUSES, STATUS_LABELS, fmtMoney } from "@/lib/production/display";

interface LineItem {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unitCost: string;
  currentStage: ProductionStage;
  customerName: string | null;
  expectedCompletionDate: string | null;
  company: string | null;
  companyOverridden: boolean;
  warehouse: string | null;
  warehouseOverridden: boolean;
}

const STAGE_SELECT =
  "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:opacity-50";

export function PoControls({
  poId,
  status,
  lockStagesTogether,
  lineItems,
  totalCents,
}: {
  poId: string;
  status: string;
  lockStagesTogether: boolean;
  lineItems: LineItem[];
  totalCents: number;
}) {
  const router = useRouter();
  const stageLabels = useStageLabels();
  const stageOrder = useStageOrder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchPo(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Update failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Set a line item's stage directly (forward or back); auto-saves on change. A
  // locked PO moves every line together (server-side via planSetStage).
  async function setStage(lineItemId: string, toStage: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/line-items/${lineItemId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't update the stage.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Set a line item's per-line ETA. Drives the timeline's per-line bar end
  // and the seeder anchor (each line's last owned stage gets pinned to
  // this date instead of the sub-PO ETA).
  async function setLineEta(lineItemId: string, dateIso: string | null) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/line-items/${lineItemId}/eta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCompletionDate: dateIso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't update the ETA.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span>Status</span>
            <select
              value={status}
              disabled={busy}
              onChange={(e) => patchPo({ status: e.target.value })}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
            >
              {PO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={lockStagesTogether}
              disabled={busy}
              onChange={(e) => patchPo({ lockStagesTogether: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>Move all stages together</span>
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit cost</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Stage</TableHead>
              <TableHead className="text-right">ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                <TableCell>{li.title}</TableCell>
                <TableCell className="text-zinc-500">{li.quantity}</TableCell>
                <TableCell className="text-zinc-500">{li.unitCost}</TableCell>
                <TableCell className="text-zinc-500">
                  {li.company ?? "—"}
                  {li.companyOverridden && (
                    <span className="ml-1 text-[10px] uppercase text-amber-600">ovr</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500">
                  {li.warehouse ?? "—"}
                  {li.warehouseOverridden && (
                    <span className="ml-1 text-[10px] uppercase text-amber-600">ovr</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <select
                    value={li.currentStage}
                    disabled={busy}
                    onChange={(e) => setStage(li.id, e.target.value)}
                    className={STAGE_SELECT}
                  >
                    {stageOrder.map((s) => (
                      <option key={s} value={s}>
                        {stageLabels[s]}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-right">
                  <LineEtaInput
                    initial={li.expectedCompletionDate}
                    disabled={busy}
                    onSave={(d) => setLineEta(li.id, d)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
        <span className="text-sm text-zinc-500">Total cost (USD)</span>
        <span className="ml-3 text-base font-semibold text-zinc-900">
          {fmtMoney(totalCents)}
        </span>
      </div>
    </Card>
  );
}

/**
 * Inline per-line ETA editor. Commits on blur (or Enter) so a long
 * date-picker drag doesn't fire a save per step; small × clears the date.
 * Mirrors the supplier-portal LineEtaInput so admins and suppliers see the
 * same interaction.
 */
function LineEtaInput({
  initial,
  disabled,
  onSave,
}: {
  initial: string | null;
  disabled: boolean;
  onSave: (dateIso: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? "");

  function commit() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next === (initial ?? null)) return;
    onSave(next);
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:opacity-50"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            onSave(null);
          }}
          disabled={disabled}
          className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-50"
          title="Clear ETA"
        >
          ×
        </button>
      )}
    </div>
  );
}
