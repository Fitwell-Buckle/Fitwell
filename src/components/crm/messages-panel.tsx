"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MessageList,
  type MessageListItem,
  type MessageRelationship,
} from "./message-list";
import { ComposeMessageButton } from "./compose-message";
import { parseDisplayName, parseEmailAddress } from "@/lib/crm/customer-match";

type Direction = "received" | "sent";

// Raw message shape returned by the replies / inbound endpoints (both
// directions share it; `to` is only present on sent messages).
interface RawMessage {
  id: string;
  threadId: string | null;
  from: string;
  subject: string | null;
  snippet: string | null;
  dateMs: number;
  mailbox?: string | null;
  mailboxEmail?: string | null;
  to?: string | null;
  channel?: "email" | "whatsapp";
}

interface Loaded {
  items: MessageListItem[];
  mailboxes: string[];
}

// THE shared messaging surface: a Received/Sent toggle over the canonical
// <MessageList>. Used by the lead Messages tab and the per-customer/company/
// supplier Messages view, so both directions look and behave identically and a
// change here lands everywhere. Each direction is fetched lazily from its own
// URL and cached, so flipping the toggle is instant after the first load.
export function MessagesPanel({
  relationship,
  receivedUrl,
  sentUrl,
  contactEmailForSent = null,
  onDismissReceived,
  composeTo = null,
  searchedFooterNote = false,
}: {
  relationship: MessageRelationship;
  receivedUrl: string;
  sentUrl: string;
  // Fallback Compose target for a sent message that lacks an explicit `to`.
  contactEmailForSent?: string | null;
  // Received-only: per-message Dismiss (used by the lead Messages tab).
  onDismissReceived?: (item: MessageListItem) => void;
  // When set, render a footer "New message" Compose button (per-contact view).
  composeTo?: string | null;
  // When true, render the "searched N inboxes" footer note (lead Messages tab).
  searchedFooterNote?: boolean;
}) {
  const [direction, setDirection] = useState<Direction>("received");
  const [cache, setCache] = useState<Partial<Record<Direction, Loaded>>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (cache[direction]) {
      setState("ready");
      return;
    }
    let alive = true;
    setState("loading");
    fetch(direction === "sent" ? sentUrl : receivedUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        const raw: RawMessage[] = d.data?.replies ?? [];
        const items = raw.map((m) => toItem(m, direction, contactEmailForSent));
        setCache((prev) => ({
          ...prev,
          [direction]: { items, mailboxes: d.data?.mailboxes ?? [] },
        }));
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [direction, receivedUrl, sentUrl, contactEmailForSent, cache]);

  const loaded = cache[direction];
  const mailboxes = loaded?.mailboxes ?? [];
  const sent = direction === "sent";

  // Dismiss runs the caller's removal AND drops the row from the cache, so it
  // stays gone when the user flips the toggle and comes back (the toggle keys
  // <MessageList>, which otherwise resets its local hidden set).
  const handleDismiss = onDismissReceived
    ? (item: MessageListItem) => {
        onDismissReceived(item);
        setCache((prev) => {
          const r = prev.received;
          if (!r) return prev;
          return {
            ...prev,
            received: {
              ...r,
              items: r.items.filter((i) => i.id !== item.id),
            },
          };
        });
      }
    : undefined;

  const seg =
    "rounded-md px-3 py-1 text-sm font-medium transition-colors";
  const active = "bg-white text-zinc-900 shadow-sm";
  const idle = "text-zinc-500 hover:text-zinc-900";

  return (
    <div>
      <div className="mb-3 inline-flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
        <button
          type="button"
          onClick={() => setDirection("received")}
          className={cn(seg, !sent ? active : idle)}
        >
          Received
        </button>
        <button
          type="button"
          onClick={() => setDirection("sent")}
          className={cn(seg, sent ? active : idle)}
        >
          Sent
        </button>
      </div>

      {state === "loading" && (
        <p className="py-6 text-center text-sm text-zinc-400">
          Checking inboxes…
        </p>
      )}
      {state === "error" && (
        <p className="py-6 text-center text-sm text-zinc-400">
          Couldn&apos;t load messages. Connect Google (sign out/in) to see email
          history here.
        </p>
      )}
      {state === "ready" && loaded && (
        <MessageList
          key={direction}
          items={loaded.items}
          relationship={relationship}
          onDismiss={!sent ? handleDismiss : undefined}
          emptyText={emptyText(sent, mailboxes)}
          footer={
            <>
              {composeTo && loaded.items.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <ComposeMessageButton
                    target={{ to: composeTo, relationship }}
                    label="New message"
                    variant="secondary"
                  />
                </div>
              )}
              {searchedFooterNote && mailboxes.length > 0 && (
                <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
                  Searched {mailboxes.length} connected inbox
                  {mailboxes.length === 1 ? "" : "es"}: {mailboxes.join(", ")}. A
                  teammate&apos;s emails only show here once they sign into admin
                  with Google.
                </p>
              )}
            </>
          }
        />
      )}
    </div>
  );
}

function emptyText(sent: boolean, mailboxes: string[]): string {
  const verb = sent ? "sent to" : "from";
  return mailboxes.length > 0
    ? `No emails ${verb} this contact yet — searched ${mailboxes.join(", ")}.`
    : `No emails ${verb} this contact yet.`;
}

// Map a raw message into the canonical MessageListItem. For "sent" the display
// `from` is us (which team member sent it — exactly what the user wants to see),
// while the Compose target is the recipient so a follow-up replies to the
// contact, not to ourselves.
function toItem(
  m: RawMessage,
  direction: Direction,
  contactEmailForSent: string | null,
): MessageListItem {
  const channel = m.channel ?? "email";
  const sent = direction === "sent";
  // WhatsApp rows aren't email-repliable, so no compose target is derived.
  const composeEmail =
    channel !== "email"
      ? ""
      : sent
        ? parseEmailAddress(m.to ?? "") || contactEmailForSent || ""
        : (parseEmailAddress(m.from) ?? "");
  return {
    id: m.id,
    threadId: m.threadId ?? null,
    from: m.from,
    fromEmail: composeEmail,
    contactName:
      channel !== "email"
        ? null
        : sent
          ? parseDisplayName(m.to ?? "")
          : parseDisplayName(m.from),
    subject: m.subject,
    snippet: m.snippet,
    dateMs: m.dateMs,
    mailbox: m.mailbox ?? null,
    mailboxEmail: m.mailboxEmail ?? null,
    channel,
  };
}
