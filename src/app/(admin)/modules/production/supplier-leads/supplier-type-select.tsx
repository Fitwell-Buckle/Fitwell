"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { SUPPLIER_PERSONA_PRESETS } from "@/lib/suppliers/lead-constants";

// Multi-select for supplier personas. Seeded with the built-in presets +
// whatever's already selected; on mount it also pulls every persona ever saved
// (GET /api/supplier-leads/types) so past "Other" entries are offered. Typing a
// new persona under "Other" adds it locally + selects it; saving the lead
// persists it so it shows for everyone next time.
function mergeOptions(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const v of list) {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

export function SupplierTypeSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [options, setOptions] = useState<string[]>(() =>
    mergeOptions([...SUPPLIER_PERSONA_PRESETS], value),
  );
  const [other, setOther] = useState("");

  // Pull previously-saved personas so "Other" entries from past captures show.
  useEffect(() => {
    let alive = true;
    fetch("/api/supplier-leads/types")
      .then((r) => r.json())
      .then((body) => {
        if (alive && Array.isArray(body.data)) {
          setOptions((prev) => mergeOptions([...SUPPLIER_PERSONA_PRESETS], body.data, prev, value));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // value intentionally only read at mount-merge; selection toggles handle the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(opt: string) {
    const key = opt.toLowerCase();
    if (value.some((v) => v.toLowerCase() === key)) {
      onChange(value.filter((v) => v.toLowerCase() !== key));
    } else {
      onChange([...value, opt]);
    }
  }

  function addOther() {
    const v = other.replace(/\s+/g, " ").trim();
    if (!v) return;
    setOptions((prev) => mergeOptions(prev, [v]));
    if (!value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...value, v]);
    }
    setOther("");
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.some((v) => v.toLowerCase() === opt.toLowerCase());
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={selected}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOther();
            }
          }}
          placeholder="Other — type a persona and add"
          className="h-9 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
        />
        <button
          type="button"
          onClick={addOther}
          disabled={!other.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-md bg-zinc-100 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}
