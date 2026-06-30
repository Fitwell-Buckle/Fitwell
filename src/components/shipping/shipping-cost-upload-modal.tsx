"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface ShippingImportResult {
  bills: number;
  totalCharges: number;
  matchedCharges: number;
  unmatchedCharges: number;
  totalCents: number;
  matchedCents: number;
  unmatchedOrderNames: string[];
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The upload dialog: pick a Shopify billing CSV → POST to the import endpoint →
 * show the result. Shared by the weekly reminder banner and the anytime
 * "Upload shipping costs" button. Re-import is idempotent (delete-replace by
 * bill), so uploading an overlapping export never double-counts.
 */
export function ShippingCostUploadModal({
  open,
  onOpenChange,
  lastImportedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastImportedAt?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShippingImportResult | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset on close so the next open starts fresh.
      setResult(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/shipping-costs/import", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Import failed.");
        return;
      }
      setResult(d.data as ShippingImportResult);
      toast.success(
        `Imported ${d.data.totalCharges} charges — ${money(d.data.matchedCents)} matched to orders.`,
      );
      router.refresh(); // re-query staleness → reminder clears
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Upload shipping costs"
      description="Shopify billing export → matched to orders"
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-green-700">Imported successfully.</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
            <dt>Charges imported</dt>
            <dd className="text-right font-mono">{result.totalCharges}</dd>
            <dt>Bills</dt>
            <dd className="text-right font-mono">{result.bills}</dd>
            <dt>Matched to orders</dt>
            <dd className="text-right font-mono">
              {result.matchedCharges} ({money(result.matchedCents)})
            </dd>
            <dt>Unmatched</dt>
            <dd className="text-right font-mono">{result.unmatchedCharges}</dd>
            <dt>Total shipping cost</dt>
            <dd className="text-right font-mono">{money(result.totalCents)}</dd>
          </dl>
          {result.unmatchedOrderNames.length > 0 && (
            <p className="text-xs text-amber-600">
              {result.unmatchedOrderNames.length} order
              {result.unmatchedOrderNames.length === 1 ? "" : "s"} weren&apos;t found
              (likely not synced yet): {result.unmatchedOrderNames.slice(0, 10).join(", ")}
              {result.unmatchedOrderNames.length > 10 ? " …" : ""}. They&apos;ll link on
              the next upload once synced.
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-zinc-600">
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>
              In Shopify: <strong>Settings → Billing → Bills</strong> → Export bills (CSV).
            </li>
            <li>Upload that file here. Re-uploading is safe — it never double-counts.</li>
          </ol>
          {lastImportedAt && (
            <p className="text-xs text-zinc-400">
              Last import: {new Date(lastImportedAt).toLocaleDateString()}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-zinc-700"
          />
          {busy && <p className="text-xs text-zinc-500">Importing…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
