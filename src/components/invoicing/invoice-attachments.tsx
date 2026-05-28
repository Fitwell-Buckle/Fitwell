"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface InvoiceAttachmentItem {
  id: string;
  blobUrl: string;
  filename: string;
  sizeBytes: number | null;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attach / view / remove customer documents on an invoice (e.g. the customer's
 * own PDF purchase order). Upload goes to Vercel Blob via the invoice route.
 */
export function InvoiceAttachments({
  invoiceId,
  attachments,
}: {
  invoiceId: string;
  attachments: InvoiceAttachmentItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/invoices/${invoiceId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Upload failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Delete failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Customer documents</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Attach PO"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <p className="mt-1 text-xs text-zinc-500">
        Attach the customer&apos;s purchase order (PDF) or related documents. Max 10MB.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 space-y-2">
        {attachments.length === 0 ? (
          <p className="text-sm text-zinc-400">No documents attached.</p>
        ) : (
          attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2"
            >
              <a
                href={a.blobUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="truncate underline decoration-zinc-300 underline-offset-2">
                  {a.filename}
                </span>
                {a.sizeBytes ? (
                  <span className="shrink-0 text-xs text-zinc-400">{fmtSize(a.sizeBytes)}</span>
                ) : null}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label="Remove document"
                onClick={() => remove(a.id)}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
