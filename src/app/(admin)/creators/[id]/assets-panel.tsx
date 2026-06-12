"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ASSET_TYPES,
  RIGHTS_TIER_LABELS,
  RIGHTS_TIERS,
  type RightsStatus,
} from "@/lib/creators/assets";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

const STATUS_STYLES: Record<RightsStatus, string> = {
  organic_only: "bg-zinc-100 text-zinc-600",
  active: "bg-emerald-100 text-emerald-700",
  expiring_soon: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<RightsStatus, string> = {
  organic_only: "organic only",
  active: "rights active",
  expiring_soon: "expiring soon",
  expired: "expired",
};

export interface AssetView {
  id: string;
  storageUrl: string;
  assetType: string;
  rightsTier: string;
  rightsExpiresAt: string | null; // YYYY-MM-DD
  rightsStatus: RightsStatus;
  usageNotes: string | null;
  receivedAt: string; // YYYY-MM-DD
}

export function AssetsPanel({
  creatorId,
  assets,
  giftOrders,
}: {
  creatorId: string;
  assets: AssetView[];
  giftOrders: { id: string; orderNumber: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    storageUrl: "",
    assetType: "edited",
    rightsTier: "organic_only",
    usageNotes: "",
    giftOrderId: "",
  });

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          usageNotes: form.usageNotes || null,
          giftOrderId: form.giftOrderId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success("Asset logged");
      setAdding(false);
      setForm({
        storageUrl: "",
        assetType: "edited",
        rightsTier: "organic_only",
        usageNotes: "",
        giftOrderId: "",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(assetId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/assets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Assets</span>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Log asset
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-2">
          <input
            autoFocus
            placeholder="Drive / Dropbox link"
            value={form.storageUrl}
            onChange={(e) => setForm({ ...form, storageUrl: e.target.value })}
            className={inputCls}
          />
          <div className="flex gap-2">
            <select
              value={form.assetType}
              onChange={(e) => setForm({ ...form, assetType: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={form.rightsTier}
              onChange={(e) => setForm({ ...form, rightsTier: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
            >
              {RIGHTS_TIERS.map((t) => (
                <option key={t} value={t}>
                  {RIGHTS_TIER_LABELS[t]}
                </option>
              ))}
            </select>
            {giftOrders.length > 0 && (
              <select
                value={form.giftOrderId}
                onChange={(e) => setForm({ ...form, giftOrderId: e.target.value })}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">no linked sample</option>
                {giftOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber}
                  </option>
                ))}
              </select>
            )}
          </div>
          <input
            placeholder="Usage notes (e.g. agreed for Meta retargeting only)"
            value={form.usageNotes}
            onChange={(e) => setForm({ ...form, usageNotes: e.target.value })}
            className={inputCls}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !form.storageUrl} onClick={submit}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {assets.length === 0 && !adding && (
        <p className="text-sm text-zinc-400">
          No deliverables yet — log Drive/Dropbox links with their usage
          rights as creators send content back.
        </p>
      )}

      <ul className="space-y-2">
        {assets.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href={a.storageUrl}
              target="_blank"
              rel="noreferrer"
              className="max-w-[14rem] truncate text-zinc-700 underline-offset-2 hover:underline"
            >
              {a.storageUrl.replace(/^https?:\/\//, "")}
            </a>
            <Badge>{a.assetType}</Badge>
            <Badge className={STATUS_STYLES[a.rightsStatus]}>
              {STATUS_LABELS[a.rightsStatus]}
              {a.rightsExpiresAt ? ` · ${a.rightsExpiresAt}` : ""}
            </Badge>
            {a.usageNotes && (
              <span className="text-xs text-zinc-400">{a.usageNotes}</span>
            )}
            <button
              onClick={() => remove(a.id)}
              disabled={busy}
              title="Remove"
              className="ml-auto text-xs text-zinc-300 hover:text-red-500"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
