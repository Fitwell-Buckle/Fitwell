"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/production/display";
import { computeGiftTotals } from "@/lib/influencer/influencer";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";

export interface InfluencerOption {
  id: string;
  name: string;
  handle: string | null;
  assignedCollectionIds: string[];
}

interface Row {
  variantKey: string;
  shopifyProductId: string;
  sku: string;
  title: string;
  quantity: string;
  unitPrice: string; // dollars (retail gift value)
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

function emptyRow(): Row {
  return { variantKey: "", shopifyProductId: "", sku: "", title: "", quantity: "1", unitPrice: "" };
}

export function InfluencerOrderForm({
  influencers,
  defaultInfluencerId,
}: {
  influencers: InfluencerOption[];
  defaultInfluencerId?: string;
}) {
  const router = useRouter();

  const [influencerId, setInfluencerId] = useState(
    (defaultInfluencerId &&
      influencers.find((i) => i.id === defaultInfluencerId)?.id) ||
      (influencers[0]?.id ?? ""),
  );
  const [contentDueDate, setContentDueDate] = useState("");
  const [affiliateLink, setAffiliateLink] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [lastCollectionId, setLastCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = new Map(variants.map((v) => [v.shopifyVariantId, v]));

  const selected = influencers.find((i) => i.id === influencerId);
  const assigned = selected?.assignedCollectionIds ?? [];

  // Restrict the picker to the influencer's assigned collections (all if none).
  const allowedCollections = useMemo(
    () => (assigned.length === 0 ? collections : collections.filter((c) => assigned.includes(c.id))),
    [assigned, collections],
  );
  const allowedVariants = useMemo(() => {
    if (assigned.length === 0) return variants;
    const allowed = new Set<string>();
    for (const c of allowedCollections) for (const vid of c.variantIds) allowed.add(vid);
    return variants.filter((v) => allowed.has(v.shopifyVariantId));
  }, [assigned, allowedCollections, variants]);
  // If we can't resolve any collection membership (e.g. flat catalog fallback),
  // don't hide everything — fall back to the full catalog.
  const pickerVariants =
    assigned.length > 0 && allowedVariants.length > 0 ? allowedVariants : variants;
  const restricted = assigned.length > 0 && allowedVariants.length > 0;

  const totals = computeGiftTotals(
    rows.map((r) => ({
      quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
      unitPriceCents: Math.max(0, Math.round(Number(r.unitPrice) * 100 || 0)),
    })),
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
  function rowFromVariant(v: CatalogVariant): Row {
    return {
      variantKey: v.shopifyVariantId,
      shopifyProductId: v.shopifyProductId,
      sku: v.sku,
      title: v.title + (v.variantTitle ? ` — ${v.variantTitle}` : ""),
      quantity: "1",
      unitPrice: (v.priceCents / 100).toString(),
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
    setWarning(null);
    if (!influencerId) return setError("Select an influencer.");
    if (affiliateLink.trim() && !/^https?:\/\//i.test(affiliateLink.trim())) {
      return setError("Affiliate link must be a URL starting with http:// or https://");
    }

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
        return setError(`Line ${i + 1}: gift value must be a non-negative amount.`);
      }
      lineItems.push({ sku, title, quantity, unitPriceCents, shopifyProductId, shopifyVariantId });
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/influencer-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId,
          contentDueDate: contentDueDate || null,
          affiliateLink: affiliateLink.trim() || null,
          notes: notes.trim() || null,
          lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create order.");
        setSubmitting(false);
        return;
      }
      if (data.warning) {
        // Order saved but Shopify push failed — surface, then continue.
        setWarning(data.warning);
      }
      router.push("/influencer-tracking");
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
            <label className={fieldLabel}>Influencer</label>
            <select
              className={inputBase}
              value={influencerId}
              onChange={(e) => setInfluencerId(e.target.value)}
            >
              {influencers.length === 0 && <option value="">No influencers yet</option>}
              {influencers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.handle ? `${i.name} (${i.handle})` : i.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              <Badge className="bg-emerald-50 text-emerald-700">Gifting — 100% off</Badge>
              {restricted && (
                <span className="ml-2">
                  Limited to {allowedCollections.length} assigned collection
                  {allowedCollections.length === 1 ? "" : "s"}.
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Content due date</label>
              <Input
                type="date"
                value={contentDueDate}
                onChange={(e) => setContentDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel}>Affiliate link (optional)</label>
              <Input
                type="url"
                placeholder="https://…"
                value={affiliateLink}
                onChange={(e) => setAffiliateLink(e.target.value)}
              />
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
          <h2 className="text-sm font-semibold text-zinc-900">Products</h2>
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
                  placeholder="Gift value $"
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
            <span>Gift value</span>
            <span className="w-28 text-right text-zinc-700">{fmtMoney(totals.subtotalCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Discount (100%)</span>
            <span className="w-28 text-right text-zinc-700">−{fmtMoney(totals.discountCents)}</span>
          </div>
          <div className="flex justify-end gap-6 font-semibold text-zinc-900">
            <span>Charged</span>
            <span className="w-28 text-right">{fmtMoney(totals.totalCents)}</span>
          </div>
        </div>
      </Card>

      {warning && <p className="text-sm text-amber-600">{warning}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting || influencers.length === 0}>
          {submitting ? "Creating…" : "Create gifting order"}
        </Button>
      </div>
    </div>
  );
}
