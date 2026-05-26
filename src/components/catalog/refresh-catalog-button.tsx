"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Manually refresh the cached Shopify catalog (used by the item chooser + the
 * size/colour/material data). The catalog stays cached until this is clicked or
 * a Shopify product/collection webhook fires.
 */
export function RefreshCatalogButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function refresh() {
    setBusy(true);
    setDone(false);
    setError(false);
    try {
      const res = await fetch("/api/production/catalog/refresh", { method: "POST" });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={busy} title="Refetch the Shopify catalog now">
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Refreshing…" : error ? "Try again" : done ? "Refreshed" : "Refresh catalog"}
    </Button>
  );
}
