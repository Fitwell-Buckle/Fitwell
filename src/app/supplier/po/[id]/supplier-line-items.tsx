"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { STAGE_LABELS, isComplete, type ProductionStage } from "@/lib/production/stages";
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

export function SupplierLineItems({
  poId,
  lockStagesTogether,
  lineItems,
  totalCents,
}: {
  poId: string;
  lockStagesTogether: boolean;
  lineItems: LineItem[];
  totalCents: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allComplete = lineItems.every((li) => isComplete(li.currentStage));

  async function advance(lineItemId?: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineItemId ? { lineItemId } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Advance failed.");
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
        {lockStagesTogether && (
          <Button size="sm" disabled={busy || allComplete} onClick={() => advance()}>
            {allComplete ? "All complete" : "Advance all to next stage"}
          </Button>
        )}
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
              <TableHead>Stage</TableHead>
              {!lockStagesTogether && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                <TableCell>{li.title}</TableCell>
                <TableCell className="text-zinc-500">{li.quantity}</TableCell>
                <TableCell className="text-zinc-500">{li.unitCost}</TableCell>
                <TableCell>
                  <Badge className={cn(stageBadgeClass(li.currentStage))}>
                    {STAGE_LABELS[li.currentStage]}
                  </Badge>
                </TableCell>
                {!lockStagesTogether && (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || isComplete(li.currentStage)}
                      onClick={() => advance(li.id)}
                    >
                      {isComplete(li.currentStage) ? "Complete" : "Advance"}
                    </Button>
                  </TableCell>
                )}
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
