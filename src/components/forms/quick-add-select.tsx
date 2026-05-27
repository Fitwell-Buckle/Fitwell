"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerSearchField } from "@/components/production/customer-search-field";

export type QuickAddField =
  | {
      key: string;
      label: string;
      type?: "text" | "email";
      required?: boolean;
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
    }
  | {
      key: string;
      label: string;
      // Searches synced Shopify customers; picking a match fills the field and
      // stores the matched customer id under `customerIdKey` (and name under
      // `nameKey`, if set) in the draft.
      type: "customer-search";
      required?: boolean;
      customerIdKey?: string;
      nameKey?: string;
    };

const ADD = "__add_new__";

const controlCls =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

/**
 * A <select> with an inline "Add new…" option. Picking it reveals a small form;
 * on save the parent's `onCreate` persists the record and the new option is
 * selected. Reusable: PO form (suppliers), invoice form (companies), etc.
 *
 * The parent owns the options list — `onCreate` should append the new record to
 * it (so the selection resolves) and return its id.
 */
export function QuickAddSelect({
  value,
  onChange,
  options,
  addLabel,
  fields,
  onCreate,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { value: string; label: string }[];
  addLabel: string;
  fields: QuickAddField[];
  onCreate: (
    values: Record<string, string>,
  ) => Promise<{ id: string } | { error: string }>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, v: string) {
    setDraft((d) => ({ ...d, [key]: v }));
  }

  async function create() {
    setError(null);
    for (const f of fields) {
      if ("required" in f && f.required && !(draft[f.key] ?? "").trim()) {
        return setError(`${f.label} is required.`);
      }
    }
    setBusy(true);
    try {
      const res = await onCreate(draft);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onChange(res.id);
      setAdding(false);
      setDraft({});
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (adding) {
    return (
      <div className="rounded-md border border-zinc-200 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                {f.label}
              </label>
              {f.type === "select" ? (
                <select
                  value={draft[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={controlCls}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "customer-search" ? (
                <CustomerSearchField
                  label=""
                  type="email"
                  value={draft[f.key] ?? ""}
                  onChange={(v) =>
                    setDraft((d) => {
                      const next = { ...d, [f.key]: v };
                      if (f.customerIdKey) next[f.customerIdKey] = "";
                      return next;
                    })
                  }
                  onPick={(m) =>
                    setDraft((d) => {
                      const next = { ...d, [f.key]: m.email ?? "" };
                      if (f.customerIdKey) next[f.customerIdKey] = m.id;
                      if (f.nameKey) next[f.nameKey] = m.name;
                      return next;
                    })
                  }
                />
              ) : (
                <Input
                  type={f.type === "email" ? "email" : "text"}
                  value={draft[f.key] ?? ""}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={create} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD) setAdding(true);
        else onChange(e.target.value);
      }}
      className={controlCls}
    >
      {options.length === 0 && <option value="">— none —</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value={ADD}>{addLabel}</option>
    </select>
  );
}
