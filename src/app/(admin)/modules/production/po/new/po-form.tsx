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
import { type ProductionStage } from "@/lib/production/stages";
import {
  isStageOn,
  toggleStageChip,
} from "@/lib/production/stage-eta-seeder";
import { useStageLabels, useStageOrder } from "@/components/production/stage-labels-provider";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";
import { SearchableSelectWithAdd } from "@/components/forms/searchable-select";
import {
  CompanyForm,
  emptyCompanyDraft,
  type CompanyDraft,
} from "@/components/production/company-form";
import {
  SupplierForm,
  emptySupplierDraft,
  type SupplierDraft,
} from "@/components/production/supplier-form";

export interface CompanyOption {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  address: string | null;
  customerId: string | null;
  priceTierId: string | null;
  tierName: string | null;
  tierDiscount: number | null;
  depositPercent: number;
  notes: string | null;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
}

export interface SupplierOption {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  shippingAddress: string | null;
  notes: string | null;
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
  /** Per-line stage subset (ordered). `null` = inherit the PO pipeline. */
  stages: string[] | null;
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
  /** Per-line stage subset. `null` = inherit the PO pipeline; an explicit
   *  list is the ordered subset of stages this line walks. The UI's chip
   *  picker writes `null` whenever the user has "all stages on", so the DB
   *  side never has to distinguish [all-checked] from [inherit]. */
  stages: string[] | null;
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
    stages: null,
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
    stages: line.stages && line.stages.length > 0 ? [...line.stages] : null,
  };
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const rowLabel = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-400";
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
  invoiceId,
  submitLabel,
  defaultSupplierId,
}: {
  suppliers: SupplierOption[];
  companies: CompanyOption[];
  priceTiers?: { id: string; name: string; discountPercent: number }[];
  initial?: PoFormInitial;
  poId?: string;
  // When set, the created PO is linked back to this invoice (sets sourcePoId).
  invoiceId?: string;
  // Override the create-mode submit button label (default "Create PO").
  submitLabel?: string;
  /** Pre-select this supplier (e.g. "Create PO" from a supplier page). */
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const stageLabels = useStageLabels();
  const stageOrder = useStageOrder();
  // Assignable stages = work stages between the opening + terminal bookends.
  const ASSIGNABLE_STAGES = stageOrder.slice(1, -1);
  const isEdit = !!poId;

  // Selected supplier(s). One = single-supplier PO; more than one = a
  // multi-supplier (master) PO split by stage into sub-POs.
  const [supplierIds, setSupplierIds] = useState<string[]>(() => {
    if (!initial) return defaultSupplierId ? [defaultSupplierId] : [];
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

  // Inline supplier form: shared for "+ Add new supplier" and "Edit supplier".
  // null = closed, "new" = create mode, an id = edit mode for that supplier.
  const [supplierEditing, setSupplierEditing] = useState<string | "new" | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>(emptySupplierDraft());
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  function supplierOptionToDraft(s: SupplierOption): SupplierDraft {
    return {
      name: s.name,
      contactName: s.contactName ?? "",
      contactEmail: s.contactEmail ?? "",
      phone: s.phone ?? "",
      shippingAddress: s.shippingAddress ?? "",
      notes: s.notes ?? "",
    };
  }
  function openNewSupplier() {
    setSupplierDraft(emptySupplierDraft());
    setSupplierError(null);
    setSupplierEditing("new");
  }
  function openEditSupplier(id: string) {
    const s = supplierList.find((x) => x.id === id);
    if (!s) return;
    setSupplierDraft(supplierOptionToDraft(s));
    setSupplierError(null);
    setSupplierEditing(id);
  }
  function closeSupplierForm() {
    setSupplierEditing(null);
    setSupplierError(null);
  }

  async function saveSupplier() {
    setSupplierError(null);
    if (!supplierDraft.name.trim()) return setSupplierError("Supplier name is required.");
    if (supplierEditing == null) return;
    const isNew = supplierEditing === "new";
    setSupplierBusy(true);
    try {
      const url = isNew
        ? "/api/production/suppliers"
        : `/api/production/suppliers/${supplierEditing}`;
      const body = JSON.stringify({
        name: supplierDraft.name.trim(),
        contactName: supplierDraft.contactName.trim() || null,
        contactEmail: supplierDraft.contactEmail.trim() || null,
        phone: supplierDraft.phone.trim() || null,
        shippingAddress: supplierDraft.shippingAddress.trim() || null,
        notes: supplierDraft.notes.trim() || null,
      });
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSupplierError(d.error || "Couldn't save supplier.");
        setSupplierBusy(false);
        return;
      }
      const id = isNew ? (d.data.id as string) : (supplierEditing as string);
      const next: SupplierOption = {
        id,
        name: supplierDraft.name.trim(),
        contactName: supplierDraft.contactName.trim() || null,
        contactEmail: supplierDraft.contactEmail.trim() || null,
        phone: supplierDraft.phone.trim() || null,
        shippingAddress: supplierDraft.shippingAddress.trim() || null,
        notes: supplierDraft.notes.trim() || null,
      };
      setSupplierList((list) =>
        isNew ? [...list, next] : list.map((s) => (s.id === id ? next : s)),
      );
      if (isNew) addSupplier(id);
      setSupplierEditing(null);
    } catch {
      setSupplierError("Network error — please try again.");
    } finally {
      setSupplierBusy(false);
    }
  }

  // Inline customer form: shared for "+ Add new customer" and "Edit customer".
  const [customerEditing, setCustomerEditing] = useState<string | "new" | null>(null);
  const [customerDraft, setCustomerDraft] = useState<CompanyDraft>(emptyCompanyDraft());
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  function companyOptionToDraft(c: CompanyOption): CompanyDraft {
    return {
      name: c.name,
      contactName: c.contactName ?? "",
      contactEmail: c.contactEmail ?? "",
      address: c.address ?? "",
      customerId: c.customerId ?? "",
      priceTierId: c.priceTierId ?? "",
      assignedCollectionIds: c.assignedCollectionIds,
      assignedProductIds: c.assignedProductIds,
      depositPercent: c.depositPercent > 0 ? String(c.depositPercent) : "",
      notes: c.notes ?? "",
    };
  }
  function openNewCustomer() {
    setCustomerDraft(emptyCompanyDraft());
    setCustomerError(null);
    setCustomerEditing("new");
  }
  function openEditCustomer() {
    const c = companyList.find((x) => x.id === companyId);
    if (!c) return;
    setCustomerDraft(companyOptionToDraft(c));
    setCustomerError(null);
    setCustomerEditing(c.id);
  }
  function closeCustomerForm() {
    setCustomerEditing(null);
    setCustomerError(null);
  }

  async function saveCustomer() {
    setCustomerError(null);
    if (!customerDraft.name.trim()) return setCustomerError("Customer name is required.");
    if (customerEditing == null) return;
    const isNew = customerEditing === "new";
    setCustomerBusy(true);
    try {
      const url = isNew
        ? "/api/production/companies"
        : `/api/production/companies/${customerEditing}`;
      const body = JSON.stringify({
        name: customerDraft.name.trim(),
        contactName: customerDraft.contactName.trim() || null,
        contactEmail: customerDraft.contactEmail.trim() || null,
        address: customerDraft.address.trim() || null,
        customerId: customerDraft.customerId || null,
        priceTierId: customerDraft.priceTierId || null,
        assignedCollectionIds: customerDraft.assignedCollectionIds,
        assignedProductIds: customerDraft.assignedProductIds,
        depositPercent: customerDraft.depositPercent.trim()
          ? Number(customerDraft.depositPercent)
          : 0,
        notes: customerDraft.notes.trim() || null,
      });
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCustomerError(d.error || "Couldn't save customer.");
        setCustomerBusy(false);
        return;
      }
      const tier = priceTiers.find((t) => t.id === customerDraft.priceTierId);
      const id = isNew ? (d.data.id as string) : (customerEditing as string);
      const next: CompanyOption = {
        id,
        name: customerDraft.name.trim(),
        contactName: customerDraft.contactName.trim() || null,
        contactEmail: customerDraft.contactEmail.trim() || null,
        address: customerDraft.address.trim() || null,
        customerId: customerDraft.customerId || null,
        priceTierId: customerDraft.priceTierId || null,
        tierName: tier?.name ?? null,
        tierDiscount: tier?.discountPercent ?? null,
        depositPercent: customerDraft.depositPercent.trim()
          ? Number(customerDraft.depositPercent)
          : 0,
        notes: customerDraft.notes.trim() || null,
        assignedCollectionIds: customerDraft.assignedCollectionIds,
        assignedProductIds: customerDraft.assignedProductIds,
      };
      setCompanyList((list) =>
        isNew ? [...list, next] : list.map((c) => (c.id === id ? next : c)),
      );
      if (isNew) setCompanyId(id);
      setCustomerEditing(null);
    } catch {
      setCustomerError("Network error — please try again.");
    } finally {
      setCustomerBusy(false);
    }
  }

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
    // The master's primary (fallback) supplier: the first-work-stage owner on a
    // multi-supplier PO (so the opening state routes there), else the lone one.
    const firstWorkStage = stageOrder[1];
    const primaryId = multiSupplier
      ? stageOwners[firstWorkStage] || supplierIds[0]
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
        // Only persist `stages` when the user picked an explicit subset; the
        // service treats null / [] as "inherit pipeline".
        stages: r.stages && r.stages.length > 0 ? r.stages : null,
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
            // On a multi-supplier PO the ETA is set per sub-PO (the master's is
            // derived = latest sub-PO), so don't push a master-level ETA.
            expectedDeliveryDate: multiSupplier ? null : expectedDeliveryDate || null,
            notes: notes.trim() || null,
            companyId: companyId || null,
            shopifyLocationId: locationId || null,
            locationName: locationName || null,
            // `lockStagesTogether` intentionally omitted on create — the
            // schema default (true) applies. Toggle it from the PO detail page
            // ("Move all stages together") if a PO needs per-line moves later.
            ...(!isEdit && invoiceId ? { invoiceId } : {}),
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
            <SearchableSelectWithAdd
              value=""
              onChange={addSupplier}
              items={supplierList
                .filter((s) => !supplierIds.includes(s.id))
                .map((s) => ({
                  id: s.id,
                  label: s.name,
                  detail: s.contactEmail || s.contactName || null,
                  searchText: [
                    s.name,
                    s.contactName ?? "",
                    s.contactEmail ?? "",
                    s.shippingAddress ?? "",
                  ]
                    .join(" ")
                    .toLowerCase(),
                }))}
              placeholder={
                supplierIds.length ? "Add another supplier…" : "Select a supplier…"
              }
              addLabel="+ Add new supplier"
              searchPlaceholder="Search by name, contact, email, address…"
              disabled={supplierEditing !== null}
              onAddNew={openNewSupplier}
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
              title={
                multiSupplier
                  ? "Set per sub-PO on a multi-supplier PO"
                  : undefined
              }
              value={multiSupplier ? "" : expectedDeliveryDate}
              disabled={multiSupplier}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
            {multiSupplier && (
              <p className="mt-1 text-xs text-zinc-400">
                Each supplier sets their own ETA on their sub-PO.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Customer (optional)</label>
            <SearchableSelectWithAdd
              value={companyId}
              onChange={setCompanyId}
              items={companyList.map((c) => ({
                id: c.id,
                label: c.name,
                detail: [c.tierName, c.contactEmail].filter(Boolean).join(" · ") || null,
                searchText: [
                  c.name,
                  c.contactName ?? "",
                  c.contactEmail ?? "",
                  c.address ?? "",
                  c.tierName ?? "",
                ]
                  .join(" ")
                  .toLowerCase(),
              }))}
              placeholder="Select a customer…"
              addLabel="+ Add new customer"
              searchPlaceholder="Search by name, contact, email…"
              disabled={customerEditing !== null}
              onAddNew={openNewCustomer}
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

        {/* Selected-customer details (read-only) + Edit-customer button.
            Lives inside the top card so all order-header context — suppliers,
            customer, dates, warehouse, PO notes — is grouped together. */}
        {customerEditing === null && selectedCompany && (
          <CompanyDetailsSection
            customer={selectedCompany}
            onEdit={openEditCustomer}
          />
        )}
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <label className={fieldLabel}>PO notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Notes for this PO only — not saved to the supplier or customer record.
          </p>
        </div>
      </Card>

      {/* Per-supplier read-only details card with Edit/Remove buttons. */}
      {supplierEditing === null && supplierIds.length > 0 && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Supplier details</h2>
          <div className="mt-3 space-y-3">
            {supplierIds.map((id) => {
              const s = supplierList.find((x) => x.id === id);
              if (!s) return null;
              return (
                <SupplierDetailsRow
                  key={id}
                  supplier={s}
                  onEdit={() => openEditSupplier(id)}
                  onRemove={() => removeSupplier(id)}
                />
              );
            })}
          </div>
        </Card>
      )}

      {supplierEditing !== null && (
        <SupplierForm
          title={supplierEditing === "new" ? "New supplier" : "Edit supplier"}
          draft={supplierDraft}
          setDraft={setSupplierDraft}
          busy={supplierBusy}
          error={supplierError}
          onCancel={closeSupplierForm}
          onSave={saveSupplier}
        />
      )}

      {customerEditing !== null && (
        <CompanyForm
          title={customerEditing === "new" ? "New customer" : "Edit customer"}
          draft={customerDraft}
          setDraft={setCustomerDraft}
          priceTiers={priceTiers}
          busy={customerBusy}
          error={customerError}
          onCancel={closeCustomerForm}
          onSave={saveCustomer}
        />
      )}

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

        <div className="mt-4 space-y-4">
          {rows.map((r, i) => {
            const taken = new Set(
              rows.filter((_, j) => j !== i).map((x) => x.variantKey).filter(Boolean),
            );
            // Warehouse options for this row, keeping a stored value visible.
            const rowLoc =
              r.locationId && r.locationName && !locations.some((o) => o.id === r.locationId)
                ? [{ id: r.locationId, name: r.locationName }, ...locations]
                : locations;
            // Per-row line total (qty × unit cost). Null = can't compute yet
            // (multi-supplier sets cost per sub-PO, or the fields aren't valid).
            const rowQty = Number(r.quantity);
            const rowCost = Number(r.unitCost);
            const lineCents =
              !multiSupplier &&
              Number.isFinite(rowQty) &&
              rowQty > 0 &&
              Number.isFinite(rowCost) &&
              rowCost >= 0 &&
              r.unitCost.trim() !== ""
                ? Math.round(rowCost * 100) * rowQty
                : null;
            return (
              <div key={r.id ?? `new-${i}`} className="space-y-1.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <label className={rowLabel}>Product</label>
                    {catalogError ? (
                      <div className="flex gap-2">
                        <Input
                          className="w-32"
                          placeholder="SKU"
                          value={r.sku}
                          onChange={(e) => updateRow(i, { sku: e.target.value })}
                        />
                        <Input
                          className="min-w-[140px] flex-1"
                          placeholder="Title"
                          value={r.title}
                          onChange={(e) => updateRow(i, { title: e.target.value })}
                        />
                      </div>
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
                  </div>
                  <div>
                    <label className={rowLabel}>QTY</label>
                    <Input
                      className="w-20"
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={r.quantity}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={rowLabel}>Unit cost</label>
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
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => updateRow(i, { unitCost: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={rowLabel}>Line total</label>
                    <div className="flex h-10 w-24 items-center justify-end px-2 text-sm font-medium tabular-nums text-zinc-700">
                      {lineCents == null ? <span className="text-zinc-300">—</span> : fmtMoney(lineCents)}
                    </div>
                  </div>
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

                {/* Per-line stage subset. Default is "all stages on" (inherit
                  *  the PO pipeline). Toggling a chip off omits that stage from
                  *  this line's walk — used for SKUs like spring bars that skip
                  *  EDM/polishing/logo/plating/qc. The opening + terminal
                  *  bookends are always implicitly on. */}
                <LineStagesChips
                  stages={stageOrder}
                  stageLabels={stageLabels}
                  value={r.stages}
                  onChange={(next) => updateRow(i, { stages: next })}
                />

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
              <span className="text-sm text-zinc-500">Total cost (USD)</span>
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
          {submitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : (submitLabel ?? "Create PO")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Per-line stage subset picker. Renders all WORK stages (between the opening
 * bookend and the terminal `complete` sentinel) as toggleable chips. Default
 * state = every chip on, which serializes as `null` (inherit the PO pipeline).
 * Toggling any chip off "opts in" to an explicit subset — the bookends are
 * always retained, so the persisted list is `[opening, ...checked, terminal]`.
 *
 * The opening (`supplier_po`) and terminal (`complete`) stages are shown
 * read-only so the user understands they're part of every line.
 */
function LineStagesChips({
  stages,
  stageLabels,
  value,
  onChange,
}: {
  stages: readonly string[];
  stageLabels: Record<string, string>;
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  if (stages.length < 3) return null; // no work stages to skip
  const opening = stages[0];
  const terminal = stages[stages.length - 1];
  const workStages = stages.slice(1, -1);

  // Pure toggle logic lives in stage-eta-seeder so it's unit-tested without
  // mounting React.
  const isOn = (stage: string) => isStageOn(stage, value);
  const toggle = (stage: string) =>
    onChange(toggleStageChip(stage, stages, value));

  const inherits = value === null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
      <span className="text-[11px] uppercase tracking-wider text-zinc-400">
        Stages
      </span>
      <span
        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500"
        title="Every line starts here"
      >
        {stageLabels[opening] ?? opening}
      </span>
      {workStages.map((s) => {
        const on = isOn(s);
        return (
          <button
            type="button"
            key={s}
            onClick={() => toggle(s)}
            className={
              "rounded-md border px-2 py-0.5 text-[11px] transition-colors " +
              (on
                ? "border-zinc-800 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 line-through")
            }
            aria-pressed={on}
          >
            {stageLabels[s] ?? s}
          </button>
        );
      })}
      <span
        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500"
        title="Every line ends here"
      >
        {stageLabels[terminal] ?? terminal}
      </span>
      {!inherits && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
        >
          reset
        </button>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-0.5 whitespace-pre-line text-sm text-zinc-700">
        {value && value.trim() ? value : <span className="text-zinc-300">—</span>}
      </div>
    </div>
  );
}

/** One supplier's full info shown in the "Supplier details" card, with Edit
 *  and Remove buttons. Multiple of these stack on a multi-supplier PO. */
function SupplierDetailsRow({
  supplier,
  onEdit,
  onRemove,
}: {
  supplier: SupplierOption;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{supplier.name}</div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit supplier
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Contact name" value={supplier.contactName} />
        <DetailField label="Contact email" value={supplier.contactEmail} />
        <div className="sm:col-span-2">
          <DetailField label="Shipping address" value={supplier.shippingAddress} />
        </div>
        <div className="sm:col-span-2">
          <DetailField label="Supplier notes" value={supplier.notes} />
        </div>
      </div>
    </div>
  );
}

/** Read-only summary of every saved field on the selected B2B customer + an
 *  Edit button that opens the full CompanyForm pre-filled. Renders as a
 *  section (no outer Card) so it can nest inside the PO header card. */
function CompanyDetailsSection({
  customer,
  onEdit,
}: {
  customer: CompanyOption;
  onEdit: () => void;
}) {
  const restrictionText =
    customer.assignedCollectionIds.length === 0 && customer.assignedProductIds.length === 0
      ? "Full catalog"
      : [
          customer.assignedCollectionIds.length > 0 &&
            `${customer.assignedCollectionIds.length} collection${customer.assignedCollectionIds.length === 1 ? "" : "s"}`,
          customer.assignedProductIds.length > 0 &&
            `${customer.assignedProductIds.length} product${customer.assignedProductIds.length === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" + ");
  return (
    <div className="mt-6 border-t border-zinc-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900">Customer details</h3>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit customer
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="Name" value={customer.name} />
        <DetailField
          label="Price tier"
          value={
            customer.tierName
              ? `${customer.tierName} (${customer.tierDiscount ?? 0}% off)`
              : null
          }
        />
        <DetailField label="Contact name" value={customer.contactName} />
        <DetailField label="Contact email" value={customer.contactEmail} />
        <DetailField
          label="Deposit"
          value={customer.depositPercent > 0 ? `${customer.depositPercent}%` : "Pay in full"}
        />
        <DetailField label="Shopify link" value={customer.customerId ? "✓ Linked" : null} />
        <DetailField label="Order restriction" value={restrictionText} />
        <div className="sm:col-span-2">
          <DetailField label="Address" value={customer.address} />
        </div>
        <div className="sm:col-span-2">
          <DetailField label="Customer notes" value={customer.notes} />
        </div>
      </div>
    </div>
  );
}
