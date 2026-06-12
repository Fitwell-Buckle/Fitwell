"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerSearchField } from "@/components/production/customer-search-field";
import { useCatalog } from "@/components/catalog/use-catalog";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";

export interface CompanyFormPriceTier {
  id: string;
  name: string;
  discountPercent: number;
}

export function tierLabel(t: CompanyFormPriceTier): string {
  return `${t.name} (${t.discountPercent}% off)`;
}

export interface CompanyDraft {
  name: string;
  contactName: string;
  contactEmail: string;
  address: string;
  customerId: string; // linked Shopify (synced) customer
  priceTierId: string;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
  depositPercent: string; // form input; "" = 0 (pay in full)
  allowWirePayment: boolean; // let this brand pay later by bank wire at checkout
  notes: string;
}

export function emptyCompanyDraft(): CompanyDraft {
  return {
    name: "",
    contactName: "",
    contactEmail: "",
    address: "",
    customerId: "",
    priceTierId: "",
    assignedCollectionIds: [],
    assignedProductIds: [],
    depositPercent: "",
    allowWirePayment: false,
    notes: "",
  };
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

/**
 * The full B2B customer (company) create/edit form. Shared by the brands
 * manager and the invoice form's inline "Add new customer" so both expose the
 * same fields. The parent owns the `draft` state and the `onSave` persistence.
 */
export function CompanyForm({
  title,
  draft,
  setDraft,
  priceTiers,
  onSave,
  onCancel,
  busy,
  error,
}: {
  title: string;
  draft: CompanyDraft;
  setDraft: (d: CompanyDraft) => void;
  priceTiers: CompanyFormPriceTier[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const { variants, collections, loading: catalogLoading } = useCatalog();
  // Shopify product id → display title (first variant's product title).
  const productTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) if (!m.has(v.shopifyProductId)) m.set(v.shopifyProductId, v.title);
    return m;
  }, [variants]);
  // Hide already-assigned products from the picker.
  const excludeVariants = useMemo(() => {
    const ids = new Set(draft.assignedProductIds);
    return new Set(
      variants.filter((v) => ids.has(v.shopifyProductId)).map((v) => v.shopifyVariantId),
    );
  }, [variants, draft.assignedProductIds]);

  function addProducts(vs: CatalogVariant[]) {
    const ids = new Set(draft.assignedProductIds);
    for (const v of vs) ids.add(v.shopifyProductId);
    setDraft({ ...draft, assignedProductIds: [...ids] });
  }
  function removeProduct(pid: string) {
    setDraft({
      ...draft,
      assignedProductIds: draft.assignedProductIds.filter((p) => p !== pid),
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className={fieldLabel}>Price tier</label>
          <select
            className={inputBase}
            value={draft.priceTierId}
            onChange={(e) => setDraft({ ...draft, priceTierId: e.target.value })}
          >
            <option value="">— none —</option>
            {priceTiers.map((t) => (
              <option key={t.id} value={t.id}>
                {tierLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Deposit %</label>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0"
            value={draft.depositPercent}
            onChange={(e) => setDraft({ ...draft, depositPercent: e.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Collected up front; the balance is billed when the order is fulfilled. 0 = pay in full.
          </p>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <input
            id="allowWirePayment"
            type="checkbox"
            checked={draft.allowWirePayment}
            onChange={(e) => setDraft({ ...draft, allowWirePayment: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
          />
          <label htmlFor="allowWirePayment" className="cursor-pointer text-sm text-zinc-700">
            Allow pay later by bank wire
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
              At portal checkout this brand can place the order and pay by bank transfer
              instead of being required to pay by card. Wire instructions come from your
              Wire info settings on the B2B Orders page.
            </span>
          </label>
        </div>
        <CustomerSearchField
          label="Contact name (search customers)"
          value={draft.contactName}
          onChange={(v) => setDraft({ ...draft, contactName: v, customerId: "" })}
          onPick={(m) =>
            setDraft({
              ...draft,
              contactName: m.name,
              contactEmail: m.email ?? "",
              customerId: m.id,
            })
          }
        />
        <CustomerSearchField
          label="Contact email (search customers)"
          type="email"
          value={draft.contactEmail}
          onChange={(v) => setDraft({ ...draft, contactEmail: v, customerId: "" })}
          onPick={(m) =>
            setDraft({
              ...draft,
              contactName: m.name,
              contactEmail: m.email ?? "",
              customerId: m.id,
            })
          }
        />
        {draft.customerId && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 sm:col-span-2">
            <span>✓ Linked to a Shopify customer</span>
            <button
              type="button"
              className="underline"
              onClick={() => setDraft({ ...draft, customerId: "" })}
            >
              unlink
            </button>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Address</label>
          <textarea
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            rows={3}
            placeholder="Street, City, State ZIP, Country"
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Order restriction (optional)</label>
          <p className="mb-2 text-xs text-zinc-500">
            Limit which products this brand can order — search and add them below
            (filter by collection right in the picker). Leave empty to allow the
            whole catalog.
          </p>
          <ProductCombobox
            variants={variants}
            collections={collections}
            value=""
            exclude={excludeVariants}
            disabled={catalogLoading}
            placeholder={catalogLoading ? "Loading catalog…" : "Add products…"}
            onSelect={(v) => addProducts([v])}
            onSelectMany={addProducts}
          />
          {draft.assignedProductIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.assignedProductIds.map((pid) => (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                >
                  {productTitle.get(pid) ?? "Product"}
                  <button
                    type="button"
                    onClick={() => removeProduct(pid)}
                    aria-label="Remove product"
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Customer notes</label>
          <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
