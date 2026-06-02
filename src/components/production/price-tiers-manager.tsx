"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tierLabel } from "@/components/production/company-form";

export interface PriceTier {
  id: string;
  name: string;
  discountPercent: number;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

// Price-tier CRUD (a % discount off Shopify retail, assigned to B2B brands).
// Lives in Settings; brands pick from these tiers on the B2B customers page.
export function PriceTiersManager({ priceTiers }: { priceTiers: PriceTier[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");

  function open(id: string | "new", t?: PriceTier) {
    setError(null);
    setEditing(id);
    setName(t?.name ?? "");
    setDiscount(t ? String(t.discountPercent) : "");
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Tier name is required.");
    const discountPercent = Number(discount);
    if (
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      return setError("Discount must be a percentage between 0 and 100.");
    }
    setBusy(true);
    const isNew = editing === "new";
    try {
      const res = await fetch(
        isNew
          ? "/api/production/price-tiers"
          : `/api/production/price-tiers/${editing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), discountPercent }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          A discount off the Shopify retail price, assigned to B2B brands.
        </p>
        {editing !== "new" && (
          <Button size="sm" variant="outline" onClick={() => open("new")}>
            Add tier
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {priceTiers.length === 0 && editing !== "new" && (
          <span className="text-sm text-zinc-400">No tiers yet.</span>
        )}
        {priceTiers.map((t) =>
          editing === t.id ? (
            <TierForm
              key={t.id}
              name={name}
              discount={discount}
              setName={setName}
              setDiscount={setDiscount}
              onSave={save}
              onCancel={() => setEditing(null)}
              busy={busy}
            />
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t.id, t)}
              className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
              title="Edit tier"
            >
              {tierLabel(t)}
            </button>
          ),
        )}
      </div>

      {editing === "new" && (
        <div className="mt-3">
          <TierForm
            name={name}
            discount={discount}
            setName={setName}
            setDiscount={setDiscount}
            onSave={save}
            onCancel={() => setEditing(null)}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function TierForm({
  name,
  discount,
  setName,
  setDiscount,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  discount: string;
  setName: (v: string) => void;
  setDiscount: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-end gap-2 rounded-lg border border-zinc-200 p-3">
      <div>
        <label className={fieldLabel}>Tier name</label>
        <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={fieldLabel}>% off</label>
        <Input
          className="w-24"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
