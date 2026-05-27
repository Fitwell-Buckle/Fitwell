"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import type { CustomerMatch } from "@/app/api/production/customer-search/route";

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

/**
 * Text field that searches the synced Shopify customer list as you type and
 * lets you link a match. Shared by the B2B customer form and the PO inline
 * "Add B2B customer" flow so both search Shopify identically.
 */
export function CustomerSearchField({
  label,
  type,
  value,
  onChange,
  onPick,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (m: CustomerMatch) => void;
}) {
  const [results, setResults] = useState<CustomerMatch[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleType(v: string) {
    onChange(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v.trim().length < 2) return setResults([]);
      try {
        const res = await fetch(
          `/api/production/customer-search?q=${encodeURIComponent(v.trim())}`,
        );
        const d = await res.json();
        if (res.ok) setResults((d.data ?? []) as CustomerMatch[]);
      } catch {
        /* ignore */
      }
    }, 250);
  }

  return (
    <div className="relative">
      {label && <label className={fieldLabel}>{label}</label>}
      <Input
        type={type}
        value={value}
        autoComplete="off"
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-md">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                  setResults([]);
                }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-zinc-50"
              >
                <span className="text-sm text-zinc-900">{m.name}</span>
                {m.email && <span className="text-xs text-zinc-400">{m.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
