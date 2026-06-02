"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Person {
  id: string;
  label: string;
  email: string | null;
}
interface SearchResult {
  kind: "lead" | "customer";
  id: string;
  label: string;
  sublabel: string | null;
  companyId: string | null;
}

const KIND_TAG: Record<"lead" | "customer", string> = {
  lead: "bg-sky-100 text-sky-700",
  customer: "bg-emerald-100 text-emerald-700",
};

// The people attached to a B2B company: its leads + Shopify customers. Each is
// removable, and a typeahead lets you associate either kind. Backed by
// /api/crm/people-search + /api/production/companies/[id]/people.
export function CompanyPeople({
  companyId,
  leads,
  customers,
}: {
  companyId: string;
  leads: Person[];
  customers: Person[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/crm/people-search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => alive && setResults(d.data?.results ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function mutate(
    kind: "lead" | "customer",
    entityId: string,
    action: "add" | "remove",
  ) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/production/companies/${companyId}/people`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, entityId, action }),
        },
      );
      if (res.ok) {
        setQ("");
        setResults([]);
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function row(kind: "lead" | "customer", p: Person) {
    const href = kind === "lead" ? `/leads/${p.id}` : `/customers/${p.id}`;
    return (
      <li
        key={`${kind}-${p.id}`}
        className="flex items-center justify-between gap-3 py-2"
      >
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <Link
              href={href}
              className="truncate text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
            >
              {p.label}
            </Link>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TAG[kind]}`}
            >
              {kind.toUpperCase()}
            </span>
          </span>
          {p.email && <p className="text-xs text-zinc-500">{p.email}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => mutate(kind, p.id, "remove")}
        >
          Remove
        </Button>
      </li>
    );
  }

  return (
    <Card className="mt-6">
      <CardContent>
        <p className="mb-3 text-sm font-semibold text-zinc-900">People</p>

        {leads.length === 0 && customers.length === 0 ? (
          <p className="py-2 text-sm text-zinc-400">No people attached yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {leads.map((l) => row("lead", l))}
            {customers.map((c) => row("customer", c))}
          </ul>
        )}

        <div ref={wrapRef} className="relative mt-3">
          <input
            type="text"
            value={q}
            placeholder="Add a person — search leads or customers…"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
              {results.map((r) => {
                const here = r.companyId === companyId;
                return (
                  <button
                    key={`${r.kind}-${r.id}`}
                    type="button"
                    disabled={busy || here}
                    onClick={() => mutate(r.kind, r.id, "add")}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-zinc-900">{r.label}</span>
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TAG[r.kind]}`}
                    >
                      {r.kind.toUpperCase()}
                    </span>
                    {r.sublabel && (
                      <span className="ml-2 text-xs text-zinc-400">
                        {r.sublabel}
                      </span>
                    )}
                    {here && (
                      <span className="ml-2 text-xs text-zinc-400">
                        · already here
                      </span>
                    )}
                    {!here && r.companyId && (
                      <span className="ml-2 text-xs text-amber-600">
                        · linked elsewhere
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
