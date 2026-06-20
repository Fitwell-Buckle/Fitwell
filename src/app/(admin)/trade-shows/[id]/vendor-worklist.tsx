"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Star,
  Users,
  Search,
  ChevronRight,
  Link2,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  VENDOR_SIDE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  type VendorSide,
  type FollowUpStatus,
} from "@/lib/tradeshows/constants";

export interface WorklistVendor {
  id: string;
  booth: string | null;
  companyName: string;
  category: string | null;
  side: string;
  priority: boolean;
  visited: boolean;
  sampleGiven: boolean;
  followUpStatus: string;
  contactCount: number;
  leadId: string | null;
  supplierLeadId: string | null;
}

const SIDE_BADGE: Record<string, string> = {
  supplier: "bg-amber-50 text-amber-700",
  customer: "bg-sky-50 text-sky-700",
  both: "bg-violet-50 text-violet-700",
};

type SideFilter = "all" | "supplier" | "customer";
type VisitedFilter = "all" | "unvisited" | "visited";

export function VendorWorklist({
  showId,
  showName,
  vendors: initial,
}: {
  showId: string;
  showName: string;
  vendors: WorklistVendor[];
}) {
  const [vendors, setVendors] = useState(initial);
  const [side, setSide] = useState<SideFilter>("all");
  const [visited, setVisited] = useState<VisitedFilter>("all");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const visitedCount = vendors.filter((v) => v.visited).length;
  const pct = vendors.length
    ? Math.round((visitedCount / vendors.length) * 100)
    : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (side !== "all" && v.side !== side && v.side !== "both") return false;
      if (visited === "visited" && !v.visited) return false;
      if (visited === "unvisited" && v.visited) return false;
      if (priorityOnly && !v.priority) return false;
      if (q) {
        const hay = `${v.companyName} ${v.booth ?? ""} ${
          v.category ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vendors, side, visited, priorityOnly, search]);

  async function toggleVisited(v: WorklistVendor) {
    const next = !v.visited;
    setBusy((b) => ({ ...b, [v.id]: true }));
    // Optimistic.
    setVendors((list) =>
      list.map((x) => (x.id === v.id ? { ...x, visited: next } : x)),
    );
    try {
      const res = await fetch(
        `/api/trade-shows/${showId}/vendors/${v.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visited: next }),
        },
      );
      if (!res.ok) throw new Error();
    } catch {
      // Roll back.
      setVendors((list) =>
        list.map((x) => (x.id === v.id ? { ...x, visited: !next } : x)),
      );
      toast.error("Couldn't update — try again");
    } finally {
      setBusy((b) => ({ ...b, [v.id]: false }));
    }
  }

  return (
    <div className="pb-20">
      <PageHeader title={showName} />

      {/* Progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {visitedCount} / {vendors.length} visited
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, booth, category…"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={side}
            onChange={(v) => setSide(v as SideFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "supplier", label: "Suppliers" },
              { value: "customer", label: "Customers" },
            ]}
          />
          <Segmented
            value={visited}
            onChange={(v) => setVisited(v as VisitedFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "unvisited", label: "To do" },
              { value: "visited", label: "Visited" },
            ]}
          />
          <button
            type="button"
            onClick={() => setPriorityOnly((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
              priorityOnly
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
            )}
          >
            <Star
              className={cn("h-3.5 w-3.5", priorityOnly && "fill-amber-500")}
            />
            Priority
          </button>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            No vendors match these filters.
          </p>
        ) : (
          filtered.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
            >
              {/* Visited checkbox */}
              <button
                type="button"
                disabled={busy[v.id]}
                onClick={() => toggleVisited(v)}
                aria-label={v.visited ? "Mark unvisited" : "Mark visited"}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                  v.visited
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-zinc-300 bg-white text-transparent hover:border-zinc-400",
                )}
              >
                <Check className="h-4 w-4" />
              </button>

              {/* Body — links to detail */}
              <Link
                href={`/trade-shows/${showId}/vendors/${v.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {v.priority && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                    <span className="truncate font-medium text-zinc-900">
                      {v.companyName}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                    {v.booth && (
                      <span className="font-mono text-zinc-600">{v.booth}</span>
                    )}
                    {v.category && <span className="truncate">{v.category}</span>}
                  </div>
                </div>

                {/* Indicators */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {(v.leadId || v.supplierLeadId) && (
                    <Link2 className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  {v.sampleGiven && (
                    <Gift className="h-3.5 w-3.5 text-violet-500" />
                  )}
                  {v.contactCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-zinc-400">
                      <Users className="h-3.5 w-3.5" />
                      {v.contactCount}
                    </span>
                  )}
                  {v.followUpStatus !== "none" && (
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      {FOLLOW_UP_STATUS_LABELS[
                        v.followUpStatus as FollowUpStatus
                      ] ?? v.followUpStatus}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      SIDE_BADGE[v.side] ?? "bg-zinc-100 text-zinc-600",
                    )}
                  >
                    {VENDOR_SIDE_LABELS[v.side as VendorSide] ?? v.side}
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-300" />
                </div>
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-sm transition-colors",
            value === o.value
              ? "bg-brand text-white"
              : "text-zinc-600 hover:bg-zinc-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
