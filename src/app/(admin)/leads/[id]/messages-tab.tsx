"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MessagesPanel } from "@/components/crm/messages-panel";
import type { MessageListItem } from "@/components/crm/message-list";

// The lead's email history across all connected team inboxes, with a
// Received/Sent toggle. Received = the contact's emails to us (the old Replies
// tab); Sent = what we emailed the contact. Marks received replies seen on
// mount so the "new" dot clears next load. Rendering + the toggle live in the
// shared <MessagesPanel> so this view stays identical to the customer/supplier
// Messages views.
export function LeadMessagesTab({
  leadId,
  contactEmail,
}: {
  leadId: string;
  contactEmail: string | null;
}) {
  useEffect(() => {
    fetch(`/api/leads/${leadId}/replies-seen`, { method: "POST" }).catch(
      () => {},
    );
  }, [leadId]);

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
        <MessagesPanel
          relationship="lead"
          receivedUrl={`/api/leads/${leadId}/replies`}
          sentUrl={`/api/leads/${leadId}/replies?direction=sent`}
          contactEmailForSent={contactEmail}
          onDismissReceived={dismiss}
          searchedFooterNote
        />
      </CardContent>
    </Card>
  );
}
