"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeInvoiceTotals,
  netLineDisplays,
  netUnitPriceCents,
} from "@/lib/invoicing/invoicing";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";
import { LineItemRow, LineItemsHeader, LineItemsTotal } from "@/components/invoicing/line-item-row";
import type { CompanyAddress } from "@/lib/portal/addresses";
import {
  CompanyForm,
  emptyCompanyDraft,
  type CompanyDraft,
} from "@/components/production/company-form";
import { SearchableSelectWithAdd } from "@/components/forms/searchable-select";

export interface InvoiceCompanyOption {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  address: string | null;
  customerId: string | null; // linked Shopify customer
  priceTierId: string | null;
  tierName: string | null;
  tierDiscount: number; // percent
  depositPercent: number;
  allowWirePayment: boolean;
  notes: string | null;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
}

export interface PriceTierOption {
  id: string;
  name: string;
  discountPercent: number;
}

export interface InvoiceFormInitial {
  companyId: string;
  companyName: string;
  tierDiscount: number;
  /** Per-invoice deposit override. null = follow the brand's default at send time. */
  depositPercent: number | null;
  issuedDate: string;
  dueDate: string;
  notes: string;
  /** The order's primary ship-to address id (split fulfillment). */
  shipToAddressId?: string;
  lineItems: {
    id: string;
    sku: string;
    title: string;
    quantity: number;
    unitPriceCents: number;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
    /** The line's per-line ship-to address id (split fulfillment). */
    addressId?: string;
  }[];
}

interface Row {
  variantKey: string;
  shopifyProductId: string;
  sku: string;
  title: string;
  quantity: string;
  unitPrice: string; // dollars
  /** Per-line split-fulfillment address id ("" = ship to the order's default). */
  addressId: string;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

function addressOptionLabel(a: CompanyAddress): string {
  return [a.name || a.company, a.address1, a.city, a.provinceCode ?? a.province, a.zip]
    .filter(Boolean)
    .join(", ");
}

function emptyRow(): Row {
  return { variantKey: "", shopifyProductId: "", sku: "", title: "", quantity: "1", unitPrice: "", addressId: "" };
}

export function InvoiceForm({
  companies,
  priceTiers = [],
  initial,
  invoiceId,
  sourcePoId,
  defaultCompanyId,
}: {
  companies: InvoiceCompanyOption[];
  priceTiers?: PriceTierOption[];
  initial?: InvoiceFormInitial;
  invoiceId?: string;
  /** When creating from a PO: links the invoice back + blocks a second one. */
  sourcePoId?: string;
  /** Pre-select this customer (e.g. "Create B2B Order" from a brand page). */
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const isEdit = !!invoiceId;

  const [companyId, setCompanyId] = useState(
    initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
  );
  // Local, appendable copy so a newly-added company shows + selects inline.
  const [companyList, setCompanyList] = useState(companies);
  const [issuedDate, setIssuedDate] = useState(
    initial?.issuedDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // Per-invoice deposit override as a string so an empty field = "inherit from
  // brand" (vs 0 = "explicitly no deposit on this invoice"). Pre-fills from
  // the existing override; otherwise blank (inherit).
  const [depositOverride, setDepositOverride] = useState(
    initial?.depositPercent != null ? String(initial.depositPercent) : "",
  );
  const [rows, setRows] = useState<Row[]>(
    initial
      ? initial.lineItems.map((l) => ({
          variantKey: l.shopifyVariantId ?? "",
          shopifyProductId: l.shopifyProductId ?? "",
          sku: l.sku,
          title: l.title,
          quantity: String(l.quantity),
          unitPrice: (l.unitPriceCents / 100).toString(),
          addressId: l.addressId ?? "",
        }))
      : [emptyRow()],
  );
  // Ship-to / split fulfillment.
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [orderAddressId, setOrderAddressId] = useState(initial?.shipToAddressId ?? "");
  const [split, setSplit] = useState<boolean>(
    !!initial?.lineItems.some((l) => l.addressId),
  );

  // Load the selected company's saved Shopify addresses for the ship-to picker.
  useEffect(() => {
    if (!companyId) {
      setAddresses([]);
      return;
    }
    let active = true;
    fetch(`/api/production/companies/${companyId}/addresses`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.data) return;
        const addrs = d.data as CompanyAddress[];
        setAddresses(addrs);
        // Keep a valid selection; otherwise default to the company's default.
        setOrderAddressId((cur) =>
          addrs.some((a) => a.id === cur) ? cur : addrs.find((a) => a.isDefault)?.id || "",
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [companyId]);
  // Remember the last line's collection so a newly-added line defaults to it.
  const [lastCollectionId, setLastCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Inline customer form: shared for "+ Add new customer" and "Edit customer".
  // null = closed, "new" = create mode, an id = edit mode for that customer.
  const [customerEditing, setCustomerEditing] = useState<string | "new" | null>(null);
  const [customerDraft, setCustomerDraft] = useState<CompanyDraft>(emptyCompanyDraft());
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  function companyOptionToDraft(c: InvoiceCompanyOption): CompanyDraft {
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
      allowWirePayment: c.allowWirePayment,
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
        allowWirePayment: customerDraft.allowWirePayment,
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
      const next: InvoiceCompanyOption = {
        id,
        name: customerDraft.name.trim(),
        contactName: customerDraft.contactName.trim() || null,
        contactEmail: customerDraft.contactEmail.trim() || null,
        address: customerDraft.address.trim() || null,
        customerId: customerDraft.customerId || null,
        priceTierId: customerDraft.priceTierId || null,
        tierName: tier?.name ?? null,
        tierDiscount: tier?.discountPercent ?? 0,
        depositPercent: customerDraft.depositPercent.trim()
          ? Number(customerDraft.depositPercent)
          : 0,
        allowWirePayment: customerDraft.allowWirePayment,
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

  // Shared searchable product chooser (same component as the PO form).
  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = new Map(variants.map((v) => [v.shopifyVariantId, v]));

  // Effective tier discount (immutable company on edit).
  const discount = isEdit
    ? (initial?.tierDiscount ?? 0)
    : (companyList.find((c) => c.id === companyId)?.tierDiscount ?? 0);

  // Catalog restriction: on a new order, limit the picker to the selected
  // brand's assigned collections + products (empty = whole catalog). Skipped on
  // edit (the company is fixed and its assignments aren't loaded here).
  const selectedCompany = companyList.find((c) => c.id === companyId);
  const assignedColl = selectedCompany?.assignedCollectionIds ?? [];
  const assignedProd = selectedCompany?.assignedProductIds ?? [];
  const hasRestriction = !isEdit && (assignedColl.length > 0 || assignedProd.length > 0);
  const collSet = new Set(assignedColl);
  const prodSet = new Set(assignedProd);
  const allowedCollections = hasRestriction
    ? collections.filter((c) => collSet.has(c.id))
    : collections;
  const allowedVariantIds = new Set<string>();
  if (hasRestriction) {
    for (const c of collections)
      if (collSet.has(c.id)) for (const vid of c.variantIds) allowedVariantIds.add(vid);
    for (const v of variants)
      if (prodSet.has(v.shopifyProductId)) allowedVariantIds.add(v.shopifyVariantId);
  }
  const allowedVariants = hasRestriction
    ? variants.filter((v) => allowedVariantIds.has(v.shopifyVariantId))
    : variants;
  const restricted = hasRestriction && allowedVariants.length > 0;
  const pickerVariants = restricted ? allowedVariants : variants;

  const totalsLines = rows.map((r) => ({
    quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
    unitPriceCents: Math.max(0, Math.round(Number(r.unitPrice) * 100 || 0)),
  }));
  const totals = computeInvoiceTotals(totalsLines, discount);
  // Per-line NET totals (post-discount, footing to totals.totalCents) — used
  // to mirror the saved invoice view: line totals reflect what the customer
  // pays, no separate Subtotal/Discount rows.
  const netLines = netLineDisplays(totalsLines, discount, totals.totalCents);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  const primaryAddressLabel =
    addresses.find((a) => a.id === orderAddressId) != null
      ? addressOptionLabel(addresses.find((a) => a.id === orderAddressId)!)
      : null;
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }
  function rowFromVariant(v: CatalogVariant): Row {
    return {
      variantKey: v.shopifyVariantId,
      shopifyProductId: v.shopifyProductId,
      sku: v.sku,
      title: v.title + (v.variantTitle ? ` — ${v.variantTitle}` : ""),
      quantity: "1",
      unitPrice: (v.priceCents / 100).toString(),
      addressId: "",
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
    if (!companyId) return setError("Select a customer.");
    if (!issuedDate) return setError("Enter the issued date.");

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
        } else if (!sku) {
          return setError(`Line ${i + 1}: pick a product.`);
        }
      } else if (!sku || !title) {
        return setError(`Line ${i + 1}: SKU and title are required.`);
      }
      const quantity = Number(r.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return setError(`Line ${i + 1}: quantity must be a positive whole number.`);
      }
      const unitPriceCents = Math.round(Number(r.unitPrice) * 100);
      if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
        return setError(`Line ${i + 1}: unit price must be a non-negative amount.`);
      }
      lineItems.push({
        sku,
        title,
        quantity,
        unitPriceCents,
        shopifyProductId,
        shopifyVariantId,
        // Per-line override only when split is on (else ships to the default).
        addressId: split ? r.addressId || undefined : undefined,
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/invoices/${invoiceId}` : "/api/invoices",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { companyId, sourcePoId: sourcePoId ?? null }),
            issuedDate,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
            addressId: orderAddressId,
            // Empty input = inherit the brand's default at send time. Any
            // entered number (incl. 0) overrides for this invoice only.
            depositPercent:
              depositOverride.trim() === "" ? null : Number(depositOverride),
            lineItems,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEdit ? "Failed to save." : "Failed to create invoice."));
        setSubmitting(false);
        return;
      }
      router.push(`/invoices/${isEdit ? invoiceId : data.data.id}`);
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
            <label className={fieldLabel}>Customer</label>
            {isEdit ? (
              <Input value={initial?.companyName ?? ""} disabled />
            ) : (
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
            )}
            <p className="mt-1 text-xs text-zinc-500">
              {discount > 0 ? (
                <Badge className="bg-emerald-50 text-emerald-700">{discount}% off retail</Badge>
              ) : (
                "No tier discount"
              )}
            </p>
            {restricted && (
              <p className="mt-1 text-xs text-zinc-500">
                Catalog limited to this customer’s assigned products/collections.
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={fieldLabel}>Issued date</label>
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel}>Due date (optional)</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel}>
                Deposit % (optional override)
              </label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={1}
                placeholder={
                  selectedCompany?.depositPercent
                    ? `Brand default: ${selectedCompany.depositPercent}%`
                    : "Brand default: none"
                }
                value={depositOverride}
                onChange={(e) => setDepositOverride(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                Leave blank to use the brand&apos;s default at send time. Set to 0
                to waive the deposit on this invoice only.
              </p>
            </div>
          </div>
        </div>
        {/* Selected-customer details (read-only) + Edit-customer button.
            Lives inside the top card so all order-header context — bill-to,
            dates, customer info, invoice notes — is grouped together. */}
        {customerEditing === null && selectedCompany && (
          <CustomerDetailsSection
            customer={selectedCompany}
            onEdit={openEditCustomer}
          />
        )}
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <label className={fieldLabel}>Invoice notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Notes for this invoice only — not saved to the customer record.
          </p>
        </div>
      </Card>

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

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </div>

        {catalogError && (
          <p className="mt-3 text-xs text-amber-600">
            Couldn’t load the Shopify catalog — enter SKU and title manually.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <LineItemsHeader />
          {rows.map((r, i) => {
            const taken = new Set(
              rows.filter((_, j) => j !== i).map((x) => x.variantKey).filter(Boolean),
            );
            // Per-row line total — NET (after partner-tier discount), to
            // mirror the saved invoice view. Shown only when qty + unit price
            // are valid.
            const rowQty = Number(r.quantity);
            const rowPrice = Number(r.unitPrice);
            const rowValid =
              Number.isFinite(rowQty) &&
              rowQty > 0 &&
              Number.isFinite(rowPrice) &&
              rowPrice >= 0 &&
              r.unitPrice.trim() !== "";
            const lineCents = rowValid ? netLines[i].netLineTotalCents : null;
            // Per-unit discount (retail unit − net unit), rounded the same
            // way the net unit display is rounded so the math reconciles.
            const rowUnitCents = rowValid ? Math.round(rowPrice * 100) : null;
            const unitDiscountCents =
              rowUnitCents != null
                ? rowUnitCents - netUnitPriceCents(rowUnitCents, discount)
                : null;
            return (
              <div key={i}>
                <LineItemRow
                product={
                  catalogError ? (
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
                      variants={pickerVariants}
                      collections={allowedCollections}
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
                          unitPrice: (v.priceCents / 100).toString(),
                        })
                      }
                      onSelectMany={(vs) => addManyAt(i, vs)}
                    />
                  )
                }
                qty={
                  <Input
                    className="w-20"
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={r.quantity}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  />
                }
                unitPrice={
                  <Input
                    className="w-28"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit $ (retail)"
                    value={r.unitPrice}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                  />
                }
                unitDiscountCents={unitDiscountCents}
                lineTotalCents={lineCents}
                onRemove={() => removeRow(i)}
                removeDisabled={rows.length === 1}
                />
                {split && addresses.length > 0 && (
                  <div className="mt-1 flex items-center gap-2 pl-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Ship to
                    </span>
                    <select
                      value={r.addressId}
                      onChange={(e) => updateRow(i, { addressId: e.target.value })}
                      className="h-9 max-w-[480px] flex-1 rounded-md border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
                    >
                      <option value="">
                        Same as default{primaryAddressLabel ? ` — ${primaryAddressLabel}` : ""}
                      </option>
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {addressOptionLabel(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <LineItemsTotal discountPercent={discount} totalCents={totals.totalCents} />

        {addresses.length > 0 && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <label className={fieldLabel}>{split ? "Default ship-to" : "Ship to"}</label>
            <select
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
              value={orderAddressId}
              onChange={(e) => setOrderAddressId(e.target.value)}
            >
              <option value="">— Select a delivery address —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {addressOptionLabel(a)}
                  {a.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={split}
                onChange={(e) => setSplit(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
              />
              Split fulfillment — ship some lines to different addresses
            </label>
            <p className="mt-1 text-xs text-zinc-400">
              {split
                ? "Pick a destination per line above; lines on “Same as default” ship to the address selected here. One invoice — recorded on the Shopify order (per-line “Ship to” + an order note)."
                : "The order's saved Shopify ship-to address. Synced to the Shopify draft order when the invoice is sent."}
            </p>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create invoice"}
        </Button>
      </div>
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

/** Read-only summary of every saved field on the selected B2B customer + an
 *  Edit button that opens the full CompanyForm pre-filled. Renders as a
 *  section (no outer Card) so it can nest inside the form's header card. */
function CustomerDetailsSection({
  customer,
  onEdit,
}: {
  customer: InvoiceCompanyOption;
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
              ? `${customer.tierName} (${customer.tierDiscount}% off)`
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
