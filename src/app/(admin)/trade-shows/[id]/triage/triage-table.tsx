"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VENDOR_SIDES,
  VENDOR_SIDE_LABELS,
  FOLLOW_UP_TEMPS,
  FOLLOW_UP_TEMP_LABELS,
  LEAD_VALUE_MAX,
  type VendorSide,
  type FollowUpTemp,
} from "@/lib/tradeshows/constants";

export interface TriageVendor {
  id: string;
  companyName: string;
  booth: string | null;
  category: string | null;
  side: string;
  followUpTemp: string | null;
  leadValue: number | null;
  seedNotes: string | null;
  notes: string | null;
  // Pipeline links — set once the vendor has been promoted to that side.
  leadId: string | null;
  supplierLeadId: string | null;
}

type PromoteTarget = "supplier" | "customer";

// Active-chip colour per temperature (matches the vendor detail page).
const TEMP_ACTIVE_CLASS: Record<FollowUpTemp, string> = {
  hot: "border-red-500 bg-red-500 text-white",
  warm: "border-amber-500 bg-amber-500 text-white",
  cold: "border-sky-500 bg-sky-500 text-white",
};

export function TriageTable({
  showId,
  showName,
  vendors: initial,
}: {
  showId: string;
  showName: string;
  vendors: TriageVendor[];
}) {
  const [vendors, setVendors] = useState(initial);
  // Keyed by `${vendorId}:${target}` while a promote request is in flight.
  const [promoting, setPromoting] = useState<Set<string>>(new Set());

  // A vendor counts as triaged once it has both a temperature and a value —
  // side always has a value (defaults to "both"), so it isn't part of the bar.
  const triaged = vendors.filter(
    (v) => v.followUpTemp != null && v.leadValue != null,
  ).length;
  const pct = vendors.length
    ? Math.round((triaged / vendors.length) * 100)
    : 0;

  // Optimistic per-field save. Rows keep their position while editing (no
  // re-sort) so nothing jumps around mid-triage. Rolls back on failure.
  async function update(id: string, fields: Partial<TriageVendor>) {
    const prev = vendors.find((v) => v.id === id);
    if (!prev) return;
    setVendors((list) =>
      list.map((v) => (v.id === id ? { ...v, ...fields } : v)),
    );
    try {
      const res = await fetch(`/api/trade-shows/${showId}/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVendors((list) => list.map((v) => (v.id === id ? prev : v)));
      toast.error("Couldn't save — try again");
    }
  }

  // Promote a vendor into a CRM pipeline (idempotent server-side). On success
  // we store the returned link id so the cell flips to a "Linked" shortcut.
  async function promote(id: string, target: PromoteTarget) {
    const key = `${id}:${target}`;
    setPromoting((s) => new Set(s).add(key));
    try {
      const res = await fetch(
        `/api/trade-shows/${showId}/vendors/${id}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Convert failed");
      setVendors((list) =>
        list.map((v) =>
          v.id === id
            ? {
                ...v,
                leadId: target === "customer" ? json.data.leadId : v.leadId,
                supplierLeadId:
                  target === "supplier"
                    ? json.data.supplierLeadId
                    : v.supplierLeadId,
              }
            : v,
        ),
      );
      toast.success(
        target === "supplier"
          ? "Added to Supplier Leads"
          : "Added to Customer Leads",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setPromoting((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="pb-20">
      <Link
        href={`/trade-shows/${showId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> {showName}
      </Link>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Triage</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Set type, temperature, and value for every vendor — saves as you go.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium text-zinc-700">
            {triaged} / {vendors.length} triaged
          </div>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Temp</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Convert</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-zinc-400"
                >
                  No vendors on this show yet.
                </td>
              </tr>
            ) : (
              vendors.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-zinc-100 last:border-0 align-top"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/trade-shows/${showId}/vendors/${v.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {v.companyName}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-zinc-500">
                      {v.booth && (
                        <span className="font-mono text-zinc-600">
                          {v.booth}
                        </span>
                      )}
                      {v.category && <span>{v.category}</span>}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="max-w-xs space-y-1 text-xs text-zinc-600">
                      {v.seedNotes && (
                        <p>
                          <span className="font-medium text-zinc-400">
                            Pre-show:{" "}
                          </span>
                          {v.seedNotes}
                        </p>
                      )}
                      {v.notes && (
                        <p>
                          <span className="font-medium text-zinc-400">
                            Booth:{" "}
                          </span>
                          {v.notes}
                        </p>
                      )}
                      {!v.seedNotes && !v.notes && (
                        <span className="text-zinc-300">—</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
                      {VENDOR_SIDES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => update(v.id, { side: s })}
                          className={cn(
                            "rounded px-2 py-1 text-xs transition-colors",
                            v.side === s
                              ? "bg-brand text-white"
                              : "text-zinc-600 hover:bg-zinc-50",
                          )}
                        >
                          {VENDOR_SIDE_LABELS[s as VendorSide]}
                        </button>
                      ))}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {FOLLOW_UP_TEMPS.map((t) => {
                        const active = v.followUpTemp === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            // Click the active chip again to clear it.
                            onClick={() =>
                              update(v.id, {
                                followUpTemp: active ? null : t,
                              })
                            }
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs transition-colors",
                              active
                                ? TEMP_ACTIVE_CLASS[t]
                                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                            )}
                          >
                            {FOLLOW_UP_TEMP_LABELS[t]}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center">
                      {Array.from({ length: LEAD_VALUE_MAX }, (_, i) => {
                        const n = i + 1;
                        const filled =
                          v.leadValue != null && n <= v.leadValue;
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${n} star${n > 1 ? "s" : ""}`}
                            // Click the current top star to clear the rating.
                            onClick={() =>
                              update(v.id, {
                                leadValue: v.leadValue === n ? null : n,
                              })
                            }
                            className="rounded p-0.5 text-amber-400 transition-colors hover:text-amber-500"
                          >
                            <Star
                              className={cn(
                                "h-5 w-5",
                                filled ? "fill-amber-400" : "text-zinc-300",
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {(v.side === "supplier" || v.side === "both") && (
                        <ConvertAction
                          label="Supplier"
                          linkedHref={
                            v.supplierLeadId
                              ? `/modules/production/supplier-leads/${v.supplierLeadId}`
                              : null
                          }
                          busy={promoting.has(`${v.id}:supplier`)}
                          onConvert={() => promote(v.id, "supplier")}
                        />
                      )}
                      {(v.side === "customer" || v.side === "both") && (
                        <ConvertAction
                          label="Customer"
                          linkedHref={
                            v.leadId ? `/leads/${v.leadId}` : null
                          }
                          busy={promoting.has(`${v.id}:customer`)}
                          onConvert={() => promote(v.id, "customer")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One pipeline action for a triage row. Shows a "Linked" shortcut once the
// vendor has been promoted to this side, otherwise a compact convert button.
function ConvertAction({
  label,
  linkedHref,
  busy,
  onConvert,
}: {
  label: string;
  linkedHref: string | null;
  busy: boolean;
  onConvert: () => void;
}) {
  if (linkedHref) {
    return (
      <Link
        href={linkedHref}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
      >
        <Check className="h-3 w-3" /> {label}
        <ExternalLink className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onConvert}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span aria-hidden>→</span>
      )}
      {label}
    </button>
  );
}
