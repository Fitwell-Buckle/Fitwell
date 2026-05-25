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

/**
 * Shared searchable product picker. Click to open, type to filter the Shopify
 * catalog by SKU / title, click to select. Used by the PO form, the invoice
 * form, and (in future) the inventory page — change it here, it changes
 * everywhere. The catalog is supplied by the caller (see `useCatalog`).
 */
export function ProductCombobox({
  variants,
  value,
  onSelect,
  exclude,
  placeholder = "Search products…",
  disabled = false,
}: {
  variants: CatalogVariant[];
  value: string; // selected shopifyVariantId ("" = none)
  onSelect: (variant: CatalogVariant) => void;
  /** Variant ids to hide (e.g. already chosen on other lines). */
  exclude?: Set<string>;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = variants.find((v) => v.shopifyVariantId === value) ?? null;

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
      // Focus the search box as soon as the dropdown opens.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = variants
    .filter((v) => !exclude?.has(v.shopifyVariantId) || v.shopifyVariantId === value)
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
          <ul className="max-h-64 overflow-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-400">No matching products.</li>
            ) : (
              results.map((v, i) => (
                <li key={v.shopifyVariantId}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(v)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                      i === active ? "bg-zinc-100" : "hover:bg-zinc-50",
                    )}
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
