"use client";

import { useState } from "react";
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
import { STAGE_LABELS, type ProductionStage } from "@/lib/production/stages";
import { stageBadgeClass, fmtMoney } from "@/lib/production/display";
import { cn } from "@/lib/utils";

interface LineItem {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unitCost: string;
  currentStage: ProductionStage;
}

const STAGE_SELECT =
  "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:opacity-50";

export function SupplierLineItems({
  poId,
  lineItems,
  totalCents,
  ownedStages,
  stageOptions,
}: {
  poId: string;
  lineItems: LineItem[];
  totalCents: number;
  /** Stages this supplier owns — only lines currently here are editable. */
  ownedStages: string[];
  /** Dropdown options: the supplier's stages + the handoff to the next team. */
  stageOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
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
              <TableHead className="text-right">Stage</TableHead>
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
                      {STAGE_LABELS[li.currentStage]}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
        <span className="text-sm text-zinc-500">Total cost</span>
        <span className="ml-3 text-base font-semibold text-zinc-900">
          {fmtMoney(totalCents)}
        </span>
      </div>
    </Card>
  );
}
