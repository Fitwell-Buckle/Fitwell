"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MessagesPanel } from "./messages-panel";
import type { MessageRelationship } from "./message-list";

// Email history for a customer/company/supplier (one or more addresses) across
// all connected team inboxes, with a Received/Sent toggle. The toggle, fetching
// and rendering all live in the shared <MessagesPanel>, so this view stays
// identical to the lead Messages tab.
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
  const cleaned = emails.map((e) => e.trim()).filter(Boolean);
  const param = encodeURIComponent(cleaned.join(","));
  const primary = cleaned[0] ?? "";

  return (
    <Card className="mt-6">
      <CardContent>
        <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
        {cleaned.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            No email address on file.
          </p>
        ) : (
          <MessagesPanel
            relationship={relationship}
            receivedUrl={`/api/inbound?emails=${param}`}
            sentUrl={`/api/inbound?emails=${param}&direction=sent`}
            contactEmailForSent={primary}
            composeTo={primary}
          />
        )}
      </CardContent>
    </Card>
  );
}
