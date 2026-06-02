"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageList,
  type MessageListItem,
} from "@/components/crm/message-list";
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

// The contact's inbound emails (across all connected team inboxes). Fetches on
// mount — Radix only mounts the active tab. Marks replies seen so the "new" dot
// clears next load. Rendering is delegated to the shared <MessageList>.
export function RepliesTab({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [mailboxes, setMailboxes] = useState<string[]>([]);

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
    fetch(`/api/leads/${leadId}/replies-seen`, { method: "POST" }).catch(
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [leadId]);

  const items: MessageListItem[] = replies.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    from: r.from,
    fromEmail: parseEmailAddress(r.from) ?? "",
    contactName: parseDisplayName(r.from),
    subject: r.subject,
    snippet: r.snippet,
    dateMs: r.dateMs,
    mailbox: r.mailbox ?? null,
    mailboxEmail: r.mailboxEmail ?? null,
  }));

  async function dismiss(item: MessageListItem) {
    try {
      await fetch(`/api/leads/${leadId}/replies/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gmailMessageId: item.id }),
      });
    } catch {
      /* hidden locally regardless */
    }
  }

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
        {state === "ready" && (
          <MessageList
            items={items}
            relationship="lead"
            onDismiss={dismiss}
            emptyText={
              mailboxes.length > 0
                ? `No emails from this contact yet — searched ${mailboxes.join(", ")}.`
                : "No emails from this contact yet."
            }
            footer={
              mailboxes.length > 0 ? (
                <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
                  Searched {mailboxes.length} connected inbox
                  {mailboxes.length === 1 ? "" : "es"}: {mailboxes.join(", ")}. A
                  teammate&apos;s emails only show here once they sign into admin
                  with Google.
                </p>
              ) : null
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
