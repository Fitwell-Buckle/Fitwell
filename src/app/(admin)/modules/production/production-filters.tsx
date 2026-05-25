"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { STAGES, STAGE_LABELS } from "@/lib/production/stages";
import { PO_STATUSES, STATUS_LABELS } from "@/lib/production/display";

const selectClass =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

export function ProductionFilters({
  suppliers,
  supplierId,
  status,
  stage,
  size,
  color,
  sizeOptions,
  colorOptions,
}: {
  suppliers: { id: string; name: string }[];
  supplierId: string;
  status: string;
  stage: string;
  size: string;
  color: string;
  sizeOptions: number[];
  colorOptions: string[];
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
      <select
        value={supplierId}
        onChange={(e) => setParam("supplier", e.target.value)}
        className={selectClass}
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => setParam("status", e.target.value)}
        className={selectClass}
      >
        {PO_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
        <option value="all">All statuses</option>
      </select>
      <select
        value={stage}
        onChange={(e) => setParam("stage", e.target.value)}
        className={selectClass}
      >
        <option value="">All stages</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {sizeOptions.length > 0 && (
        <select
          value={size}
          onChange={(e) => setParam("size", e.target.value)}
          className={selectClass}
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
        >
          <option value="">All colours</option>
          {colorOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
