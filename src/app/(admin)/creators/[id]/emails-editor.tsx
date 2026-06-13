"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

const KINDS = ["business", "personal", "manager"] as const;

export interface EmailRow {
  id: string;
  email: string;
  kind: string | null;
  portalAccess: boolean;
}

export function EmailsEditor({
  creatorId,
  emails,
}: {
  creatorId: string;
  emails: EmailRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const base = `/api/admin/creators/${creatorId}/emails`;

  async function send(url: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!draft.trim()) return;
    const ok = await send(base, "POST", { email: draft.trim() });
    if (ok) {
      toast.success("Email added");
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Contact</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            + Add email
          </button>
        )}
      </div>

      {emails.length === 0 && !adding ? (
        <p className="text-sm text-zinc-400">No emails on file.</p>
      ) : (
        <ul className="space-y-1.5">
          {emails.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-sm">
              <a
                href={`mailto:${e.email}`}
                className="font-mono text-zinc-700 underline-offset-2 hover:underline"
              >
                {e.email}
              </a>
              <select
                value={e.kind ?? ""}
                disabled={busy}
                onChange={(ev) =>
                  send(`${base}/${e.id}`, "PATCH", {
                    kind: ev.target.value || null,
                  })
                }
                className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[11px]"
              >
                <option value="">—</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                title="Toggle portal access"
                disabled={busy}
                onClick={() =>
                  send(`${base}/${e.id}`, "PATCH", {
                    portalAccess: !e.portalAccess,
                  })
                }
              >
                <Badge
                  className={
                    e.portalAccess
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-400"
                  }
                >
                  portal
                </Badge>
              </button>
              <button
                title="Remove email"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${e.email}?`))
                    send(`${base}/${e.id}`, "DELETE").then(
                      (ok) => ok && toast.success("Removed"),
                    );
                }}
                className="ml-auto text-zinc-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && add()}
            placeholder="email@example.com"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={add}
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
            className="text-xs text-zinc-500"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
