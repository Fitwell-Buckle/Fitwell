"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mailboxColor as colorFor } from "@/lib/crm/mailbox-color";
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
  // Which channel the message came through. Email rows are openable/repliable in
  // Gmail; WhatsApp rows are read-only here (single business line, no per-admin
  // inbox) and just carry the tag. Defaults to "email".
  channel?: "email" | "whatsapp";
}

export type MessageRelationship =
  | "customer"
  | "b2b_customer"
  | "lead"
  | "supplier"
  | "influencer";

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

  // Per-mailbox counts + chips, with MY inbox listed first. Only email rows have
  // an inbox; WhatsApp rows (no mailbox) are left out of the chips.
  const counts = new Map<string, number>();
  for (const m of visible) {
    if (!m.mailbox) continue;
    counts.set(m.mailbox, (counts.get(m.mailbox) ?? 0) + 1);
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
          const isEmail = (m.channel ?? "email") === "email";
          // Openable / repliable in Gmail only for email in MY inbox. WhatsApp is
          // read-only here, and a teammate's mailbox isn't ours to open.
          const openInGmail = isEmail && isMine(m);
          const title =
            m.subject || (isEmail ? "(no subject)" : "WhatsApp message");
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                  <span className="truncate">{title}</span>
                  {openInGmail && (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                  )}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      isEmail
                        ? "bg-zinc-100 text-zinc-500"
                        : "bg-green-100 text-green-700",
                    )}
                  >
                    {isEmail ? "Email" : "WhatsApp"}
                  </span>
                  <p className="text-xs text-zinc-400">{fmtDate(m.dateMs)}</p>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{m.from}</p>
              <p className="mt-1 text-sm text-zinc-600">{m.snippet}</p>
            </>
          );
          return (
            <li
              key={`${m.mailbox ?? m.channel ?? ""}-${m.id}`}
              className={cn(
                "rounded-r-md border-l-4 py-3 pl-3 pr-2",
                c ? c.stripe : "border-l-transparent",
              )}
            >
              {openInGmail ? (
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
                  title={
                    isEmail
                      ? `In ${m.mailbox ?? "a teammate"}'s inbox — only they can open it`
                      : "WhatsApp message"
                  }
                >
                  {body}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Compose (email reply) only for an email in your own inbox — a
                    teammate's message is theirs to reply to, and WhatsApp can't
                    be answered by email. */}
                {openInGmail && (
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
