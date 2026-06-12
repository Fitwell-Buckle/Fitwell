"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PoTimelineEntry } from "@/lib/production/timeline";

// A related email, fetched client-side and merged into the feed chronologically.
interface EmailEntry {
  id: string;
  kind: "email";
  at: string; // ISO
  from: string;
  subject: string | null;
  snippet: string | null;
  gmailUrl: string | null;
  mailbox: string | null;
}

/**
 * Unified notes + documents feed for a PO, shared by the admin and supplier
 * sides. Posting a note or uploading a document hits the same endpoints both
 * surfaces already use and notifies the other party. Admins can remove
 * documents; suppliers can't (matching the prior attachments behaviour).
 */
export function PoTimeline({
  poId,
  viewer,
  entries,
  currentUserId,
  showRelatedEmails = false,
}: {
  poId: string;
  viewer: "admin" | "supplier";
  entries: PoTimelineEntry[];
  /** The signed-in user's id — a note shows an Edit affordance only to its
   *  own author (admins in the dashboard, suppliers in the portal). */
  currentUserId?: string | null;
  /** Admin-only: lazily pull Gmail messages that mention this PO and merge them
   *  into the feed chronologically. Off on the supplier side (the endpoint is
   *  admin-gated). */
  showRelatedEmails?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline note editing: the id being edited + its working text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  // Related emails, fetched lazily (admin only) and merged into the feed below.
  const [emailEntries, setEmailEntries] = useState<EmailEntry[]>([]);

  useEffect(() => {
    if (!showRelatedEmails) return;
    let active = true;
    fetch(`/api/production/po/${poId}/emails`)
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
        setEmailEntries(
          raw.map((m) => ({
            id: m.id,
            kind: "email" as const,
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
        /* Gmail unreachable / not connected — just show the rest of the feed. */
      });
    return () => {
      active = false;
    };
  }, [poId, showRelatedEmails]);

  // Notes, documents, edit-events (server-rendered) + related emails (client-
  // fetched), interleaved by timestamp into one feed — newest first.
  const items: (PoTimelineEntry | EmailEntry)[] = [
    ...entries,
    ...emailEntries,
  ].sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));

  async function postNote() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to post note.");
      } else {
        setBody("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(id: string, current: string) {
    setError(null);
    setEditingId(id);
    setEditBody(current);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
  }

  async function saveEdit(id: string) {
    const text = editBody.trim();
    if (!text) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save note.");
      } else {
        setEditingId(null);
        setEditBody("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/production/po/${poId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed.");
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
      const res = await fetch(`/api/production/attachments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Delete failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
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
                  <span className="truncate font-medium text-zinc-900">
                    {e.from}
                  </span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                    Email
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(e.at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
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
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-zinc-900">
                    {e.authorName}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      e.fromSupplier
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700",
                    )}
                  >
                    {e.fromSupplier ? "Supplier" : "Fitwell"}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(e.at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {e.kind === "note" ? (
                editingId === e.id ? (
                  <div className="mt-1">
                    <textarea
                      value={editBody}
                      onChange={(ev) => setEditBody(ev.target.value)}
                      rows={2}
                      className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(e.id)}
                        disabled={busy || !editBody.trim()}
                      >
                        {busy ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <p className="whitespace-pre-wrap text-zinc-700">
                      {e.body}
                      {e.editedAt && (
                        <span className="ml-1 text-xs text-zinc-400">(edited)</span>
                      )}
                    </p>
                    {currentUserId && e.authorUserId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => startEdit(e.id, e.body)}
                        className="mt-0.5 text-xs text-zinc-400 hover:text-zinc-700"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )
              ) : e.kind === "document" ? (
                <div className="mt-1 flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-zinc-400" />
                    {e.filename}
                    {e.size && <span className="text-xs text-zinc-400">{e.size}</span>}
                  </a>
                  {viewer === "admin" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label="Delete document"
                      onClick={() => removeDoc(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                /* Edit-history event — italicized + lighter so it visually
                 * separates from notes (which are deliberate written content)
                 * and documents (which are clickable). */
                <p className="mt-0.5 italic text-zinc-500">{e.body}</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <textarea
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={postNote} disabled={busy || !body.trim()}>
            {busy ? "Posting…" : "Post note"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
