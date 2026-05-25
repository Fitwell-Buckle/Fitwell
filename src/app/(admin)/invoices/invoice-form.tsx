"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/production/display";
import { computeInvoiceTotals } from "@/lib/invoicing/invoicing";
import { ProductCombobox } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";
import { QuickAddSelect } from "@/components/forms/quick-add-select";

export interface InvoiceCompanyOption {
  id: string;
  name: string;
  tierName: string | null;
  tierDiscount: number; // percent
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
  issuedDate: string;
  dueDate: string;
  notes: string;
  lineItems: {
    id: string;
    sku: string;
    title: string;
    quantity: number;
    unitPriceCents: number;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
  }[];
}

interface Row {
  variantKey: string;
  shopifyProductId: string;
  sku: string;
  title: string;
  quantity: string;
  unitPrice: string; // dollars
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

function emptyRow(): Row {
  return { variantKey: "", shopifyProductId: "", sku: "", title: "", quantity: "1", unitPrice: "" };
}

export function InvoiceForm({
  companies,
  priceTiers = [],
  initial,
  invoiceId,
}: {
  companies: InvoiceCompanyOption[];
  priceTiers?: PriceTierOption[];
  initial?: InvoiceFormInitial;
  invoiceId?: string;
}) {
  const router = useRouter();
  const isEdit = !!invoiceId;

  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  // Local, appendable copy so a newly-added company shows + selects inline.
  const [companyList, setCompanyList] = useState(companies);
  const [issuedDate, setIssuedDate] = useState(
    initial?.issuedDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(
    initial
      ? initial.lineItems.map((l) => ({
          variantKey: l.shopifyVariantId ?? "",
          shopifyProductId: l.shopifyProductId ?? "",
          sku: l.sku,
          title: l.title,
          quantity: String(l.quantity),
          unitPrice: (l.unitPriceCents / 100).toString(),
        }))
      : [emptyRow()],
  );
  // Remember the last line's collection so a newly-added line defaults to it.
  const [lastCollectionId, setLastCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Shared searchable product chooser (same component as the PO form).
  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = new Map(variants.map((v) => [v.shopifyVariantId, v]));

  // Effective tier discount (immutable company on edit).
  const discount = isEdit
    ? (initial?.tierDiscount ?? 0)
    : (companyList.find((c) => c.id === companyId)?.tierDiscount ?? 0);

  const totals = computeInvoiceTotals(
    rows.map((r) => ({
      quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
      unitPriceCents: Math.max(0, Math.round(Number(r.unitPrice) * 100 || 0)),
    })),
    discount,
  );

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    setError(null);
    if (!companyId) return setError("Select a brand.");
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
      lineItems.push({ sku, title, quantity, unitPriceCents, shopifyProductId, shopifyVariantId });
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/invoices/${invoiceId}` : "/api/invoices",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { companyId }),
            issuedDate,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
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
            <label className={fieldLabel}>Brand</label>
            {isEdit ? (
              <Input value={initial?.companyName ?? ""} disabled />
            ) : (
              <QuickAddSelect
                value={companyId}
                onChange={setCompanyId}
                options={companyList.map((c) => ({
                  value: c.id,
                  label: c.tierName ? `${c.name} — ${c.tierName}` : c.name,
                }))}
                addLabel="Add new brand"
                fields={[
                  { key: "name", label: "Brand name", required: true },
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
            )}
            <p className="mt-1 text-xs text-zinc-500">
              {discount > 0 ? (
                <Badge className="bg-emerald-50 text-emerald-700">{discount}% off retail</Badge>
              ) : (
                "No tier discount"
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Issued date</label>
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel}>Due date (optional)</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
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

        {catalogError && (
          <p className="mt-3 text-xs text-amber-600">
            Couldn’t load the Shopify catalog — enter SKU and title manually.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {rows.map((r, i) => {
            const taken = new Set(
              rows.filter((_, j) => j !== i).map((x) => x.variantKey).filter(Boolean),
            );
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
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
                        unitPrice: (v.priceCents / 100).toString(),
                      })
                    }
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
                  className="w-28"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit $ (retail)"
                  value={r.unitPrice}
                  onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
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

        <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Subtotal</span>
            <span className="w-28 text-right text-zinc-700">{fmtMoney(totals.subtotalCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Discount ({discount}%)</span>
            <span className="w-28 text-right text-zinc-700">−{fmtMoney(totals.discountCents)}</span>
          </div>
          <div className="flex justify-end gap-6 font-semibold text-zinc-900">
            <span>Total</span>
            <span className="w-28 text-right">{fmtMoney(totals.totalCents)}</span>
          </div>
        </div>
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
