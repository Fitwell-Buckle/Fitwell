"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
  reconstructAlloc,
  anyOverAllocated,
  type Alloc,
  type SplitLocation,
} from "@/lib/invoicing/split-alloc";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
import { useCatalog } from "@/components/catalog/use-catalog";

export interface EditOrderLine {
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  /** Per-line split ship-to address id (from the stored snapshot). */
  addressId: string | null;
}

export interface EditOrderInitial {
  lineItems: EditOrderLine[];
  shipToAddressId: string | null;
  contentDueDate: string | null;
  publishedAt: string | null;
  affiliateLink: string | null;
  status: "draft" | "sent" | "cancelled";
  expectedPlatform: "ig" | "yt" | "tt" | "other" | null;
  // Sample logistics (auto-stamped by fulfillment webhooks; editable here).
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null; // YYYY-MM-DD
  deliveredAt: string | null; // YYYY-MM-DD
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

// Consolidate stored lines (one per split destination) into one editable row per
// variant, summing quantities — the grid below re-splits them by location.
function seedRows(initial: EditOrderInitial): Row[] {
  const byKey = new Map<string, Row>();
  for (const l of initial.lineItems) {
    const key = l.shopifyVariantId || l.sku;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = String(Number(existing.quantity) + l.quantity);
    } else {
      byKey.set(key, {
        variantKey: l.shopifyVariantId ?? "",
        shopifyProductId: l.shopifyProductId ?? "",
        sku: l.sku,
        title: l.title,
        quantity: String(l.quantity),
        unitPrice: (l.unitPriceCents / 100).toString(),
      });
    }
  }
  return byKey.size > 0 ? [...byKey.values()] : [emptyRow()];
}

// Seed the split grid from the stored per-line ship-to address ids.
function seedSplit(initial: EditOrderInitial, defaultAddressId: string | undefined) {
  const lines = initial.lineItems.map((l) => ({
    shopifyVariantId: l.shopifyVariantId,
    quantity: l.quantity,
    shipTo: l.addressId ? { addressId: l.addressId } : null,
  }));
  const isSplit = lines.some((l) => l.shipTo != null);
  const { locationIds, alloc } = reconstructAlloc(lines, defaultAddressId);
  return { isSplit, locationIds, alloc };
}

export function InfluencerOrderEditForm({
  orderId,
  orderNumber,
  influencerName,
  assignedCollectionIds,
  addresses,
  initial,
}: {
  orderId: string;
  orderNumber: string;
  influencerName: string;
  assignedCollectionIds: string[];
  addresses: AddressOption[];
  initial: EditOrderInitial;
}) {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>(() => seedRows(initial));
  const [contentDueDate, setContentDueDate] = useState(initial.contentDueDate ?? "");
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt ?? "");
  const [affiliateLink, setAffiliateLink] = useState(initial.affiliateLink ?? "");
  const [status, setStatus] = useState(initial.status);
  const [expectedPlatform, setExpectedPlatform] = useState(initial.expectedPlatform ?? "");
  const [trackingNumber, setTrackingNumber] = useState(initial.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(initial.trackingUrl ?? "");
  const [shippedAt, setShippedAt] = useState(initial.shippedAt ?? "");
  const [deliveredAt, setDeliveredAt] = useState(initial.deliveredAt ?? "");

  const splitSeed = seedSplit(initial, initial.shipToAddressId || undefined);
  const [orderAddressId, setOrderAddressId] = useState(
    initial.shipToAddressId || splitSeed.locationIds[0] || "",
  );
  const [split, setSplit] = useState<boolean>(splitSeed.isSplit);
  const [extraIds, setExtraIds] = useState<string[]>(
    splitSeed.locationIds.filter(
      (id) => id && id !== (initial.shipToAddressId || splitSeed.locationIds[0]),
    ),
  );
  const [alloc, setAlloc] = useState<Alloc>(splitSeed.alloc);

  const [lastCollectionId, setLastCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const { variants, collections, loading: catalogLoading, error: catalogError } =
    useCatalog();
  const variantByKey = useMemo(
    () => new Map(variants.map((v) => [v.shopifyVariantId, v])),
    [variants],
  );

  // Restrict the picker to the influencer's assigned collections (all if none).
  const allowedCollections = useMemo(
    () =>
      assignedCollectionIds.length === 0
        ? collections
        : collections.filter((c) => assignedCollectionIds.includes(c.id)),
    [assignedCollectionIds, collections],
  );
  const allowedVariants = useMemo(() => {
    if (assignedCollectionIds.length === 0) return variants;
    const allowed = new Set<string>();
    for (const c of allowedCollections) for (const vid of c.variantIds) allowed.add(vid);
    return variants.filter((v) => allowed.has(v.shopifyVariantId));
  }, [assignedCollectionIds, allowedCollections, variants]);
  const pickerVariants =
    assignedCollectionIds.length > 0 && allowedVariants.length > 0 ? allowedVariants : variants;

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
  function addManyAt(i: number, vs: CatalogVariant[]) {
    if (vs.length === 0) return;
    setRows((rs) => {
      const copy = [...rs];
      copy.splice(i, 1, ...vs.map(rowFromVariant));
      return copy;
    });
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

  async function save(): Promise<boolean> {
    setError(null);
    setNotice(null);
    if (affiliateLink.trim() && !/^https?:\/\//i.test(affiliateLink.trim())) {
      setError("Affiliate link must be a URL starting with http:// or https://");
      return false;
    }
    if (overAllocated) {
      setError("Some items have more allocated across locations than ordered.");
      return false;
    }
    const lineItems = buildLineItems();
    if (!lineItems) return false;

    setSaving(true);
    try {
      const res = await fetch(`/api/influencer-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems,
          addressId: orderAddressId || null,
          contentDueDate: contentDueDate || null,
          publishedAt: publishedAt || null,
          affiliateLink: affiliateLink.trim() || null,
          status,
          expectedPlatform: expectedPlatform || null,
          trackingNumber: trackingNumber.trim() || null,
          trackingUrl: trackingUrl.trim() || null,
          shippedAt: shippedAt || null,
          deliveredAt: deliveredAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    // Save first so the gifting draft + email reflect the latest lines/ship-to.
    const ok = await save();
    if (!ok) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/influencer-orders/${orderId}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send.");
        return;
      }
      setNotice(data.message || "Sent.");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{orderNumber}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              <Badge className="bg-emerald-50 text-emerald-700">Gifting — 100% off</Badge>
              <span className="ml-2">For {influencerName}</span>
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Content due date</label>
              <Input type="date" value={contentDueDate} onChange={(e) => setContentDueDate(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel}>Published date</label>
              <Input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Status</label>
              <select
                className={inputBase}
                value={status}
                onChange={(e) => setStatus(e.target.value as EditOrderInitial["status"])}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Expected platform</label>
              <select
                className={inputBase}
                value={expectedPlatform}
                onChange={(e) => setExpectedPlatform(e.target.value)}
              >
                <option value="">—</option>
                <option value="ig">Instagram</option>
                <option value="yt">YouTube</option>
                <option value="tt">TikTok</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <label className={fieldLabel}>Affiliate link (optional)</label>
          <Input type="url" placeholder="https://…" value={affiliateLink} onChange={(e) => setAffiliateLink(e.target.value)} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Sample logistics</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Auto-filled from Shopify fulfillment when the sample ships through the
          platform. Enter manually for orders fulfilled outside it — a delivered
          date marks the sample as received.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Tracking number</label>
            <Input
              placeholder="e.g. 1Z999AA10123456784"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabel}>Tracking URL (optional)</label>
            <Input
              type="url"
              placeholder="https://…"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabel}>Shipped date</label>
            <Input type="date" value={shippedAt} onChange={(e) => setShippedAt(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={fieldLabel}>Delivered date (received)</label>
              {!deliveredAt && (
                <button
                  type="button"
                  onClick={() => setDeliveredAt(new Date().toISOString().slice(0, 10))}
                  className="mb-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Mark received today
                </button>
              )}
            </div>
            <Input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
          </div>
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
          <p className="mt-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            No saved addresses for this influencer. Link them to a Shopify customer to enable a
            delivery address + split fulfillment.
          </p>
        )}
      </Card>

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={save} disabled={saving || sending}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={send} disabled={saving || sending}>
          {sending ? "Sending…" : "Save & send gift"}
        </Button>
      </div>
    </div>
  );
}
