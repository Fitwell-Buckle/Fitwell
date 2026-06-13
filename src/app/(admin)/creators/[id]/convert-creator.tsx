"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const inputCls =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

const PERSONAS = [
  { value: "", label: "Persona (optional)" },
  { value: "strap_oem", label: "Strap OEM" },
  { value: "watch_oem", label: "Watch OEM" },
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
];

type Mode = null | "lead" | "company" | "customer";
type CustomerHit = { id: string; name: string; email: string | null };

/**
 * Reclassify a creator that's really a B2B prospect or a retail customer.
 * Creates/links the target, archives the creator, and navigates to the new
 * record. The strap-brand-surfaced-by-followers case.
 */
export function ConvertCreator({
  creatorId,
  creatorName,
}: {
  creatorId: string;
  creatorName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [persona, setPersona] = useState("");
  const [companyName, setCompanyName] = useState(creatorName);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);

  async function convert(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Convert failed");
      const { target, id } = json.data as { target: string; id: string };
      toast.success(`Converted to ${target}`);
      const dest =
        target === "lead"
          ? `/leads/${id}`
          : target === "company"
            ? `/customers/brands/${id}`
            : `/customers/${id}`;
      router.push(dest);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Convert failed");
      setBusy(false);
    }
  }

  async function searchCustomers(q: string) {
    setQuery(q);
    if (q.trim().length < 2) return setHits([]);
    try {
      const res = await fetch(
        `/api/production/customer-search?q=${encodeURIComponent(q)}`,
      );
      const json = await res.json();
      setHits(json.data ?? []);
    } catch {
      setHits([]);
    }
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Not a creator?</span>
        <button
          onClick={() => setMode("lead")}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          → B2B lead
        </button>
        <button
          onClick={() => {
            setCompanyName(creatorName);
            setMode("company");
          }}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          → B2B company
        </button>
        <button
          onClick={() => setMode("customer")}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          → Customer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      {mode === "lead" && (
        <>
          <span className="text-xs font-medium text-zinc-500">→ B2B lead:</span>
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            {PERSONAS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              convert({ target: "lead", personaTag: persona || null })
            }
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Converting…" : "Create lead"}
          </button>
        </>
      )}

      {mode === "company" && (
        <>
          <span className="text-xs font-medium text-zinc-500">
            → B2B company:
          </span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name"
            className={`${inputCls} w-48`}
          />
          <button
            onClick={() =>
              convert({ target: "company", companyName: companyName.trim() })
            }
            disabled={busy || !companyName.trim()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Converting…" : "Create company"}
          </button>
        </>
      )}

      {mode === "customer" && (
        <div className="w-full">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">
              → Customer:
            </span>
            <input
              value={query}
              onChange={(e) => searchCustomers(e.target.value)}
              placeholder="Search existing Shopify customer…"
              className={`${inputCls} flex-1`}
              autoFocus
            />
            <button
              onClick={() => convert({ target: "customer" })}
              disabled={busy}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
              title="No Shopify record — create a manual customer from this creator"
            >
              Create new
            </button>
          </div>
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => convert({ target: "customer", customerId: h.id })}
              disabled={busy}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-zinc-50"
            >
              <span className="font-medium">{h.name}</span>
              <span className="font-mono text-[11px] text-zinc-400">
                {h.email}
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="px-2 py-1 text-xs text-zinc-400">
              No match — use &ldquo;Create new&rdquo; for a manual customer.
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => setMode(null)}
        disabled={busy}
        className="text-xs text-zinc-500 hover:text-zinc-800"
      >
        Cancel
      </button>
    </div>
  );
}
