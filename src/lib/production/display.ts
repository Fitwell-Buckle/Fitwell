import type { ProductionStage } from "./stages";

export const PO_STATUSES = ["active", "on_hold", "complete", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const STATUS_LABELS: Record<PoStatus, string> = {
  active: "Open",
  on_hold: "On hold",
  complete: "Complete",
  cancelled: "Cancelled",
};

// An "open" PO is still in flight — active or on hold. The production board
// always shows open POs regardless of the issued-date window (so a long-running
// PO never silently ages out of the default view); the date filter applies only
// to completed/historical POs.
export function isOpenPoStatus(status: string): boolean {
  return status === "active" || status === "on_hold";
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-blue-50 text-blue-700";
    case "on_hold":
      return "bg-amber-50 text-amber-700";
    case "complete":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "bg-zinc-100 text-zinc-500";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

export function stageBadgeClass(stage: ProductionStage | "mixed"): string {
  if (stage === "complete") return "bg-emerald-50 text-emerald-700";
  if (stage === "mixed") return "bg-purple-50 text-purple-700";
  return "bg-zinc-100 text-zinc-600";
}

/** Solid fill colour per stage for the Gantt timeline bars. */
export const STAGE_BAR: Record<ProductionStage, string> = {
  supplier_po: "bg-zinc-400",
  stamping: "bg-orange-400",
  edm: "bg-amber-400",
  polishing: "bg-yellow-400",
  logo: "bg-lime-500",
  plating: "bg-sky-400",
  qc: "bg-indigo-400",
  packaging: "bg-violet-400",
  complete: "bg-emerald-500",
};

/** Format a YYYY-MM-DD date string for display without timezone drift. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Buckle size = trailing digits of the SKU (e.g. FBW001-SS-16 → 16). */
export function skuSize(sku: string): number {
  const m = sku.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 999999; // unknown sizes sort last
}

export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
