"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { type ProductionStage } from "@/lib/production/stages";
import { useStageLabels } from "@/components/production/stage-labels-provider";
import { stageBadgeClass, fmtMoney } from "@/lib/production/display";
import { cn } from "@/lib/utils";

interface LineItem {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unitCost: string;
  currentStage: ProductionStage;
  /** Per-line expected completion date (YYYY-MM-DD) or null. The supplier
   *  edits this inline; it drives the line's bar end on the timeline. */
  expectedCompletionDate: string | null;
}

const STAGE_SELECT =
  "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:opacity-50";

export function SupplierLineItems({
  poId,
  lineItems,
  totalCents,
  ownedStages,
  stageOptions,
  canDownloadLabels = false,
}: {
  poId: string;
  lineItems: LineItem[];
  totalCents: number;
  /** Stages this supplier owns — only lines currently here are editable. */
  ownedStages: string[];
  /** Dropdown options: the supplier's stages + the handoff to the next team. */
  stageOptions: { value: string; label: string }[];
  /** Show the packaging label link per line item — only when this supplier
   *  owns the packaging stage on the PO. */
  canDownloadLabels?: boolean;
}) {
  const router = useRouter();
  const stageLabels = useStageLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = new Set(ownedStages);

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

  // Per-line expected_completion_date editor. Each line has its own ETA
  // because lines on the same PO often have independent schedules. The
  // edit fires on blur (or Enter) so the supplier doesn't get a spinner
  // for every keystroke; the server reseeds the stage targets and the
  // chart catches up on refresh.
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
        <p className="text-xs text-zinc-500">
          Pick a stage to advance your work — choose the next team to hand off.
        </p>
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
              <TableHead className="text-right">Current Stage</TableHead>
              <TableHead className="text-right">Final ETA</TableHead>
              {canDownloadLabels && <TableHead className="w-0" aria-label="Label" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                <TableCell>{li.title}</TableCell>
                <TableCell className="text-zinc-500">{li.quantity}</TableCell>
                <TableCell className="text-zinc-500">{li.unitCost}</TableCell>
                <TableCell className="text-right">
                  {owned.has(li.currentStage) ? (
                    <select
                      value={li.currentStage}
                      disabled={busy}
                      onChange={(e) => setStage(li.id, e.target.value)}
                      className={STAGE_SELECT}
                    >
                      {stageOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge className={cn(stageBadgeClass(li.currentStage))}>
                      {stageLabels[li.currentStage]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <LineEtaInput
                    initial={li.expectedCompletionDate}
                    disabled={busy}
                    onSave={(d) => setLineEta(li.id, d)}
                  />
                </TableCell>
                {canDownloadLabels && (
                  <TableCell className="whitespace-nowrap pr-2 text-right">
                    <Link
                      href={`/supplier/products/${encodeURIComponent(li.sku)}/label`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 hover:decoration-zinc-600"
                      title="Open the printable packaging label for this SKU"
                    >
                      Label
                    </Link>
                  </TableCell>
                )}
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
 * Inline per-line ETA editor. The value commits on blur (or Enter) so a
 * supplier dragging the date-picker through months doesn't fire a save on
 * every step. A small "Clear" button removes the date entirely.
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
    if (next === (initial ?? null)) return; // no-op
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
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
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
