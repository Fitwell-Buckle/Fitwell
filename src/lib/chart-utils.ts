import type { Granularity } from "@/lib/date-range";
export type { Granularity };

export function formatBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "day") {
    const d = new Date(key);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (granularity === "week") {
    return `W${key.split("-W")[1]}`;
  }
  if (granularity === "month") {
    const d = new Date(key + "-01");
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return key;
}

export function dateToBucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  if (granularity === "day") return `${y}-${m}-${d}`;
  if (granularity === "month") return `${y}-${m}`;
  // ISO week
  const jan1 = new Date(y, 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  const week = String(Math.ceil((days + jan1.getDay() + 1) / 7)).padStart(2, "0");
  return `${y}-W${week}`;
}

export function generateBucketKeys(from: Date, to: Date, granularity: Granularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const current = new Date(from);
  while (current <= to) {
    const key = dateToBucketKey(current, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    current.setDate(current.getDate() + 1);
  }
  return keys;
}

export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// Shared Recharts styling
export const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#e4e4e7" } as const;
export const X_AXIS_STYLE = { fontSize: 11, fill: "#a1a1aa" } as const;
export const Y_AXIS_STYLE = { fontSize: 11, fill: "#a1a1aa" } as const;

// Color palette for chart series
export const COLORS = {
  revenue: "#18181b",
  metaSpend: "#3b82f6",
  googleSpend: "#f59e0b",
  orders: "#71717a",
  web: "#18181b",
  wholesale: "#a1a1aa",
  roas: "#10b981",
  sessions: "#3b82f6",
  users: "#71717a",
} as const;
