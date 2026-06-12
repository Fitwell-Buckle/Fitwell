"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtBytes } from "@/lib/production/timeline";

// A document uploaded directly to this company (deletable here).
export interface CompanyDoc {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedAt: string; // ISO
}

// A document attached to one of this company's POs (read-only; links to the PO).
export interface PoDoc {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  poId: string;
  poNumber: string;
  uploadedAt: string; // ISO
}

// A related email, fetched client-side and merged into the feed chronologically.
interface EmailEntry {
  kind: "email";
  id: string;
  at: string; // ISO
  from: string;
  subject: string | null;
  snippet: string | null;
  gmailUrl: string | null;
  mailbox: string | null;
}

type DocEntry =
  | ({ kind: "company-doc"; at: string } & CompanyDoc)
  | ({ kind: "po-doc"; at: string } & PoDoc);

type Item = EmailEntry | DocEntry;

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The B2B customer's Activity tab — a unified, newest-first feed of email
 * correspondence (received + sent across all connected team inboxes, fetched
 * lazily) and documents (uploaded directly to the company, plus read-only docs
 * from the company's POs). Same arrangement as the PO Activity timeline.
 */
export function CompanyActivity({
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
  const [emails, setEmails] = useState<EmailEntry[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/customers/brands/${companyId}/emails`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("emails"))))
      .then((d) => {
        if (!active) return;
        const raw = (d?.data?.emails ?? []) as {
          id: string;
          from: string;
          subject: string | null;
          snippet: string | null;
          dateMs: number;
          mailbox: string | null;
          gmailUrl: string | null;
        }[];
        setEmails(
          raw.map((m) => ({
            kind: "email" as const,
            id: m.id,
            at: new Date(m.dateMs).toISOString(),
            from: m.from,
            subject: m.subject,
            snippet: m.snippet,
            gmailUrl: m.gmailUrl,
            mailbox: m.mailbox,
          })),
        );
      })
      .catch(() => {
        /* Gmail unreachable / not connected — just show the documents. */
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  // Documents (server-rendered) + related emails (client-fetched), interleaved
  // by timestamp into one feed — newest first.
  const items: Item[] = [
    ...companyDocs.map(
      (d): DocEntry => ({ kind: "company-doc", at: d.uploadedAt, ...d }),
    ),
    ...poDocs.map((d): DocEntry => ({ kind: "po-doc", at: d.uploadedAt, ...d })),
    ...emails,
  ].sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));

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

  async function removeDoc(id: string) {
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
          <span className="shrink-0 text-xs text-zinc-400">{fmtBytes(sizeBytes)}</span>
        ) : null}
      </a>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
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

      <div className="mt-4 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No activity yet.</p>
        ) : (
          items.map((e) =>
            e.kind === "email" ? (
              <div key={`email-${e.id}`} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="truncate font-medium text-zinc-900">{e.from}</span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                    Email
                  </span>
                  <span className="text-xs text-zinc-400">{fmtWhen(e.at)}</span>
                  {e.mailbox && (
                    <span className="text-xs text-zinc-400">
                      · {e.mailbox}&apos;s inbox
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  <p className="text-sm font-medium text-zinc-800">
                    {e.subject || "(no subject)"}
                  </p>
                  {e.snippet && (
                    <p className="truncate text-xs text-zinc-500">{e.snippet}</p>
                  )}
                  {e.gmailUrl && (
                    <a
                      href={e.gmailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-xs text-blue-600 hover:underline"
                    >
                      Open in Gmail →
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div key={`${e.kind}-${e.id}`} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                    Document
                  </span>
                  <span className="text-xs text-zinc-400">{fmtWhen(e.at)}</span>
                  {e.kind === "company-doc" && e.uploadedBy && (
                    <span className="text-xs text-zinc-400">· {e.uploadedBy}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-3 py-2">
                  {docLink(e.filename, e.url, e.sizeBytes)}
                  {e.kind === "company-doc" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label="Delete document"
                      onClick={() => removeDoc(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Link
                      href={`/modules/production/po/${e.poId}`}
                      className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                    >
                      {e.poNumber} →
                    </Link>
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </Card>
  );
}
