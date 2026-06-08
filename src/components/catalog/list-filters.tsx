"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useStageLabels, useStageOrder } from "@/components/production/stage-labels-provider";
import { PO_STATUSES, STATUS_LABELS } from "@/lib/production/display";
import { ProductCombobox, variantLabel } from "./product-combobox";
import { useCatalog } from "./use-catalog";

const selectClass =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

/** Optional production-only filters (supplier / status / stage). */
export interface ProductionFilterProps {
  suppliers: { id: string; name: string }[];
  supplierId: string;
  status: string;
  stage: string;
}

/** Parse the `sku` query param (comma-separated) into a list of SKUs. */
export function parseSkuFilter(value: string | string[] | undefined): string[] {
  const raw = typeof value === "string" ? value : "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The unified list filter: the shared Item Chooser (search a product by
 * collection / size / colour / material, check one or more, then Add) drives a
 * `sku` query param — the page shows only rows for the chosen product(s).
 * Replaces the old Collection/Size/Colour/Material dropdowns everywhere, so the
 * exact same chooser is used to add items AND to filter lists. Picked products
 * show as removable chips. Production pages also get the supplier / status /
 * stage dropdowns (`production`).
 */
export function ListFilters({ production }: { production?: ProductionFilterProps }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stageLabels = useStageLabels();
  const stageOrder = useStageOrder();
  const { variants, collections, loading } = useCatalog();

  const skus = parseSkuFilter(searchParams.get("sku") ?? undefined);
  const skuSet = new Set(skus);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }
  function setSkus(next: string[]) {
    setParam("sku", [...new Set(next)].join(","));
  }

  // Hide already-picked products from the chooser so they aren't added twice.
  const exclude = new Set(
    variants.filter((v) => skuSet.has(v.sku)).map((v) => v.shopifyVariantId),
  );

  // Collapse chips: if the user's chosen SKUs cover an entire known
  // collection, render that as a single "Collection name" chip instead of
  // one chip per SKU. Greedy from largest collection down so the biggest
  // group wins; SKUs not covered by any matched collection stay individual.
  const collectionSkus = collections.map((c) => ({
    id: c.id,
    title: c.title,
    skus: variants
      .filter((v) => c.variantIds.has(v.shopifyVariantId) && v.sku)
      .map((v) => v.sku),
  }));
  const matchedCollections: { id: string; title: string; skus: string[] }[] = [];
  const consumedSkus = new Set<string>();
  for (const c of [...collectionSkus].sort((a, b) => b.skus.length - a.skus.length)) {
    if (c.skus.length === 0) continue;
    if (c.skus.every((s) => skuSet.has(s))) {
      matchedCollections.push(c);
      c.skus.forEach((s) => consumedSkus.add(s));
    }
  }
  const loneSkus = skus.filter((s) => !consumedSkus.has(s));

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-96">
        <ProductCombobox
          variants={variants}
          collections={collections}
          value="" // a filter trigger, not a single selection — always blank
          exclude={exclude}
          placeholder={loading ? "Loading catalog…" : "Filter by product…"}
          disabled={loading}
          onSelect={(v) => setSkus([...skus, v.sku])}
          onSelectMany={(vs) => setSkus([...skus, ...vs.map((v) => v.sku)])}
        />
      </div>

      {matchedCollections.map((c) => {
        const memberSet = new Set(c.skus);
        return (
          <button
            key={`coll-${c.id}`}
            type="button"
            onClick={() => setSkus(skus.filter((x) => !memberSet.has(x)))}
            className="flex h-9 items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
            title={`${c.title} (${c.skus.length} products)`}
            aria-label={`Remove ${c.title} from filter`}
          >
            <span className="max-w-[260px] truncate">{c.title}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-500">{c.skus.length}</span>
            <X className="h-3 w-3 shrink-0 text-zinc-400" />
          </button>
        );
      })}
      {loneSkus.map((s) => {
        const v = variants.find((x) => x.sku === s) ?? null;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setSkus(skus.filter((x) => x !== s))}
            className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs text-zinc-700 hover:bg-zinc-50"
            title={v ? variantLabel(v) : s}
            aria-label={`Remove ${s} from filter`}
          >
            <span className="max-w-[180px] truncate">{s}</span>
            <X className="h-3 w-3 shrink-0 text-zinc-400" />
          </button>
        );
      })}
      {skus.length > 1 && (
        <button
          type="button"
          onClick={() => setSkus([])}
          className="h-9 px-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
        >
          Clear all
        </button>
      )}

      {production && (
        <>
          <select
            value={production.supplierId}
            onChange={(e) => setParam("supplier", e.target.value)}
            className={selectClass}
            aria-label="Supplier"
          >
            <option value="">All suppliers</option>
            {production.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={production.status}
            onChange={(e) => setParam("status", e.target.value)}
            className={selectClass}
            aria-label="Status"
          >
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">All statuses</option>
          </select>
          <select
            value={production.stage}
            onChange={(e) => setParam("stage", e.target.value)}
            className={selectClass}
            aria-label="Stage"
          >
            <option value="">All stages</option>
            {stageOrder.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s]}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
