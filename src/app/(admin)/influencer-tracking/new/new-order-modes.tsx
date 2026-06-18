"use client";

import { useState } from "react";
import { InfluencerOrderForm } from "./order-form";
import { RecordExistingOrderForm } from "./record-existing-form";

interface OrderInfluencer {
  id: string;
  name: string;
  handle: string | null;
  assignedCollectionIds: string[];
}

const tabBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

export function NewOrderModes({
  influencers,
  defaultInfluencerId,
}: {
  influencers: OrderInfluencer[];
  defaultInfluencerId?: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");

  return (
    <div>
      <div className="inline-flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`${tabBase} ${mode === "new" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}
        >
          Create new gift draft
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`${tabBase} ${mode === "existing" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}
        >
          Record existing Shopify order
        </button>
      </div>

      {mode === "new" ? (
        <InfluencerOrderForm
          defaultInfluencerId={defaultInfluencerId}
          influencers={influencers}
        />
      ) : (
        <RecordExistingOrderForm
          defaultInfluencerId={defaultInfluencerId}
          influencers={influencers.map((i) => ({
            id: i.id,
            name: i.name,
            handle: i.handle,
          }))}
        />
      )}
    </div>
  );
}
