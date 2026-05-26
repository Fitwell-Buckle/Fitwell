"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CatalogVariant } from "@/app/api/production/products/route";
import { skuSize } from "@/lib/production/display";
import { cn } from "@/lib/utils";

export type { CatalogVariant };

/** Human label for a catalog variant: "SKU · Product — Variant". */
export function variantLabel(v: CatalogVariant): string {
  const name = v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title;
  return v.sku ? `${v.sku} · ${name}` : name;
}

const MAX_RESULTS = 60;

export interface CatalogCollection {
  id: string;
  title: string;
  variantIds: Set<string>;
}

/**
 * Shared searchable product picker. Click to open, optionally narrow by Shopify
 * collection, then type to filter by SKU / title (or use the size/colour
 * chips). Choosing a collection refines the chips + results to that collection.
 * Used by the PO form, the invoice form, and (in future) the inventory page —
 * change it here, it changes everywhere. The catalog is supplied by the caller
 * (see `useCatalog`).
 */
export function ProductCombobox({
  variants,
  collections,
  value,
  onSelect,
  onSelectMany,
  exclude,
  placeholder = "Search products…",
  disabled = false,
  initialCollectionId = "",
  onCollectionChange,
}: {
  variants: CatalogVariant[];
  /** Optional Shopify collections for the collection selector. */
  collections?: CatalogCollection[];
  value: string; // selected shopifyVariantId ("" = none)
  onSelect: (variant: CatalogVariant) => void;
  /** When provided, each result gets a checkbox and an "Add" button appears once
   *  one or more are checked — lets the user add several products at once.
   *  Single-clicking a row still adds just that item (via onSelect). */
  onSelectMany?: (variants: CatalogVariant[]) => void;
  /** Variant ids to hide (e.g. already chosen on other lines). */
  exclude?: Set<string>;
  placeholder?: string;
  disabled?: boolean;
  /** Collection to pre-select when this picker mounts (e.g. the previous
   *  line's collection, so adding a line keeps the same collection). */
  initialCollectionId?: string;
  /** Called whenever the user changes the collection, so the parent can
   *  remember it for the next line. */
  onCollectionChange?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [sizes, setSizes] = useState<Set<number>>(new Set());
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<Set<string>>(new Set());
  const [collectionId, setCollectionId] = useState(initialCollectionId);
  // Multi-select: variant ids checked for a batch "Add" (only when onSelectMany).
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = variants.find((v) => v.shopifyVariantId === value) ?? null;

  // Narrow to the chosen collection (if any); chips + results derive from this
  // pool, so size/colour options refine to what's actually in that collection.
  const selectedCollection = collections?.find((c) => c.id === collectionId) ?? null;
  const pool = selectedCollection
    ? variants.filter((v) => selectedCollection.variantIds.has(v.shopifyVariantId))
    : variants;

  const allSizes = [
    ...new Set(pool.map((v) => v.sizeMm).filter((s): s is number => s != null)),
  ].sort((a, b) => a - b);
  const allColors = [
    ...new Set(pool.map((v) => v.color).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b));
  const allMaterials = [
    ...new Set(pool.map((v) => v.material).filter((m): m is string => !!m)),
  ].sort((a, b) => a.localeCompare(b));

  function changeCollection(id: string) {
    // Reset the chip filters so a stale size/colour/material can't hide the new pool.
    setCollectionId(id);
    setSizes(new Set());
    setColors(new Set());
    setMaterials(new Set());
    setActive(0);
    onCollectionChange?.(id);
  }

  function toggleSize(s: number) {
    setActive(0);
    setSizes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }
  function toggleColor(c: string) {
    setActive(0);
    setColors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function toggleMaterial(m: string) {
    setActive(0);
    setMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setChecked(new Set());
      // Focus the search box as soon as the dropdown opens.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addChecked() {
    // Resolve from the full catalog so items checked under a previous
    // collection/filter are still included.
    const picked = variants.filter((v) => checked.has(v.shopifyVariantId));
    if (picked.length > 0) onSelectMany?.(picked);
    setChecked(new Set());
    setOpen(false);
  }

  const q = query.trim().toLowerCase();
  const results = pool
    .filter((v) => !exclude?.has(v.shopifyVariantId) || v.shopifyVariantId === value)
    .filter((v) => sizes.size === 0 || (v.sizeMm != null && sizes.has(v.sizeMm)))
    .filter((v) => colors.size === 0 || (v.color != null && colors.has(v.color)))
    .filter((v) => materials.size === 0 || (v.material != null && materials.has(v.material)))
    .filter(
      (v) =>
        !q ||
        `${v.sku} ${v.title} ${v.variantTitle ?? ""}`.toLowerCase().includes(q),
    )
    .sort((a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku))
    .slice(0, MAX_RESULTS);

  function choose(v: CatalogVariant) {
    onSelect(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[220px] flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("truncate", !selected && "text-zinc-400")}>
          {selected ? variantLabel(selected) : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          {collections && collections.length > 0 && (
            <div className="border-b border-zinc-100 px-2.5 py-2">
              <select
                value={collectionId}
                onChange={(e) => changeCollection(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
              >
                <option value="">All collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-zinc-100 px-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="h-9 w-full bg-transparent text-sm focus:outline-none"
            />
          </div>

          {(allSizes.length > 0 || allColors.length > 0 || allMaterials.length > 0) && (
            <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-2.5 py-2">
              {allSizes.map((s) => (
                <button
                  key={`size-${s}`}
                  type="button"
                  onClick={() => toggleSize(s)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    sizes.has(s)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                  )}
                >
                  {s}mm
                </button>
              ))}
              {allColors.map((c) => (
                <button
                  key={`color-${c}`}
                  type="button"
                  onClick={() => toggleColor(c)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    colors.has(c)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                  )}
                >
                  {c}
                </button>
              ))}
              {allMaterials.map((m) => (
                <button
                  key={`material-${m}`}
                  type="button"
                  onClick={() => toggleMaterial(m)}
                  title="Material"
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    materials.has(m)
                      ? "border-amber-600 bg-amber-600 text-white"
                      : "border-amber-200 text-amber-700 hover:bg-amber-50",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {onSelectMany && checked.size > 0 && (
            <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
              <button
                type="button"
                onClick={addChecked}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800"
              >
                Add {checked.size}
              </button>
              <span className="text-xs text-zinc-500">{checked.size} selected</span>
            </div>
          )}

          <ul className="max-h-64 overflow-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-400">No matching products.</li>
            ) : (
              results.map((v, i) => (
                <li
                  key={v.shopifyVariantId}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm",
                    i === active ? "bg-zinc-100" : "hover:bg-zinc-50",
                  )}
                  onMouseEnter={() => setActive(i)}
                >
                  {onSelectMany && (
                    <input
                      type="checkbox"
                      checked={checked.has(v.shopifyVariantId)}
                      onChange={() => toggleCheck(v.shopifyVariantId)}
                      aria-label={`Select ${variantLabel(v)}`}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => choose(v)}
                    className="flex flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="truncate">{variantLabel(v)}</span>
                    {v.shopifyVariantId === value && (
                      <Check className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
