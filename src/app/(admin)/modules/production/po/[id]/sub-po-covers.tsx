"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { fmtMoney } from "@/lib/production/display";
import type { SubPoStageStatus } from "@/lib/production/sub-po";

export interface SubPoCoverRow {
  key: string;
  /** per-SKU view: the SKU (mono column). raw-blank view: undefined. */
  sku?: string;
  /** per-SKU: product title. raw-blank: the blank label, e.g. "16mm Steel". */
  primary: string;
  /** raw-blank: the finished SKUs this blank covers, with their product
   *  titles so the supplier sees what each SKU actually is. */
  covers?: { sku: string; title: string }[];
  /** master line items this row prices (one per SKU; many for a raw-blank group). */
  lineItemIds: string[];
  quantity: number;
  unitCents: number | null;
}

export function SubPoCovers({
  poId,
  isRawBlank,
  stagePrefix,
  rows,
  status,
  currentStage,
  stageOptions,
  eta: initialEta,
}: {
  poId: string;
  isRawBlank: boolean;
  stagePrefix: string;
  rows: SubPoCoverRow[];
  status: SubPoStageStatus;
  currentStage: string | null;
  stageOptions: { value: string; label: string }[];
  eta: string | null;
}) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.unitCents != null ? (r.unitCents / 100).toString() : "";
    return m;
  });
  const [savingPrices, setSavingPrices] = useState(false);
  const [savedPrices, setSavedPrices] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // This sub-PO's own ETA (independent of the master and the other sub-POs).
  const [eta, setEta] = useState(initialEta ?? "");
  const [savingEta, setSavingEta] = useState(false);
  const [savedEta, setSavedEta] = useState(false);

  const supplierTotalCents = rows.reduce((sum, r) => {
    const v = Number(prices[r.key]);
    if (!Number.isFinite(v) || v < 0) return sum;
    return sum + Math.round(v * 100) * r.quantity;
  }, 0);

  async function savePrices() {
    setError(null);
    setSavedPrices(false);
    const costs: { lineItemId: string; unitCostCents: number | null }[] = [];
    for (const r of rows) {
      const raw = (prices[r.key] ?? "").trim();
      let cents: number | null = null;
      if (raw !== "") {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0) {
          return setError(`Enter a valid non-negative price for ${r.primary}.`);
        }
        cents = Math.round(v * 100);
      }
      // A raw-blank group's per-piece price applies to every SKU it covers.
      for (const id of r.lineItemIds) costs.push({ lineItemId: id, unitCostCents: cents });
    }
    setSavingPrices(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/line-costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save prices.");
      } else {
        setSavedPrices(true);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSavingPrices(false);
    }
  }

  async function saveEta() {
    setError(null);
    setSavedEta(false);
    setSavingEta(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/eta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDeliveryDate: eta ? eta : null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save the ETA.");
      } else {
        setSavedEta(true);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSavingEta(false);
    }
  }

  async function setStage(toStage: string) {
    setError(null);
    setSavingStage(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/sub-set-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't update the stage.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSavingStage(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">What this sub-PO covers</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Line items live on the master; this supplier drives them through its own
            stages. Set the per-unit supplier price on the right.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "waiting" ? (
            <Badge className="bg-amber-50 text-amber-700">Waiting on previous stage</Badge>
          ) : status === "done" ? (
            <Badge className="bg-emerald-50 text-emerald-700">Completed</Badge>
          ) : (
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <span>Stage</span>
              <select
                value={currentStage ?? ""}
                disabled={savingStage}
                onChange={(e) => setStage(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
              >
                {stageOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              {isRawBlank ? (
                <>
                  <TableHead>Raw blank</TableHead>
                  <TableHead>Covers (finished SKUs)</TableHead>
                </>
              ) : (
                <>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                </>
              )}
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead className="text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-zinc-400">
                  No items on the master.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  {isRawBlank ? (
                    <>
                      <TableCell>
                        {stagePrefix && (
                          <span className="font-semibold text-red-600">{stagePrefix} — </span>
                        )}
                        <span className="font-medium text-zinc-900">{r.primary}</span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {r.covers && r.covers.length > 0 ? (
                          <ul className="space-y-0.5">
                            {r.covers.map((c) => (
                              <li key={c.sku}>
                                <span className="font-mono text-zinc-600">{c.sku}</span>
                                {c.title && (
                                  <span className="ml-1 text-zinc-400">— {c.title}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell>
                        {stagePrefix && (
                          <span className="font-semibold text-red-600">{stagePrefix} — </span>
                        )}
                        {r.primary}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right text-zinc-500">{r.quantity}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-zinc-400">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 text-right"
                        placeholder="0.00"
                        value={prices[r.key] ?? ""}
                        onChange={(e) => {
                          setPrices((p) => ({ ...p, [r.key]: e.target.value }));
                          setSavedPrices(false);
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-zinc-900">
                    {(() => {
                      const v = Number(prices[r.key]);
                      return (prices[r.key] ?? "").trim() !== "" &&
                        Number.isFinite(v) &&
                        v >= 0
                        ? fmtMoney(Math.round(v * 100) * r.quantity)
                        : "—";
                    })()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={savingPrices} onClick={savePrices}>
            {savingPrices ? "Saving…" : "Save prices"}
          </Button>
          {savedPrices && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
        <div className="flex items-baseline">
          <span className="text-sm text-zinc-500">Supplier total</span>
          <span className="ml-3 text-base font-semibold text-zinc-900">
            {fmtMoney(supplierTotalCents)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="font-medium">ETA / expected delivery</span>
          <Input
            type="date"
            className="w-44"
            value={eta}
            onChange={(e) => {
              setEta(e.target.value);
              setSavedEta(false);
            }}
          />
        </label>
        <Button size="sm" variant="outline" disabled={savingEta} onClick={saveEta}>
          {savingEta ? "Saving…" : "Save ETA"}
        </Button>
        {savedEta && <span className="text-xs text-emerald-600">Saved</span>}
        <span className="ml-auto text-xs text-zinc-400">
          This sub-PO&apos;s own delivery date.
        </span>
      </div>
    </Card>
  );
}
