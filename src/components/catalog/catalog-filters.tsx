"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { STAGES, STAGE_LABELS } from "@/lib/production/stages";
import { PO_STATUSES, STATUS_LABELS } from "@/lib/production/display";

const selectClass =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

export interface CatalogFilterOption {
  id: string;
  title: string;
}

/** Optional production-only filters (supplier / status / stage). */
export interface ProductionFilterProps {
  suppliers: { id: string; name: string }[];
  supplierId: string;
  status: string;
  stage: string;
}

/**
 * The standardized catalog filter widget — Collection · Size · Colour ·
 * Material. Reused on the Production Board, Production Timeline, Incoming
 * Inventory, and Product List pages, so a change here applies everywhere. It
 * drives the URL query params (`collection`, `size`, `color`, `material`); each
 * page filters its own data from those params. Pass `production` to also render
 * the supplier / status / stage filters used on the board + timeline.
 */
export function CatalogFilters({
  collections,
  collection,
  sizeOptions,
  size,
  colorOptions,
  color,
  materialOptions,
  material,
  production,
}: {
  collections: CatalogFilterOption[];
  collection: string;
  sizeOptions: number[];
  size: string;
  colorOptions: string[];
  color: string;
  materialOptions: string[];
  material: string;
  production?: ProductionFilterProps;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Instantly re-filter on change by updating the URL query (server re-renders).
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {collections.length > 0 && (
        <select
          value={collection}
          onChange={(e) => setParam("collection", e.target.value)}
          className={selectClass}
          aria-label="Collection"
        >
          <option value="">All collections</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}
      {sizeOptions.length > 0 && (
        <select
          value={size}
          onChange={(e) => setParam("size", e.target.value)}
          className={selectClass}
          aria-label="Size"
        >
          <option value="">All sizes</option>
          {sizeOptions.map((s) => (
            <option key={s} value={String(s)}>
              {s}mm
            </option>
          ))}
        </select>
      )}
      {colorOptions.length > 0 && (
        <select
          value={color}
          onChange={(e) => setParam("color", e.target.value)}
          className={selectClass}
          aria-label="Colour"
        >
          <option value="">All colours</option>
          {colorOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {materialOptions.length > 0 && (
        <select
          value={material}
          onChange={(e) => setParam("material", e.target.value)}
          className={selectClass}
          aria-label="Material"
        >
          <option value="">All materials</option>
          {materialOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
