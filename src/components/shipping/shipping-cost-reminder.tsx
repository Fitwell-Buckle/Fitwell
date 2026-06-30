"use client";

import { useState } from "react";
import { Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isShippingImportStale } from "@/lib/shipping/import-status";
import { ShippingCostUploadModal } from "./shipping-cost-upload-modal";

const DISMISS_KEY = "shipping-reminder-dismissed-at";

/**
 * Weekly nag to upload the Shopify shipping-cost billing CSV. Shows a banner
 * when the data is stale (measured from the last import, so it clears the moment
 * Tom uploads). Opens the shared upload modal — no CLI needed. Dismissible for
 * the session; returns next session or once stale again.
 */
export function ShippingCostReminder({
  daysSince,
  lastImportedAt,
}: {
  daysSince: number | null;
  lastImportedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) != null;
  });

  if (!isShippingImportStale(daysSince) || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setDismissed(true);
  }

  const headline =
    daysSince === null
      ? "No shipping costs imported yet."
      : `Shipping costs are ${daysSince} day${daysSince === 1 ? "" : "s"} old.`;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <Truck className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>{headline}</strong> Upload this week&apos;s Shopify billing CSV to keep
          margins current.
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Upload shipping CSV
        </Button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ShippingCostUploadModal
        open={open}
        onOpenChange={setOpen}
        lastImportedAt={lastImportedAt}
      />
    </>
  );
}
