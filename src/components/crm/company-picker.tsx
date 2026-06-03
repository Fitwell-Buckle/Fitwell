"use client";

import { useEffect, useRef, useState } from "react";

export interface CompanyOption {
  id: string;
  name: string;
}

// Searchable company combobox: type to filter our companies, pick one to link
// (sets companyId), or "+ Add new company" to create it inline. Optional — clear
// to leave the lead unlinked (companyId null, free-text name allowed).
export function CompanyPicker({
  companies,
  companyId,
  companyName,
  onChange,
  disabled,
  placeholder = "Search companies…",
  contact,
}: {
  companies: CompanyOption[];
  companyId: string | null;
  companyName: string;
  onChange: (v: { companyId: string | null; companyName: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  // The person this company is being created for (the lead on the form). Seeds
  // the new company's contact name/email so the server auto-attaches them as
  // the primary contact — "turning a lead into a company" keeps the person.
  contact?: { name?: string | null; email?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = companyName.trim().toLowerCase();
  const matches = (
    q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies
  ).slice(0, 8);
  const exact = companies.some((c) => c.name.toLowerCase() === q);
  const canAddNew = q.length > 0 && !exact;

  async function addNew() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/production/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim(),
          contactName: contact?.name?.trim() || null,
          contactEmail: contact?.email?.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Couldn't create company.");
        return;
      }
      onChange({ companyId: json.data.id as string, companyName: companyName.trim() });
      setOpen(false);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={companyName}
          disabled={disabled || busy}
          placeholder={placeholder}
          onChange={(e) => {
            // Editing the text unlinks any selected company until they pick one.
            onChange({ companyId: null, companyName: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
        />
        {companyId && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            Linked
          </span>
        )}
      </div>

      {open && (matches.length > 0 || canAddNew) && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange({ companyId: c.id, companyName: c.name });
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              {c.name}
              {companyId === c.id ? " ✓" : ""}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              onClick={addNew}
              disabled={busy}
              className="block w-full border-t border-zinc-100 px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              {busy ? "Adding…" : `+ Add new company “${companyName.trim()}”`}
            </button>
          )}
        </div>
      )}

      {companyId && (
        <button
          type="button"
          onClick={() => onChange({ companyId: null, companyName: "" })}
          className="mt-1 text-xs text-zinc-400 hover:text-zinc-600"
        >
          Clear company
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
