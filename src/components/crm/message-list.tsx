"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposeMessageButton } from "./compose-message";

// One normalized message row. Every messaging surface (lead replies, the
// per-customer/company/supplier/influencer Messages view, and the
// "new messages" panels) maps its data into this shape and renders <MessageList>
// — so the interface is defined ONCE and any change shows up everywhere.
export interface MessageListItem {
  // Stable id of the underlying message (gmail id, or the customer_message row
  // id). Passed back to onDismiss; also used for the React key.
  id: string;
  threadId: string | null;
  // Raw "Name <email>" line shown under the subject.
  from: string;
  // Parsed sender address + name, used to seed a Compose reply.
  fromEmail: string;
  contactName: string | null;
  subject: string | null;
  snippet: string | null;
  dateMs: number;
  mailbox: string | null;
  mailboxEmail: string | null;
}

export type MessageRelationship =
  | "customer"
  | "b2b_customer"
  | "lead"
  | "supplier"
  | "influencer";

// Faded, per-mailbox color so different team inboxes are easy to tell apart.
const MAILBOX_COLORS = [
  { stripe: "border-l-sky-300", tag: "bg-sky-50 text-sky-700", active: "bg-sky-600 text-white" },
  { stripe: "border-l-emerald-300", tag: "bg-emerald-50 text-emerald-700", active: "bg-emerald-600 text-white" },
  { stripe: "border-l-violet-300", tag: "bg-violet-50 text-violet-700", active: "bg-violet-600 text-white" },
  { stripe: "border-l-amber-300", tag: "bg-amber-50 text-amber-800", active: "bg-amber-600 text-white" },
  { stripe: "border-l-rose-300", tag: "bg-rose-50 text-rose-700", active: "bg-rose-600 text-white" },
  { stripe: "border-l-teal-300", tag: "bg-teal-50 text-teal-700", active: "bg-teal-600 text-white" },
] as const;

function colorFor(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return MAILBOX_COLORS[h % MAILBOX_COLORS.length];
}

function gmailThreadUrl(m: MessageListItem): string {
  const base = "https://mail.google.com/mail/";
  const auth = m.mailboxEmail
    ? `?authuser=${encodeURIComponent(m.mailboxEmail)}`
    : "u/0/";
  return `${base}${auth}#all/${m.threadId}`;
}

function fmtDate(ms: number): string {
  return ms
    ? new Date(ms).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
}

export function MessageList({
  items,
  relationship,
  emptyText = "No messages.",
  footer,
  onDismiss,
}: {
  items: MessageListItem[];
  relationship: MessageRelationship;
  emptyText?: string;
  footer?: React.ReactNode;
  // When provided, each row shows a Dismiss button; the row is hidden
  // optimistically and onDismiss(item) runs the actual removal.
  onDismiss?: (item: MessageListItem) => void;
}) {
  // A thread is only openable / repliable in Gmail if it's in MY inbox — you
  // can't open a teammate's mailbox.
  const myEmail = useSession().data?.user?.email?.toLowerCase() ?? null;
  const isMine = (m: MessageListItem) =>
    !m.mailboxEmail || (!!myEmail && m.mailboxEmail.toLowerCase() === myEmail);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string | null>(null);

  const visible = items.filter((m) => !hidden.has(m.id));

  // Per-mailbox counts + chips, with MY inbox listed first.
  const counts = new Map<string, number>();
  for (const m of visible) {
    const k = m.mailbox ?? "Unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const myLabel =
    visible.find((m) => m.mailboxEmail && myEmail && m.mailboxEmail.toLowerCase() === myEmail)
      ?.mailbox ?? null;
  const filterable = [...counts.keys()].sort((a, b) =>
    a === myLabel ? -1 : b === myLabel ? 1 : 0,
  );

  const shown = filter
    ? visible.filter((m) => (m.mailbox ?? "Unknown") === filter)
    : visible;

  function dismiss(m: MessageListItem) {
    setHidden((h) => new Set(h).add(m.id));
    onDismiss?.(m);
  }

  const chip = "rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

  if (visible.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-400">{emptyText}</p>;
  }

  return (
    <div>
      {/* Show the inbox chips whenever messages are attributed to an inbox —
          even a single one — so it's clear whose inbox they're in. */}
      {filterable.length >= 1 && (
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
            All ({visible.length})
          </button>
          {filterable.map((m) => {
            const c = colorFor(m);
            const active = filter === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setFilter(active ? null : m)}
                className={cn(chip, active ? c.active : c.tag)}
              >
                {m} ({counts.get(m)})
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-1">
        {shown.map((m) => {
          const c = m.mailbox ? colorFor(m.mailbox) : null;
          const mine = isMine(m);
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                  <span className="truncate">{m.subject || "(no subject)"}</span>
                  {mine && (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                  )}
                </p>
                <p className="shrink-0 text-xs text-zinc-400">{fmtDate(m.dateMs)}</p>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{m.from}</p>
              <p className="mt-1 text-sm text-zinc-600">{m.snippet}</p>
            </>
          );
          return (
            <li
              key={`${m.mailbox ?? ""}-${m.id}`}
              className={cn(
                "rounded-r-md border-l-4 py-3 pl-3 pr-2",
                c ? c.stripe : "border-l-transparent",
              )}
            >
              {mine ? (
                <a
                  href={gmailThreadUrl(m)}
                  target="_blank"
                  rel="noreferrer"
                  className="group block transition-colors hover:bg-zinc-50"
                  title="Open this conversation in Gmail"
                >
                  {body}
                </a>
              ) : (
                <div
                  className="block"
                  title={`In ${m.mailbox ?? "a teammate"}'s inbox — only they can open it`}
                >
                  {body}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Compose only when the message is in your own inbox — a
                    teammate's message is theirs to reply to. */}
                {mine && (
                  <ComposeMessageButton
                    target={{
                      to: m.fromEmail,
                      contactName: m.contactName,
                      theirSubject: m.subject,
                      theirMessage: m.snippet,
                      relationship,
                    }}
                  />
                )}
                {onDismiss && (
                  <Button variant="ghost" size="sm" onClick={() => dismiss(m)}>
                    Dismiss
                  </Button>
                )}
                {m.mailbox && c && (
                  <span
                    className={cn(
                      "ml-auto inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                      c.tag,
                    )}
                  >
                    {m.mailbox}&apos;s inbox
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {footer}
    </div>
  );
}
