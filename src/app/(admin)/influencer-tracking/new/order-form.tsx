"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/production/display";
import { computeGiftTotals } from "@/lib/influencer/influencer";
import {
  LineItemsHeader,
  LineItemRow,
} from "@/components/invoicing/line-item-row";
import {
  SplitFulfillmentGrid,
  addressOptionLabel,
  type AddressOption,
} from "@/components/invoicing/split-fulfillment-grid";
import {
  expandAlloc,
  anyOverAllocated,
  type Alloc,
  type SplitLocation,
} from "@/lib/invoicing/split-alloc";
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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InfluencerOrderForm({
  influencers,
  defaultInfluencerId,
}: {
  influencers: InfluencerOption[];
  defaultInfluencerId?: string;
}) {
  const router = useRouter();

  // Local, appendable copy so a newly-added influencer shows + selects inline.
  const [influencerList, setInfluencerList] = useState(influencers);
  const [influencerId, setInfluencerId] = useState(
    (defaultInfluencerId &&
      influencers.find((i) => i.id === defaultInfluencerId)?.id) ||
      (influencers[0]?.id ?? ""),
  );
  // Inline "create a new influencer" panel (when the one you want isn't listed).
  const [creatingInfluencer, setCreatingInfluencer] = useState(false);
  const [newInf, setNewInf] = useState({ name: "", handle: "", platform: "", contactEmail: "" });
  const [infBusy, setInfBusy] = useState(false);
  const [infError, setInfError] = useState<string | null>(null);
  const [contentDueDate, setContentDueDate] = useState("");
  const [affiliateLink, setAffiliateLink] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  // Ship-to / split fulfillment — addresses load async for the chosen influencer.
  const [addresses, setAddresses] = useState<AddressOption[]>([]);
  const [addrLoaded, setAddrLoaded] = useState(false);
  const [orderAddressId, setOrderAddressId] = useState("");
  const [split, setSplit] = useState(false);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [alloc, setAlloc] = useState<Alloc>({});

  // Staged documents — uploaded to the order right after it's created.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [lastCollectionId, setLastCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = useMemo(
    () => new Map(variants.map((v) => [v.shopifyVariantId, v])),
    [variants],
  );

  const selected = influencerList.find((i) => i.id === influencerId);
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

  // Load the chosen influencer's saved addresses (from their linked Shopify
  // customer) for the ship-to / split picker; reset split state on change.
  useEffect(() => {
    setOrderAddressId("");
    setExtraIds([]);
    setSplit(false);
    setAlloc({});
    if (!influencerId) {
      setAddresses([]);
      setAddrLoaded(true);
      return;
    }
    let cancelled = false;
    setAddrLoaded(false);
    fetch(`/api/influencers/${influencerId}/addresses`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAddresses((d?.data as AddressOption[]) ?? []);
        setAddrLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAddresses([]);
        setAddrLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [influencerId]);

  const totals = computeGiftTotals(
    rows.map((r) => ({
      quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
      unitPriceCents: Math.max(0, Math.round(Number(r.unitPrice) * 100 || 0)),
    })),
  );

  // Ordered split-grid columns: the default ship-to first, then added locations.
  const locations: SplitLocation[] = useMemo(() => {
    const ids = [orderAddressId, ...extraIds].filter(
      (id, i, arr) => id && arr.indexOf(id) === i,
    );
    return ids.map((id) => {
      const a = addresses.find((x) => x.id === id);
      return { addressId: id, label: a ? addressOptionLabel(a) : id };
    });
  }, [orderAddressId, extraIds, addresses]);

  const splitLines = rows
    .filter((r) => r.variantKey)
    .map((r) => ({
      shopifyVariantId: r.variantKey,
      sku: r.sku,
      label: r.title || r.sku,
      total: Math.max(1, Math.floor(Number(r.quantity) || 1)),
    }));
  const overAllocated =
    split && locations.length >= 2 && anyOverAllocated(splitLines, locations, alloc);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }
  function setCell(variantId: string, aId: string, qty: number) {
    setAlloc((a) => ({ ...a, [variantId]: { ...a[variantId], [aId]: qty } }));
  }
  function addLocation(id: string) {
    setExtraIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeLocation(id: string) {
    setExtraIds((prev) => prev.filter((x) => x !== id));
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

  // Create an influencer inline (when the one you need isn't in the list) and
  // select it — mirrors the invoice form's "+ Add a new company…" flow.
  async function createNewInfluencer() {
    setInfError(null);
    if (!newInf.name.trim()) return setInfError("Name is required.");
    if (
      newInf.contactEmail.trim() &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newInf.contactEmail.trim())
    ) {
      return setInfError("Enter a valid contact email or leave it blank.");
    }
    setInfBusy(true);
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newInf.name.trim(),
          handle: newInf.handle.trim() || null,
          platform: newInf.platform.trim() || null,
          contactEmail: newInf.contactEmail.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInfError(d.error || "Failed to create influencer.");
        return;
      }
      const option: InfluencerOption = {
        id: d.data.id as string,
        name: newInf.name.trim(),
        handle: newInf.handle.trim() || null,
        assignedCollectionIds: [],
      };
      setInfluencerList((prev) =>
        [...prev, option].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setInfluencerId(option.id);
      setCreatingInfluencer(false);
      setNewInf({ name: "", handle: "", platform: "", contactEmail: "" });
    } catch {
      setInfError("Network error — please try again.");
    } finally {
      setInfBusy(false);
    }
  }

  function addStagedFiles(files: FileList | null) {
    if (!files) return;
    setStagedFiles((prev) => [...prev, ...Array.from(files)]);
  }
  function removeStagedFile(i: number) {
    setStagedFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Build the line-item payload (with per-line addressId when split), validating
  // each row. Returns null + sets an error on the first invalid row.
  function buildLineItems(): {
    sku: string;
    title: string;
    quantity: number;
    unitPriceCents: number;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
    addressId?: string;
  }[] | null {
    type BaseLine = {
      sku: string;
      title: string;
      quantity: number;
      unitPriceCents: number;
      shopifyProductId: string | null;
      shopifyVariantId: string | null;
      variantKey: string;
    };
    const baseLines: BaseLine[] = [];
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
          setError(`Line ${i + 1}: pick a product.`);
          return null;
        }
      } else if (!sku || !title) {
        setError(`Line ${i + 1}: SKU and title are required.`);
        return null;
      }
      const quantity = Number(r.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setError(`Line ${i + 1}: quantity must be a positive whole number.`);
        return null;
      }
      const unitPriceCents = Math.round(Number(r.unitPrice) * 100);
      if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
        setError(`Line ${i + 1}: gift value must be a non-negative amount.`);
        return null;
      }
      baseLines.push({ sku, title, quantity, unitPriceCents, shopifyProductId, shopifyVariantId, variantKey: r.variantKey });
    }

    const toPayload = (b: BaseLine, quantity: number, addressId: string | undefined) => ({
      sku: b.sku,
      title: b.title,
      quantity,
      unitPriceCents: b.unitPriceCents,
      shopifyProductId: b.shopifyProductId,
      shopifyVariantId: b.shopifyVariantId,
      addressId,
    });

    const useSplit = split && locations.length >= 2;
    if (!useSplit) return baseLines.map((b) => toPayload(b, b.quantity, undefined));

    const byKey = new Map(baseLines.filter((b) => b.variantKey).map((b) => [b.variantKey, b]));
    const expanded = expandAlloc(
      baseLines.filter((b) => b.variantKey).map((b) => ({ shopifyVariantId: b.variantKey, total: b.quantity })),
      locations,
      alloc,
    );
    const out = expanded.map((e) => toPayload(byKey.get(e.shopifyVariantId)!, e.quantity, e.addressId));
    for (const b of baseLines.filter((b) => !b.variantKey)) out.push(toPayload(b, b.quantity, undefined));
    return out;
  }

  // Upload staged documents to the freshly-created order. Best-effort: returns
  // the names that failed so the caller can warn without losing the order.
  async function uploadStaged(orderId: string): Promise<string[]> {
    const failures: string[] = [];
    for (const f of stagedFiles) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(`/api/influencer-orders/${orderId}/attachments`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) failures.push(f.name);
      } catch {
        failures.push(f.name);
      }
    }
    return failures;
  }

  async function submit() {
    setError(null);
    setWarning(null);
    if (!influencerId) return setError("Select an influencer.");
    if (affiliateLink.trim() && !/^https?:\/\//i.test(affiliateLink.trim())) {
      return setError("Affiliate link must be a URL starting with http:// or https://");
    }
    if (overAllocated) {
      return setError("Some items have more allocated across locations than ordered.");
    }
    const lineItems = buildLineItems();
    if (!lineItems) return;

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
          addressId: orderAddressId || null,
          lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create order.");
        setSubmitting(false);
        return;
      }

      const orderId: string = data.data.id;
      const warnings: string[] = [];
      if (data.warning) warnings.push(data.warning);
      if (stagedFiles.length > 0) {
        const failed = await uploadStaged(orderId);
        if (failed.length > 0) {
          warnings.push(`Couldn't upload: ${failed.join(", ")}. Re-attach on the order page.`);
        }
      }

      // Land on the new order's detail page (where attachments + send live).
      if (warnings.length > 0) {
        // Surface, then continue to the detail page after a beat so it's seen.
        setWarning(warnings.join(" "));
      }
      router.push(`/influencer-tracking/${orderId}`);
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
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingInfluencer(true);
                  setInfError(null);
                  return;
                }
                setInfluencerId(e.target.value);
              }}
            >
              {influencerList.length === 0 && <option value="">No influencers yet</option>}
              {influencerList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.handle ? `${i.name} (${i.handle})` : i.name}
                </option>
              ))}
              <option value="__new__">+ Add a new influencer…</option>
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

            {creatingInfluencer && (
              <div className="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-600">New influencer</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Name (required)"
                    value={newInf.name}
                    onChange={(e) => setNewInf((s) => ({ ...s, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Handle (@…)"
                    value={newInf.handle}
                    onChange={(e) => setNewInf((s) => ({ ...s, handle: e.target.value }))}
                  />
                  <select
                    className={inputBase}
                    value={newInf.platform}
                    onChange={(e) => setNewInf((s) => ({ ...s, platform: e.target.value }))}
                  >
                    <option value="">Platform…</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="other">Other</option>
                  </select>
                  <Input
                    type="email"
                    placeholder="Contact email (optional)"
                    value={newInf.contactEmail}
                    onChange={(e) => setNewInf((s) => ({ ...s, contactEmail: e.target.value }))}
                  />
                </div>
                {infError && <p className="text-sm text-red-600">{infError}</p>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={createNewInfluencer} disabled={infBusy}>
                    {infBusy ? "Adding…" : "Add influencer"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={infBusy}
                    onClick={() => {
                      setCreatingInfluencer(false);
                      setInfError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
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

        <div className="mt-4">
          <LineItemsHeader />
        </div>
        <div className="mt-2 space-y-2">
          {rows.map((r, i) => {
            const taken = new Set(
              rows.filter((_, j) => j !== i).map((x) => x.variantKey).filter(Boolean),
            );
            const rowQty = Number(r.quantity);
            const rowPrice = Number(r.unitPrice);
            const rowValid =
              Number.isFinite(rowQty) && rowQty > 0 && Number.isFinite(rowPrice) && rowPrice >= 0 && r.unitPrice.trim() !== "";
            const lineCents = rowValid ? Math.round(rowPrice * 100) * rowQty : null;
            return (
              <div key={i}>
                <LineItemRow
                  product={
                    catalogError ? (
                      <div className="flex gap-2">
                        <Input className="w-32" placeholder="SKU" value={r.sku} onChange={(e) => updateRow(i, { sku: e.target.value })} />
                        <Input className="min-w-[140px] flex-1" placeholder="Title" value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} />
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
                      placeholder="Gift value $"
                      value={r.unitPrice}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                    />
                  }
                  lineTotalCents={lineCents}
                  onRemove={() => removeRow(i)}
                  removeDisabled={rows.length === 1}
                />
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

        {addresses.length > 0 ? (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <label className={fieldLabel}>{split ? "Default ship-to" : "Ship to"}</label>
            <select className={inputBase} value={orderAddressId} onChange={(e) => setOrderAddressId(e.target.value)}>
              <option value="">— Select a delivery address —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {addressOptionLabel(a)}
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
            {split && splitLines.length > 0 && (
              <SplitFulfillmentGrid
                lines={splitLines}
                addresses={addresses}
                locations={locations}
                alloc={alloc}
                onSetCell={setCell}
                onAddLocation={addLocation}
                onRemoveLocation={removeLocation}
              />
            )}
            {overAllocated && (
              <p className="mt-2 text-sm text-red-600">
                Some items have more allocated across locations than ordered — adjust to save.
              </p>
            )}
          </div>
        ) : (
          addrLoaded && (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              No saved addresses for this influencer. Link them to a Shopify customer to enable a
              delivery address + split fulfillment.
            </p>
          )
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <Upload className="h-4 w-4" /> Attach file
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addStagedFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Attach the gifting agreement, content brief, or related documents (PDF/image). Uploaded
          when the order is created. Max 10MB each.
        </p>
        <div className="mt-3 space-y-2">
          {stagedFiles.length === 0 ? (
            <p className="text-sm text-zinc-400">No documents staged.</p>
          ) : (
            stagedFiles.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-700">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-zinc-400">{fmtSize(f.size)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove document"
                  onClick={() => removeStagedFile(i)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {warning && <p className="text-sm text-amber-600">{warning}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting || !influencerId}>
          {submitting ? "Creating…" : "Create gifting order"}
        </Button>
      </div>
    </div>
  );
}
