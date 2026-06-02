"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposeMessageButton } from "./compose-message";
import { parseDisplayName, parseEmailAddress } from "@/lib/crm/customer-match";

interface Reply {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  dateMs: number;
  mailbox?: string;
  mailboxEmail?: string;
}

// Faded per-mailbox colors (same palette as the lead Replies tab) so different
// team inboxes are easy to tell apart.
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

function gmailThreadUrl(r: Reply): string {
  const base = "https://mail.google.com/mail/";
  const auth = r.mailboxEmail
    ? `?authuser=${encodeURIComponent(r.mailboxEmail)}`
    : "u/0/";
  return `${base}${auth}#all/${r.threadId}`;
}

// Inbound email history for a customer/company (one or more addresses), across
// all connected team inboxes. Color-coded per inbox, with a quick inbox filter,
// each row deep-links to Gmail and offers an AI-assisted Compose reply.
export function InboundMessages({
  emails,
  relationship,
  title = "Messages",
}: {
  emails: string[];
  relationship: "customer" | "b2b_customer" | "supplier";
  title?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [mailboxes, setMailboxes] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  // A message can only be opened in Gmail if it's in MY inbox — you can't open
  // a teammate's mailbox. Compare against the signed-in user's email.
  const myEmail = useSession().data?.user?.email?.toLowerCase() ?? null;
  const canOpen = (r: Reply) =>
    !r.mailboxEmail || (!!myEmail && r.mailboxEmail.toLowerCase() === myEmail);

  const param = emails.filter(Boolean).join(",");

  useEffect(() => {
    if (!param) {
      setReplies([]);
      setState("ready");
      return;
    }
    let alive = true;
    setState("loading");
    fetch(`/api/inbound?emails=${encodeURIComponent(param)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setReplies(d.data?.replies ?? []);
        setMailboxes(d.data?.mailboxes ?? []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [param]);

  const counts = new Map<string, number>();
  for (const r of replies) {
    const k = r.mailbox ?? "Unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Your own inbox first in the filter chips, then the rest in order.
  const myLabel =
    replies.find(
      (r) => r.mailboxEmail && myEmail && r.mailboxEmail.toLowerCase() === myEmail,
    )?.mailbox ?? null;
  const filterable = [...counts.keys()].sort((a, b) =>
    a === myLabel ? -1 : b === myLabel ? 1 : 0,
  );
  const shown = filter
    ? replies.filter((r) => (r.mailbox ?? "Unknown") === filter)
    : replies;
  const chip = "rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <Card className="mt-6">
      <CardContent>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>

        {state === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Checking inboxes…
          </p>
        )}
        {state === "error" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Couldn&apos;t load messages. Connect Google (sign out/in) to see
            email history here.
          </p>
        )}
        {state === "ready" && replies.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">
            No emails on file
            {mailboxes.length > 0 ? ` — searched ${mailboxes.join(", ")}.` : "."}
          </p>
        )}

        {state === "ready" && filterable.length > 1 && (
          <div className="mb-3 mt-3 flex flex-wrap gap-1.5">
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
          <ul className="mt-2 space-y-1">
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
                  {(() => {
                    const open = canOpen(r);
                    const body = (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                            <span className="truncate">
                              {r.subject || "(no subject)"}
                            </span>
                            {open && (
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                            )}
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
                      </>
                    );
                    return open ? (
                      <a
                        href={gmailThreadUrl(r)}
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
                        title={`In ${r.mailbox ?? "a teammate"}'s inbox — only they can open it`}
                      >
                        {body}
                      </div>
                    );
                  })()}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ComposeMessageButton
                      target={{
                        to: parseEmailAddress(r.from) ?? "",
                        contactName: parseDisplayName(r.from),
                        theirSubject: r.subject,
                        theirMessage: r.snippet,
                        relationship,
                      }}
                    />
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

        {state === "ready" && replies.length > 0 && (
          <div className="mt-3 flex justify-end">
            <ComposeMessageButton
              target={{ to: emails[0] ?? "", relationship }}
              label="New message"
              variant="secondary"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
