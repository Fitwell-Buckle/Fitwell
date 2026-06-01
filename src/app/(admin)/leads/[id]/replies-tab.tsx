"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposeMessageButton } from "@/components/crm/compose-message";
import { parseDisplayName, parseEmailAddress } from "@/lib/crm/customer-match";

interface Reply {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  dateMs: number;
  // Which team inbox this was found in (cross-mailbox search).
  mailbox?: string;
  // The owner email of that inbox — targets the right Google account on click.
  mailboxEmail?: string;
}

// Faded, per-mailbox color so different inboxes are easy to tell apart at a
// glance. Each entry: a left stripe on the row + a tinted label/filter pill,
// plus a saturated variant for the active filter chip. (Full class strings so
// Tailwind keeps them.)
const MAILBOX_COLORS = [
  { stripe: "border-l-sky-300", tag: "bg-sky-50 text-sky-700", active: "bg-sky-600 text-white" },
  { stripe: "border-l-emerald-300", tag: "bg-emerald-50 text-emerald-700", active: "bg-emerald-600 text-white" },
  { stripe: "border-l-violet-300", tag: "bg-violet-50 text-violet-700", active: "bg-violet-600 text-white" },
  { stripe: "border-l-amber-300", tag: "bg-amber-50 text-amber-800", active: "bg-amber-600 text-white" },
  { stripe: "border-l-rose-300", tag: "bg-rose-50 text-rose-700", active: "bg-rose-600 text-white" },
  { stripe: "border-l-teal-300", tag: "bg-teal-50 text-teal-700", active: "bg-teal-600 text-white" },
] as const;

// Deterministic color per mailbox label, so the same person is always the same
// color regardless of result order.
function colorFor(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return MAILBOX_COLORS[h % MAILBOX_COLORS.length];
}

// Build a deep link that opens the conversation in Gmail. `authuser` nudges
// Gmail to the right account when the viewer is signed into several.
function gmailThreadUrl(r: Reply): string {
  const base = "https://mail.google.com/mail/";
  const auth = r.mailboxEmail
    ? `?authuser=${encodeURIComponent(r.mailboxEmail)}`
    : "u/0/";
  return `${base}${auth}#all/${r.threadId}`;
}

// Fetches the contact's emails on mount — across every connected team inbox,
// not just the lead owner's, so a contact who emailed a colleague still shows
// up (Radix only mounts the active tab). Also marks replies as seen so the
// "new" dot clears on the next page load.
export function RepliesTab({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);
  // Labels of the inboxes that were actually searched (Gmail-connected admins).
  const [mailboxes, setMailboxes] = useState<string[]>([]);
  // Active mailbox filter (null = all inboxes).
  const [filter, setFilter] = useState<string | null>(null);
  // Optimistically hide dismissed replies.
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function dismiss(id: string) {
    setHidden((h) => new Set(h).add(id));
    try {
      await fetch(`/api/leads/${leadId}/replies/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gmailMessageId: id }),
      });
    } catch {
      /* best-effort; it's hidden locally regardless */
    }
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/replies`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setReplies(d.data?.replies ?? []);
        setMailboxes(d.data?.mailboxes ?? []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    // Mark seen (best-effort) so the blue dot clears next load.
    fetch(`/api/leads/${leadId}/replies-seen`, { method: "POST" }).catch(
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [leadId]);

  // Per-mailbox counts (only inboxes that actually have emails for this lead).
  const counts = new Map<string, number>();
  for (const r of replies) {
    const k = r.mailbox ?? "Unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const filterable = [...counts.keys()];
  const shown = (
    filter
      ? replies.filter((r) => (r.mailbox ?? "Unknown") === filter)
      : replies
  ).filter((r) => !hidden.has(r.id));

  const chip =
    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <Card>
      <CardContent>
        {state === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Checking inboxes…
          </p>
        )}
        {state === "error" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Couldn&apos;t load replies. Connect Google (sign out/in) to see a
            lead&apos;s email replies here.
          </p>
        )}
        {state === "ready" && replies.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">
            No emails from this contact yet
            {mailboxes.length > 0 ? ` — searched ${mailboxes.join(", ")}.` : "."}
          </p>
        )}

        {/* Quick filter by inbox — only when emails span more than one. */}
        {state === "ready" && filterable.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                chip,
                filter === null
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
              )}
            >
              All ({replies.length})
            </button>
            {filterable.map((m) => {
              const c = colorFor(m);
              const isActive = filter === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFilter(isActive ? null : m)}
                  className={cn(chip, isActive ? c.active : c.tag)}
                >
                  {m} ({counts.get(m)})
                </button>
              );
            })}
          </div>
        )}

        {state === "ready" && shown.length > 0 && (
          <ul className="space-y-1">
            {shown.map((r) => {
              const c = r.mailbox ? colorFor(r.mailbox) : null;
              return (
                <li
                  key={`${r.mailbox ?? ""}-${r.id}`}
                  className={cn(
                    "rounded-r-md border-l-4 py-3 pl-3 pr-2",
                    c ? c.stripe : "border-l-transparent",
                  )}
                >
                  <a
                    href={gmailThreadUrl(r)}
                    target="_blank"
                    rel="noreferrer"
                    className="group block transition-colors hover:bg-zinc-50"
                    title="Open this conversation in Gmail"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                        <span className="truncate">
                          {r.subject || "(no subject)"}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                      </p>
                      <p className="shrink-0 text-xs text-zinc-400">
                        {r.dateMs
                          ? new Date(r.dateMs).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : ""}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{r.from}</p>
                    <p className="mt-1 text-sm text-zinc-600">{r.snippet}</p>
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ComposeMessageButton
                      target={{
                        to: parseEmailAddress(r.from) ?? "",
                        contactName: parseDisplayName(r.from),
                        theirSubject: r.subject,
                        theirMessage: r.snippet,
                        relationship: "lead",
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismiss(r.id)}
                    >
                      Dismiss
                    </Button>
                    {r.mailbox && c && (
                      <span
                        className={cn(
                          "ml-auto inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                          c.tag,
                        )}
                      >
                        {r.mailbox}&apos;s inbox
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {state === "ready" && mailboxes.length > 0 && (
          <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
            Searched {mailboxes.length} connected inbox
            {mailboxes.length === 1 ? "" : "es"}: {mailboxes.join(", ")}. A
            teammate&apos;s emails only show here once they sign into admin with
            Google.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
