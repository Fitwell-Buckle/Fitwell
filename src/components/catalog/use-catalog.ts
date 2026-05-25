"use client";

import { useEffect, useState } from "react";
import type { CatalogVariant } from "@/app/api/production/products/route";

export interface CatalogState {
  variants: CatalogVariant[];
  loading: boolean;
  error: boolean;
}

/**
 * Load the flattened Shopify catalog once for the shared ProductCombobox.
 * One source of truth so every chooser (PO, invoice, inventory) behaves the
 * same. `error` is true when the catalog can't be loaded (callers fall back to
 * manual entry).
 */
export function useCatalog(): CatalogState {
  const [variants, setVariants] = useState<CatalogVariant[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/production/products")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (Array.isArray(d.data)) setVariants(d.data as CatalogVariant[]);
        else setError(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    variants: variants ?? [],
    loading: variants === null && !error,
    error,
  };
}
