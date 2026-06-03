"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageList,
  type MessageListItem,
  type MessageRelationship,
} from "./message-list";

export interface CustomerMessageItem {
  id: string;
  threadId: string | null;
  fromEmail: string;
  displayName: string;
  company: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null; // ISO
  mailboxLabel: string | null;
  mailboxEmail: string | null;
}

export type MessageAudience = "b2b" | "consumer" | "supplier" | "influencer";

const RELATIONSHIP: Record<MessageAudience, MessageRelationship> = {
  b2b: "b2b_customer",
  consumer: "customer",
  supplier: "supplier",
  influencer: "influencer",
};

const NOUN: Record<MessageAudience, string> = {
  b2b: "customers",
  consumer: "customers",
  supplier: "suppliers",
  influencer: "influencers",
};

// "New messages" panel surfaced at the top of the B2B / Consumer / Suppliers /
// Influencers lists. Detected (stored) customer_message rows; rendering is the
// shared <MessageList> so it matches the lead Replies tab exactly.
export function CustomerMessagesPanel({
  messages,
  audience,
}: {
  messages: CustomerMessageItem[];
  audience: MessageAudience;
}) {
  const router = useRouter();

  const items: MessageListItem[] = messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    from: `${m.displayName} <${m.fromEmail}>`,
    fromEmail: m.fromEmail,
    contactName: m.displayName,
    company: m.company,
    subject: m.subject,
    snippet: m.snippet,
    dateMs: m.receivedAt ? Date.parse(m.receivedAt) : 0,
    mailbox: m.mailboxLabel,
    mailboxEmail: m.mailboxEmail,
  }));

  async function dismiss(item: MessageListItem) {
    try {
      const res = await fetch(`/api/customer-messages/${item.id}/dismiss`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Couldn't dismiss");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Couldn't dismiss");
    }
  }

  if (items.length === 0) return null;

  return (
    <Card className="mt-6 border-sky-200 bg-sky-50/40">
      <CardContent>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Mail className="h-4 w-4 text-sky-600" />
          New messages from {NOUN[audience]} ({items.length})
        </p>
        <MessageList
          items={items}
          relationship={RELATIONSHIP[audience]}
          onDismiss={dismiss}
        />
      </CardContent>
    </Card>
  );
}
