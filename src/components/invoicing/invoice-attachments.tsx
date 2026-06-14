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
 * Attach / view / remove documents on an order. Entity-agnostic: the endpoints
 * and copy are parameterized so the SAME component drives both B2B invoices
 * (customer PO PDFs) and influencer gifting orders (gifting agreements, content
 * briefs). Upload streams to Vercel Blob via whichever route is wired up.
 *
 * Legacy `invoiceId` is still accepted — when given (and `uploadUrl`/
 * `deleteUrlBase` are not), the invoice routes are used, so existing call sites
 * need no change.
 *
 * NOTE: props must be SERIALIZABLE — this is a Client Component often rendered
 * by a Server Component (the detail pages), so the delete endpoint is a string
 * base (`deleteUrlBase`), not a function. The final URL is `${base}/${id}`.
 */
export function InvoiceAttachments({
  invoiceId,
  uploadUrl,
  deleteUrlBase,
  attachments,
  title = "Customer documents",
  buttonLabel = "Attach PO",
  hint = "Attach the customer's purchase order (PDF) or related documents. Max 10MB.",
}: {
  /** Legacy convenience: derives the invoice upload/delete routes. */
  invoiceId?: string;
  /** Explicit POST endpoint for uploads (preferred). */
  uploadUrl?: string;
  /** DELETE endpoint base; the attachment id is appended as `${base}/${id}`. */
  deleteUrlBase?: string;
  attachments: InvoiceAttachmentItem[];
  title?: string;
  buttonLabel?: string;
  hint?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedUploadUrl =
    uploadUrl ?? (invoiceId ? `/api/invoices/${invoiceId}/attachments` : null);
  const resolvedDeleteBase = deleteUrlBase ?? "/api/invoices/attachments";

  async function upload(file: File) {
    if (!resolvedUploadUrl) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(resolvedUploadUrl, {
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
      const res = await fetch(`${resolvedDeleteBase}/${id}`, { method: "DELETE" });
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
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {busy ? "Uploading…" : buttonLabel}
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
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
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
