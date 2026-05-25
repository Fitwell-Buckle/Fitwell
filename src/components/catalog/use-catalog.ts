"use client";

import { useEffect, useState } from "react";
import type { CatalogVariant } from "@/app/api/production/products/route";
import type { CatalogGroup } from "@/app/api/production/collections/route";
import type { CatalogCollection } from "./product-combobox";

export interface CatalogState {
  variants: CatalogVariant[];
  collections: CatalogCollection[];
  loading: boolean;
  error: boolean;
}

/**
 * Load the Shopify catalog once for the shared ProductCombobox. Prefers the
 * grouped collections endpoint (so the chooser gets a collection selector +
 * membership); falls back to the flat catalog if collections aren't available.
 * One source of truth so every chooser behaves the same.
 */
export function useCatalog(): CatalogState {
  const [variants, setVariants] = useState<CatalogVariant[] | null>(null);
  const [collections, setCollections] = useState<CatalogCollection[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/production/collections");
        const d = await res.json();
        if (!active) return;
        if (res.ok && Array.isArray(d.data) && d.data.length > 0) {
          const groups = d.data as CatalogGroup[];
          // Dedupe variants across collections (a product can be in several).
          const seen = new Map<string, CatalogVariant>();
          for (const g of groups) {
            for (const v of g.variants) {
              if (!seen.has(v.shopifyVariantId)) seen.set(v.shopifyVariantId, v);
            }
          }
          setVariants([...seen.values()]);
          setCollections(
            groups.map((g) => ({
              id: g.id,
              title: g.title,
              variantIds: new Set(g.variants.map((v) => v.shopifyVariantId)),
            })),
          );
          return;
        }
      } catch {
        /* fall through to the flat catalog */
      }
      try {
        const res = await fetch("/api/production/products");
        const d = await res.json();
        if (!active) return;
        if (res.ok && Array.isArray(d.data)) {
          setVariants(d.data as CatalogVariant[]);
          setCollections([]);
          return;
        }
        setError(true);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return {
    variants: variants ?? [],
    collections,
    loading: variants === null && !error,
    error,
  };
}
