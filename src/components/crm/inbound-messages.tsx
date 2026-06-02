"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageList,
  type MessageListItem,
  type MessageRelationship,
} from "./message-list";
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

// Inbound email history for a customer/company/supplier (one or more addresses)
// across all connected team inboxes. Rendering is delegated to the shared
// <MessageList> so the interface stays identical to the lead Replies tab.
export function InboundMessages({
  emails,
  relationship,
  title = "Messages",
}: {
  emails: string[];
  relationship: Extract<
    MessageRelationship,
    "customer" | "b2b_customer" | "supplier"
  >;
  title?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [mailboxes, setMailboxes] = useState<string[]>([]);

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
        {state === "ready" && (
          <div className="mt-3">
            <MessageList
              items={items}
              relationship={relationship}
              emptyText={
                mailboxes.length > 0
                  ? `No emails on file — searched ${mailboxes.join(", ")}.`
                  : "No emails on file."
              }
              footer={
                items.length > 0 ? (
                  <div className="mt-3 flex justify-end">
                    <ComposeMessageButton
                      target={{ to: emails[0] ?? "", relationship }}
                      label="New message"
                      variant="secondary"
                    />
                  </div>
                ) : null
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
