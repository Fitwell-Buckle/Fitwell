"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { CatalogVariant } from "@/app/api/production/products/route";
import type { CatalogGroup } from "@/app/api/production/collections/route";
import { fmtMoney, skuSize } from "@/lib/production/display";

interface LineItemRow {
  collectionKey: string; // selected collection group id (grouped mode)
  variantKey: string; // shopifyVariantId when picked from catalog
  sku: string; // used in manual-entry fallback
  title: string; // used in manual-entry fallback
  quantity: string;
  unitCost: string; // production cost in dollars, converted to cents on submit
}

function emptyRow(): LineItemRow {
  return {
    collectionKey: "",
    variantKey: "",
    sku: "",
    title: "",
    quantity: "1",
    unitCost: "",
  };
}

type Mode = "loading" | "grouped" | "flat" | "manual";

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
// Same as inputBase but without w-full, for selects that flex-grow within a row.
const selectBase =
  "flex h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function variantLabel(v: CatalogVariant): string {
  const name = v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title;
  return v.sku ? `${v.sku} · ${name}` : name;
}

/** Sort variants by buckle size (16, 18, 20, 22…), SKU as tiebreaker. */
function sortBySize(variants: CatalogVariant[]): CatalogVariant[] {
  return [...variants].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
}

export function PoForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [shopifyPoNumber, setShopifyPoNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [lockStagesTogether, setLockStagesTogether] = useState(true);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineItemRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Catalog sources, tried in order: collections (grouped) → products (flat) →
  // manual entry. null while still loading/unattempted.
  const [groups, setGroups] = useState<CatalogGroup[] | null>(null);
  const [flat, setFlat] = useState<CatalogVariant[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/production/collections");
        const data = await res.json();
        if (!active) return;
        if (res.ok && Array.isArray(data.data) && data.data.length > 0) {
          const loaded = data.data as CatalogGroup[];
          setGroups(loaded);
          // Default any not-yet-set row to the "All Products" collection.
          const allProducts = loaded.find(
            (g) => g.title.trim().toLowerCase() === "all products",
          );
          if (allProducts) {
            setRows((rs) =>
              rs.map((r) =>
                r.collectionKey ? r : { ...r, collectionKey: allProducts.id },
              ),
            );
          }
          return;
        }
      } catch {
        /* fall through to flat catalog */
      }
      try {
        const res = await fetch("/api/production/products");
        const data = await res.json();
        if (!active) return;
        if (res.ok && Array.isArray(data.data) && data.data.length > 0) {
          setFlat(data.data as CatalogVariant[]);
          return;
        }
        setCatalogError(true);
      } catch {
        if (active) setCatalogError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const mode: Mode =
    groups && groups.length > 0
      ? "grouped"
      : flat && flat.length > 0
        ? "flat"
        : catalogError
          ? "manual"
          : "loading";

  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const flatByKey = new Map((flat ?? []).map((v) => [v.shopifyVariantId, v]));

  const totalCents = rows.reduce((sum, r) => {
    const qty = Number(r.quantity);
    const cost = Number(r.unitCost);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    if (!Number.isFinite(cost) || cost < 0) return sum;
    return sum + Math.round(cost * 100) * qty;
  }, 0);

  function updateRow(i: number, patch: Partial<LineItemRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    // Carry the previous line's collection forward — most POs stay within one.
    setRows((rs) => {
      const collectionKey = rs[rs.length - 1]?.collectionKey ?? "";
      return [...rs, { ...emptyRow(), collectionKey }];
    });
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    setError(null);

    if (!supplierId) return setError("Select a supplier.");
    if (!shopifyPoNumber.trim()) return setError("Enter the Shopify PO number.");
    if (!issuedDate) return setError("Enter the issued date.");

    const lineItems = [];
    for (const [i, r] of rows.entries()) {
      let sku = r.sku.trim();
      let title = r.title.trim();
      let shopifyProductId: string | null = null;
      let shopifyVariantId: string | null = null;

      if (mode === "grouped") {
        const group = groupById.get(r.collectionKey);
        if (!group) return setError(`Line ${i + 1}: pick a collection.`);
        const v = group.variants.find((x) => x.shopifyVariantId === r.variantKey);
        if (!v) return setError(`Line ${i + 1}: pick a product.`);
        sku = v.sku;
        title = v.title + (v.variantTitle ? ` — ${v.variantTitle}` : "");
        shopifyProductId = v.shopifyProductId;
        shopifyVariantId = v.shopifyVariantId;
      } else if (mode === "flat") {
        const v = flatByKey.get(r.variantKey);
        if (!v) return setError(`Line ${i + 1}: pick a product.`);
        sku = v.sku;
        title = v.title + (v.variantTitle ? ` — ${v.variantTitle}` : "");
        shopifyProductId = v.shopifyProductId;
        shopifyVariantId = v.shopifyVariantId;
      } else if (!sku || !title) {
        return setError(`Line ${i + 1}: SKU and title are required.`);
      }

      const quantity = Number(r.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return setError(`Line ${i + 1}: quantity must be a positive whole number.`);
      }
      const unitCostCents = r.unitCost.trim() ? Math.round(Number(r.unitCost) * 100) : null;
      if (unitCostCents !== null && (!Number.isFinite(unitCostCents) || unitCostCents < 0)) {
        return setError(`Line ${i + 1}: unit cost must be a non-negative amount.`);
      }

      lineItems.push({
        sku,
        title,
        quantity,
        unitCostCents,
        shopifyProductId,
        shopifyVariantId,
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/production/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          shopifyPoNumber: shopifyPoNumber.trim(),
          issuedDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          lockStagesTogether,
          notes: notes.trim() || null,
          lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create PO.");
        setSubmitting(false);
        return;
      }
      router.push(`/modules/production/po/${data.data.id}`);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputBase}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Shopify PO number</label>
            <Input
              value={shopifyPoNumber}
              onChange={(e) => setShopifyPoNumber(e.target.value)}
              placeholder="e.g. PO-1042"
            />
          </div>
          <div>
            <label className={fieldLabel}>Issued date</label>
            <Input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabel}>ETA / expected delivery (optional)</label>
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            id="lock"
            type="checkbox"
            checked={lockStagesTogether}
            onChange={(e) => setLockStagesTogether(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <label htmlFor="lock" className="text-sm text-zinc-700">
            Advance all line items together (uncheck to move items independently)
          </label>
        </div>

        <div className="mt-4">
          <label className={fieldLabel}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </div>

        {mode === "loading" && (
          <p className="mt-3 text-xs text-zinc-400">Loading Shopify catalog…</p>
        )}
        {mode === "manual" && (
          <p className="mt-3 text-xs text-amber-600">
            Couldn’t load the Shopify catalog — enter SKU and title manually.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {rows.map((r, i) => {
            const selectedGroup =
              mode === "grouped" ? groupById.get(r.collectionKey) : undefined;
            // Variants already chosen on other rows — hidden so nothing is added twice.
            const taken = new Set(
              rows
                .filter((_, j) => j !== i)
                .map((x) => x.variantKey)
                .filter(Boolean),
            );
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {mode === "grouped" ? (
                  <>
                    <select
                      className={`${selectBase} min-w-[150px] flex-1`}
                      value={r.collectionKey}
                      onChange={(e) =>
                        updateRow(i, { collectionKey: e.target.value, variantKey: "" })
                      }
                    >
                      <option value="">Collection…</option>
                      {groups!.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                    <select
                      className={`${selectBase} min-w-[200px] flex-[2]`}
                      value={r.variantKey}
                      disabled={!selectedGroup}
                      onChange={(e) => updateRow(i, { variantKey: e.target.value })}
                    >
                      <option value="">
                        {selectedGroup ? "Product…" : "Pick a collection first"}
                      </option>
                      {sortBySize(selectedGroup?.variants ?? [])
                        .filter((v) => !taken.has(v.shopifyVariantId))
                        .map((v) => (
                          <option key={v.shopifyVariantId} value={v.shopifyVariantId}>
                            {variantLabel(v)}
                          </option>
                        ))}
                    </select>
                  </>
                ) : mode === "flat" ? (
                  <select
                    className={`${selectBase} min-w-[220px] flex-1`}
                    value={r.variantKey}
                    onChange={(e) => updateRow(i, { variantKey: e.target.value })}
                  >
                    <option value="">Select a product…</option>
                    {sortBySize(flat!)
                      .filter((v) => !taken.has(v.shopifyVariantId))
                      .map((v) => (
                        <option key={v.shopifyVariantId} value={v.shopifyVariantId}>
                          {variantLabel(v)}
                        </option>
                      ))}
                  </select>
                ) : (
                  <>
                    <Input
                      className="w-32"
                      placeholder="SKU"
                      value={r.sku}
                      onChange={(e) => updateRow(i, { sku: e.target.value })}
                    />
                    <Input
                      className="w-auto min-w-[180px] flex-1"
                      placeholder="Title"
                      value={r.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                    />
                  </>
                )}
                <Input
                  className="w-20"
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={r.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit $"
                  title="Production cost per unit (not the Shopify retail price)"
                  value={r.unitCost}
                  onChange={(e) => updateRow(i, { unitCost: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  aria-label="Remove line"
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
          <span className="text-sm text-zinc-500">Total cost</span>
          <span className="ml-3 text-base font-semibold text-zinc-900">
            {fmtMoney(totalCents)}
          </span>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create PO"}
        </Button>
      </div>
    </div>
  );
}
