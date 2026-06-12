"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtBytes } from "@/lib/production/timeline";

export interface CompanyDoc {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  uploadedBy: string | null;
}

export interface PoDoc {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  poId: string;
  poNumber: string;
}

/**
 * The company profile's Activity tab. Lists documents uploaded directly to the
 * company (deletable) and — read-only — every document attached to the
 * company's POs (linking back to each PO). Admins can attach new documents here.
 */
export function CompanyDocuments({
  companyId,
  companyDocs,
  poDocs,
}: {
  companyId: string;
  companyDocs: CompanyDoc[];
  poDocs: PoDoc[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/customers/brands/${companyId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Upload failed.");
      } else {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/brands/attachments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Delete failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function docLink(filename: string, url: string, sizeBytes: number | null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-2 text-sm text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">{filename}</span>
        {sizeBytes ? (
          <span className="shrink-0 text-xs text-zinc-400">
            {fmtBytes(sizeBytes)}
          </span>
        ) : null}
      </a>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" /> {busy ? "Working…" : "Attach document"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        {companyDocs.length === 0 ? (
          <p className="text-sm text-zinc-400">No documents uploaded yet.</p>
        ) : (
          companyDocs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-3 py-2"
            >
              {docLink(d.filename, d.url, d.sizeBytes)}
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label="Delete document"
                onClick={() => remove(d.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {poDocs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            From purchase orders
          </h3>
          <div className="mt-2 space-y-2">
            {poDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-3 py-2"
              >
                {docLink(d.filename, d.url, d.sizeBytes)}
                <Link
                  href={`/modules/production/po/${d.poId}`}
                  className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                >
                  {d.poNumber} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
