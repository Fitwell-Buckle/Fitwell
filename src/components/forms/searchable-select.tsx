"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";

export interface SearchableItem {
  id: string;
  label: string;
  /** Optional secondary line shown below the label in the list. */
  detail?: string | null;
  /**
   * Lowercased haystack used for typeahead matching. Build it from every field
   * the user might search by (name, contact name, contact email, address…).
   */
  searchText: string;
}

/**
 * Generic dropdown with typeahead search and a sticky "Add new…" row pinned
 * to the top of the panel. Used by the invoice + PO forms so both pages share
 * the same shape:
 *   1. open the dropdown
 *   2. either click "+ Add new…" (top) or type to filter + click a match
 *
 * The component is value-bound: `value` shows on the closed trigger; in
 * multi-add flows (PO suppliers) pass `value=""` so the trigger always shows
 * the placeholder and every pick fires `onChange`.
 */
export function SearchableSelectWithAdd({
  value,
  onChange,
  items,
  placeholder = "Select…",
  addLabel = "Add new…",
  onAddNew,
  disabled,
  searchPlaceholder = "Search by name, email…",
}: {
  value: string;
  onChange: (id: string) => void;
  items: SearchableItem[];
  placeholder?: string;
  addLabel?: string;
  onAddNew: () => void;
  disabled?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus the search input as soon as the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.searchText.includes(t));
  }, [items, q]);

  const selected = items.find((i) => i.id === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "text-zinc-900" : "text-zinc-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setQ("");
                  }
                }}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {/* Pinned "Add new" — always at the top of the panel. */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                setQ("");
                onAddNew();
              }}
              className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <Plus className="h-4 w-4 text-zinc-500" />
              {addLabel}
            </button>

            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-zinc-400">No matches.</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(it.id);
                    setOpen(false);
                    setQ("");
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-zinc-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-zinc-50 ${
                    it.id === value ? "bg-zinc-50" : ""
                  }`}
                >
                  <span className="truncate text-zinc-900">{it.label}</span>
                  {it.detail && (
                    <span className="truncate text-xs text-zinc-500">{it.detail}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
