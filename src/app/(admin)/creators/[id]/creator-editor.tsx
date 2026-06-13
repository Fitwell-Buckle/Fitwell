"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CREATOR_STATUSES } from "@/lib/creators/list";

const inputCls =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

export function CreatorEditor({
  creatorId,
  name,
  primaryPlatform,
  status,
  scoreBoost,
  notes,
  country,
}: {
  creatorId: string;
  name: string;
  primaryPlatform: string | null;
  status: string;
  scoreBoost: number;
  notes: string | null;
  country: string | null;
}) {
  const router = useRouter();
  const [nameDraft, setNameDraft] = useState(name);
  const [noteDraft, setNoteDraft] = useState(notes ?? "");
  const [countryDraft, setCountryDraft] = useState(country ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      toast.success("Saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="font-medium">Edit</div>

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Name
        </label>
        <div className="flex items-center gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={() => patch({ name: nameDraft.trim() })}
            disabled={saving || !nameDraft.trim() || nameDraft.trim() === name}
            className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-500">Primary</label>
          <select
            value={primaryPlatform ?? ""}
            disabled={saving}
            onChange={(e) =>
              patch({ primaryPlatform: e.target.value || null })
            }
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
          >
            <option value="">—</option>
            <option value="ig">IG</option>
            <option value="yt">YT</option>
            <option value="tt">TT</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-500">Status</label>
          <select
            value={status}
            disabled={saving}
            onChange={(e) => patch({ status: e.target.value })}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
          >
            {CREATOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Score boost — manual ranking nudge over the algorithmic fit */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-zinc-500">Rank boost</label>
        <button
          onClick={() => patch({ scoreBoost: scoreBoost - 10 })}
          disabled={saving}
          className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
        >
          −10
        </button>
        <span
          className={`min-w-8 text-center font-mono text-sm ${
            scoreBoost > 0
              ? "text-emerald-600"
              : scoreBoost < 0
                ? "text-red-500"
                : "text-zinc-400"
          }`}
        >
          {scoreBoost > 0 ? `+${scoreBoost}` : scoreBoost}
        </span>
        <button
          onClick={() => patch({ scoreBoost: scoreBoost + 10 })}
          disabled={saving}
          className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
        >
          +10
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-zinc-500">Country</label>
        <input
          value={countryDraft}
          onChange={(e) =>
            setCountryDraft(e.target.value.toUpperCase().slice(0, 2))
          }
          placeholder="US"
          className="w-14 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-center font-mono text-sm uppercase"
        />
        <button
          onClick={() => patch({ country: countryDraft || null })}
          disabled={saving || countryDraft === (country ?? "")}
          className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-40"
        >
          Save
        </button>
        <span className="text-[11px] text-zinc-400">
          Outside active Shopify Markets → parked under &ldquo;Out of market&rdquo;
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Notes
        </label>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm outline-none focus:border-zinc-400"
          placeholder="Outreach context, content angles, terms…"
        />
        <button
          onClick={() => patch({ notes: noteDraft })}
          disabled={saving || noteDraft === (notes ?? "")}
          className="mt-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Save notes
        </button>
      </div>
    </div>
  );
}
