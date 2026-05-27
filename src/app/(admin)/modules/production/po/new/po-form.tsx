"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ShopifyRef, ShopifyRefs } from "@/app/api/production/shopify-refs/route";
import { fmtMoney } from "@/lib/production/display";
import { STAGES, type ProductionStage } from "@/lib/production/stages";
import { useStageLabels } from "@/components/production/stage-labels-provider";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";
import { QuickAddSelect } from "@/components/forms/quick-add-select";

export interface CompanyOption {
  id: string;
  name: string;
  tierName: string | null;
  tierDiscount: number | null;
}

export interface EditableLine {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  unitCostCents: number | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  companyId: string | null;
  shopifyLocationId: string | null;
  locationName: string | null;
}

export interface PoFormInitial {
  supplierId: string;
  shopifyPoNumber: string;
  issuedDate: string;
  expectedDeliveryDate: string;
  notes: string;
  companyId: string;
  shopifyLocationId: string;
  locationName: string;
  lineItems: EditableLine[];
  stageAssignments?: { stage: string; supplierId: string }[];
  isMaster?: boolean; // edit: PO already split across suppliers (has sub-POs)
}

// Stages an admin can assign an owner to, in workflow order. "supplier_po" is
// the opening state (PO placed, nothing started) and "complete" is terminal —
// neither is real manufacturing work, so neither is assignable.
const ASSIGNABLE_STAGES = STAGES.filter(
  (s) => s !== "complete" && s !== "supplier_po",
);

interface LineItemRow {
  id?: string; // present = existing line (edit); absent = new line
  variantKey: string;
  shopifyProductId: string;
  sku: string;
  title: string;
  quantity: string;
  unitCost: string;
  companyId: string; // override of PO-level company ("" = inherit)
  locationId: string; // override of PO-level warehouse ("" = inherit)
  locationName: string;
}

function emptyRow(): LineItemRow {
  return {
    variantKey: "",
    shopifyProductId: "",
    sku: "",
    title: "",
    quantity: "1",
    unitCost: "",
    companyId: "",
    locationId: "",
    locationName: "",
  };
}

function toRow(line: EditableLine): LineItemRow {
  return {
    id: line.id,
    variantKey: line.shopifyVariantId ?? "",
    shopifyProductId: line.shopifyProductId ?? "",
    sku: line.sku,
    title: line.title,
    quantity: String(line.quantity),
    unitCost: line.unitCostCents != null ? String(line.unitCostCents / 100) : "",
    companyId: line.companyId ?? "",
    locationId: line.shopifyLocationId ?? "",
    locationName: line.locationName ?? "",
  };
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const selectSm =
  "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

/** Warehouse picker (Shopify location); keeps a stored value visible if the
 *  list couldn't load (missing scope). */
function WarehouseSelect({
  label,
  options,
  value,
  valueName,
  onChange,
}: {
  label: string;
  options: ShopifyRef[];
  value: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}) {
  const opts =
    value && valueName && !options.some((o) => o.id === value)
      ? [{ id: value, name: valueName }, ...options]
      : options;
  return (
    <div>
      <label className={fieldLabel}>{label}</label>
      <select
        className={inputBase}
        value={value}
        onChange={(e) =>
          onChange(e.target.value, opts.find((o) => o.id === e.target.value)?.name ?? "")
        }
      >
        <option value="">— none —</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PoForm({
  suppliers,
  companies,
  priceTiers = [],
  initial,
  poId,
}: {
  suppliers: { id: string; name: string }[];
  companies: CompanyOption[];
  priceTiers?: { id: string; name: string; discountPercent: number }[];
  initial?: PoFormInitial;
  poId?: string;
}) {
  const router = useRouter();
  const stageLabels = useStageLabels();
  const isEdit = !!poId;

  // Selected supplier(s). One = single-supplier PO; more than one = a
  // multi-supplier (master) PO split by stage into sub-POs.
  const [supplierIds, setSupplierIds] = useState<string[]>(() => {
    if (!initial) return [];
    if (initial.isMaster) {
      return [
        ...new Set([
          initial.supplierId,
          ...(initial.stageAssignments ?? []).map((a) => a.supplierId),
        ]),
      ].filter(Boolean);
    }
    return initial.supplierId ? [initial.supplierId] : [];
  });
  // Local, appendable copy so a newly-added supplier shows + selects inline.
  const [supplierList, setSupplierList] = useState(suppliers);
  const [issuedDate, setIssuedDate] = useState(
    initial?.issuedDate ?? new Date().toISOString().slice(0, 10),
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    initial?.expectedDeliveryDate ?? "",
  );
  const [lockStagesTogether, setLockStagesTogether] = useState(true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  // Local, appendable copy so a newly-added company shows + selects inline.
  const [companyList, setCompanyList] = useState(companies);
  const [locationId, setLocationId] = useState(initial?.shopifyLocationId ?? "");
  const [locationName, setLocationName] = useState(initial?.locationName ?? "");
  const [refs, setRefs] = useState<ShopifyRefs | null>(null);
  const [rows, setRows] = useState<LineItemRow[]>(
    initial ? initial.lineItems.map(toRow) : [emptyRow()],
  );
  // Remember the collection used on the last line, so a newly-added line defaults
  // to the same collection in its product picker.
  const [lastCollectionId, setLastCollectionId] = useState("");
  // Stage → supplier overrides ("" = falls back to the PO's primary supplier).
  const [stageOwners, setStageOwners] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const a of initial?.stageAssignments ?? []) m[a.stage] = a.supplierId;
    return m;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One supplier = single PO; more than one = a multi-supplier (master) PO.
  const multiSupplier = supplierIds.length > 1;
  function addSupplier(id: string) {
    if (id) setSupplierIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }
  function removeSupplier(id: string) {
    setSupplierIds((ids) => ids.filter((x) => x !== id));
    // Drop any stage assignments that pointed at the removed supplier.
    setStageOwners((o) => {
      const next = { ...o };
      for (const k of Object.keys(next)) if (next[k] === id) next[k] = "";
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    fetch("/api/production/shopify-refs")
      .then((r) => r.json())
      .then((d) => {
        if (active && d.data) setRefs(d.data as ShopifyRefs);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Shared catalog for the searchable product chooser (same component used on
  // the invoice form). On error we fall back to manual SKU/title entry.
  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = new Map(variants.map((v) => [v.shopifyVariantId, v]));
  const locations = refs?.locations ?? [];
  const selectedCompany = companyList.find((c) => c.id === companyId);

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
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }
  function rowFromVariant(v: CatalogVariant): LineItemRow {
    return {
      ...emptyRow(),
      variantKey: v.shopifyVariantId,
      shopifyProductId: v.shopifyProductId,
      sku: v.sku,
      title: v.title + (v.variantTitle ? ` — ${v.variantTitle}` : ""),
    };
  }
  // Batch add: fill the current row with the first pick, insert the rest after.
  function addManyAt(i: number, vs: CatalogVariant[]) {
    if (vs.length === 0) return;
    setRows((rs) => {
      const copy = [...rs];
      copy.splice(i, 1, ...vs.map(rowFromVariant));
      return copy;
    });
  }

  async function submit() {
    setError(null);
    if (supplierIds.length === 0) return setError("Select at least one supplier.");
    if (!issuedDate) return setError("Enter the issued date.");
    // Multi-supplier: every production stage must be assigned to a supplier first.
    if (multiSupplier && ASSIGNABLE_STAGES.some((s) => !stageOwners[s])) {
      return setError("Assign a supplier to every stage before saving.");
    }
    // The master's primary (fallback) supplier: the stamping owner on a
    // multi-supplier PO (so the opening state routes there), else the lone one.
    const primaryId = multiSupplier
      ? stageOwners["stamping"] || supplierIds[0]
      : supplierIds[0];

    const lineItems = [];
    for (const [i, r] of rows.entries()) {
      let sku = r.sku.trim();
      let title = r.title.trim();
      let shopifyProductId: string | null = r.shopifyProductId || null;
      let shopifyVariantId: string | null = r.variantKey || null;

      if (!catalogError) {
        const v = variantByKey.get(r.variantKey);
        if (v) {
          sku = v.sku;
          title = v.title + (v.variantTitle ? ` — ${v.variantTitle}` : "");
          shopifyProductId = v.shopifyProductId;
          shopifyVariantId = v.shopifyVariantId;
        } else if (!r.id || !sku) {
          return setError(`Line ${i + 1}: pick a product.`);
        }
      } else if (!sku || !title) {
        return setError(`Line ${i + 1}: SKU and title are required.`);
      }

      const quantity = Number(r.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return setError(`Line ${i + 1}: quantity must be a positive whole number.`);
      }
      // On a multi-supplier PO the unit cost comes from each sub-PO's prices.
      const unitCostCents = multiSupplier
        ? null
        : r.unitCost.trim()
          ? Math.round(Number(r.unitCost) * 100)
          : null;
      if (unitCostCents !== null && (!Number.isFinite(unitCostCents) || unitCostCents < 0)) {
        return setError(`Line ${i + 1}: unit cost must be a non-negative amount.`);
      }

      lineItems.push({
        ...(r.id ? { id: r.id } : {}),
        sku,
        title,
        quantity,
        unitCostCents,
        shopifyProductId,
        shopifyVariantId,
        companyId: r.companyId || null,
        shopifyLocationId: r.locationId || null,
        locationName: r.locationName || null,
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/production/po/${poId}` : "/api/production/po",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: primaryId,
            issuedDate,
            expectedDeliveryDate: expectedDeliveryDate || null,
            notes: notes.trim() || null,
            companyId: companyId || null,
            shopifyLocationId: locationId || null,
            locationName: locationName || null,
            ...(isEdit ? {} : { lockStagesTogether }),
            ...(!isEdit && multiSupplier
              ? {
                  multiSupplier: true,
                  stageAssignments: Object.entries(stageOwners)
                    .filter(([, v]) => v)
                    .map(([stage, supplierId]) => ({ stage, supplierId })),
                }
              : {}),
            lineItems,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEdit ? "Failed to save changes." : "Failed to create PO."));
        setSubmitting(false);
        return;
      }
      const savedId = isEdit ? (poId as string) : data.data.id;
      // Persist stage → supplier assignments (admin-only endpoint, best-effort).
      // Skipped for a multi-supplier create — the create route already set them
      // on the master while generating sub-POs.
      if (!(!isEdit && multiSupplier)) {
        try {
          await fetch(`/api/production/po/${savedId}/stage-assignments`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              multiSupplier,
              assignments: Object.entries(stageOwners)
                .filter(([, v]) => v)
                .map(([stage, supplierId]) => ({ stage, supplierId })),
            }),
          });
        } catch {
          /* non-fatal — the PO itself saved */
        }
      }
      router.push(`/modules/production/po/${savedId}`);
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
            <label className={fieldLabel}>Supplier(s)</label>
            {supplierIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {supplierIds.map((id) => {
                  const s = supplierList.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                    >
                      {s?.name ?? id}
                      <button
                        type="button"
                        onClick={() => removeSupplier(id)}
                        aria-label={`Remove ${s?.name ?? "supplier"}`}
                        className="text-zinc-400 hover:text-zinc-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <QuickAddSelect
              value=""
              onChange={addSupplier}
              options={[
                {
                  value: "",
                  label: supplierIds.length
                    ? "Add another supplier…"
                    : "Select a supplier…",
                },
                ...supplierList
                  .filter((s) => !supplierIds.includes(s.id))
                  .map((s) => ({ value: s.id, label: s.name })),
              ]}
              addLabel="Add new supplier"
              fields={[
                { key: "name", label: "Supplier name", required: true },
                { key: "contactEmail", label: "Contact email", type: "email" },
              ]}
              onCreate={async (vals) => {
                const res = await fetch("/api/production/suppliers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: vals.name?.trim(),
                    contactEmail: vals.contactEmail?.trim() || null,
                  }),
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok) return { error: d.error || "Couldn't add supplier." };
                setSupplierList((list) => [...list, { id: d.data.id, name: vals.name.trim() }]);
                return { id: d.data.id };
              }}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {multiSupplier
                ? "Multiple suppliers — assign each stage below."
                : "Pick one supplier, or add more for a multi-supplier PO."}
            </p>
          </div>
          <div>
            <label className={fieldLabel}>PO number</label>
            <Input
              value={isEdit ? (initial?.shopifyPoNumber ?? "") : ""}
              placeholder="Assigned automatically"
              disabled
            />
          </div>
          <div>
            <label className={fieldLabel}>Issued date</label>
            <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
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

        {!isEdit && (
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
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Customer (optional)</label>
            <QuickAddSelect
              value={companyId}
              onChange={setCompanyId}
              options={[
                { value: "", label: "— none —" },
                ...companyList.map((c) => ({
                  value: c.id,
                  label: c.tierName ? `${c.name} — ${c.tierName}` : c.name,
                })),
              ]}
              addLabel="Add new customer"
              fields={[
                { key: "name", label: "Customer name", required: true },
                { key: "contactEmail", label: "Contact email", type: "email" },
                {
                  key: "priceTierId",
                  label: "Price tier",
                  type: "select",
                  options: [
                    { value: "", label: "— No tier —" },
                    ...priceTiers.map((t) => ({
                      value: t.id,
                      label: `${t.name} (${t.discountPercent}% off)`,
                    })),
                  ],
                },
              ]}
              onCreate={async (vals) => {
                const res = await fetch("/api/production/companies", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: vals.name?.trim(),
                    contactEmail: vals.contactEmail?.trim() || null,
                    priceTierId: vals.priceTierId || null,
                  }),
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok) return { error: d.error || "Couldn't add company." };
                const tier = priceTiers.find((t) => t.id === vals.priceTierId);
                setCompanyList((list) => [
                  ...list,
                  {
                    id: d.data.id,
                    name: vals.name.trim(),
                    tierName: tier?.name ?? null,
                    tierDiscount: tier?.discountPercent ?? 0,
                  },
                ]);
                return { id: d.data.id };
              }}
            />
            {selectedCompany?.tierName && (
              <p className="mt-1 text-xs text-zinc-500">
                Price tier:{" "}
                <Badge className="bg-emerald-50 text-emerald-700">
                  {selectedCompany.tierName} ({selectedCompany.tierDiscount}% off retail)
                </Badge>
              </p>
            )}
          </div>
          <WarehouseSelect
            label="Warehouse (optional)"
            options={locations}
            value={locationId}
            valueName={locationName}
            onChange={(id, name) => {
              setLocationId(id);
              setLocationName(name);
            }}
          />
        </div>
        {refs && refs.unavailable.length > 0 && (
          <p className="mt-2 text-xs text-amber-600">
            {refs.unavailable.join(" & ")} need extra Shopify permissions (read_locations) to populate.
          </p>
        )}

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

      {/* Shown only for a multi-supplier PO; assign every stage before adding lines. */}
      {multiSupplier && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Assign stages to suppliers</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Each stage goes to one of the selected suppliers; each supplier gets
            their own sub-PO (00100-A, 00100-B…) to send. Assign every stage.
            {isEdit && " Saving regenerates the sub-POs to match."}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {ASSIGNABLE_STAGES.map((stage) => (
              <div key={stage} className="flex items-center gap-2">
                <label className="w-44 shrink-0 text-xs text-zinc-600">
                  {stageLabels[stage as ProductionStage]}
                </label>
                <select
                  className={`${selectSm} min-w-0 flex-1`}
                  value={stageOwners[stage] ?? ""}
                  onChange={(e) =>
                    setStageOwners((o) => ({ ...o, [stage]: e.target.value }))
                  }
                >
                  <option value="">— Select supplier —</option>
                  {supplierList
                    .filter((s) => supplierIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </div>

        {catalogLoading && (
          <p className="mt-3 text-xs text-zinc-400">Loading Shopify catalog…</p>
        )}
        {catalogError && (
          <p className="mt-3 text-xs text-amber-600">
            Couldn’t load the Shopify catalog — enter SKU and title manually.
          </p>
        )}

        <div className="mt-4 hidden items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 sm:flex">
          <span className="flex-1">Product</span>
          <span className="w-20">Qty</span>
          <span className="w-24">Unit cost</span>
          <span className="w-10" />
        </div>

        <div className="mt-2 space-y-4">
          {rows.map((r, i) => {
            const taken = new Set(
              rows.filter((_, j) => j !== i).map((x) => x.variantKey).filter(Boolean),
            );
            // Warehouse options for this row, keeping a stored value visible.
            const rowLoc =
              r.locationId && r.locationName && !locations.some((o) => o.id === r.locationId)
                ? [{ id: r.locationId, name: r.locationName }, ...locations]
                : locations;
            return (
              <div key={r.id ?? `new-${i}`} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {catalogError ? (
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
                  ) : (
                    <ProductCombobox
                      variants={variants}
                      collections={collections}
                      value={r.variantKey}
                      exclude={taken}
                      disabled={catalogLoading}
                      placeholder={catalogLoading ? "Loading catalog…" : "Search products…"}
                      initialCollectionId={lastCollectionId}
                      onCollectionChange={setLastCollectionId}
                      onSelect={(v) =>
                        updateRow(i, {
                          variantKey: v.shopifyVariantId,
                          shopifyProductId: v.shopifyProductId,
                          sku: v.sku,
                          title: v.title + (v.variantTitle ? ` — ${v.variantTitle}` : ""),
                        })
                      }
                      onSelectMany={(vs) => addManyAt(i, vs)}
                    />
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
                    placeholder={multiSupplier ? "—" : "Unit $"}
                    title={
                      multiSupplier
                        ? "Set per sub-PO on a multi-supplier PO"
                        : "Production cost per unit (not the Shopify retail price)"
                    }
                    value={multiSupplier ? "" : r.unitCost}
                    disabled={multiSupplier}
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

                {/* Optional per-line overrides of the PO-level company / warehouse. */}
                <div className="flex flex-wrap items-center gap-2 pl-0.5">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                    Override
                  </span>
                  <select
                    className={`${selectSm} min-w-[150px]`}
                    value={r.companyId}
                    onChange={(e) => updateRow(i, { companyId: e.target.value })}
                  >
                    <option value="">Customer: PO default</option>
                    {companyList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${selectSm} min-w-[150px]`}
                    value={r.locationId}
                    onChange={(e) =>
                      updateRow(i, {
                        locationId: e.target.value,
                        locationName:
                          rowLoc.find((o) => o.id === e.target.value)?.name ?? "",
                      })
                    }
                  >
                    <option value="">Warehouse: PO default</option>
                    {rowLoc.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
          {multiSupplier ? (
            <span className="text-sm text-zinc-500">
              Costs are set per sub-PO (after sending).
            </span>
          ) : (
            <>
              <span className="text-sm text-zinc-500">Total cost</span>
              <span className="ml-3 text-base font-semibold text-zinc-900">
                {fmtMoney(totalCents)}
              </span>
            </>
          )}
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create PO"}
        </Button>
      </div>
    </div>
  );
}
