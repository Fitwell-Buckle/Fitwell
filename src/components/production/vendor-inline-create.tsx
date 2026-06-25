"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

/**
 * Compact "create a new vendor" form for use inside other flows (e.g. picking
 * vendors for a prototype). Creates the supplier via the shared production API
 * and hands the caller back the new `{ id, name }` so it can select it
 * immediately — no page navigation. Only name is required; an optional contact
 * email gets the vendor a magic-link login (handled server-side).
 */
export function VendorInlineCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (vendor: { id: string; name: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!name.trim()) return setError("Vendor name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/production/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contactEmail: contactEmail.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not create vendor.");
        setBusy(false);
        return;
      }
      onCreated({ id: d.data.id, name: name.trim() });
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-600">New vendor</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shenzhen Precision Metals"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
        </div>
        <div>
          <label className={fieldLabel}>Contact email (optional)</label>
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="rfq@vendor.com"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={create} disabled={busy}>
          {busy ? "Adding…" : "Add vendor"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A checkbox multi-select for vendors plus an inline "new vendor" affordance.
 * Used by the prototype create form to gather the candidate vendor set before
 * the prototype exists (selection is local state; nothing is persisted until the
 * parent submits). Newly-created vendors are appended and auto-checked.
 */
export function VendorMultiSelect({
  vendors,
  selectedIds,
  onChange,
  onVendorCreated,
}: {
  vendors: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onVendorCreated: (vendor: { id: string; name: string }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const selected = new Set(selectedIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div>
      {vendors.length > 0 ? (
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2">
          {vendors.map((v) => (
            <label
              key={v.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                checked={selected.has(v.id)}
                onChange={() => toggle(v.id)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-zinc-800">{v.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
          No vendors yet — add one below.
        </p>
      )}

      {adding ? (
        <div className="mt-2">
          <VendorInlineCreate
            onCreated={(v) => {
              onVendorCreated(v);
              onChange([...selected, v.id]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
        >
          + Create a new vendor
        </button>
      )}
    </div>
  );
}
