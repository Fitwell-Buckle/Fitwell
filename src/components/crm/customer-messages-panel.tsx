"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComposeMessageButton } from "./compose-message";

export interface CustomerMessageItem {
  id: string;
  threadId: string | null;
  fromEmail: string;
  displayName: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null; // ISO
  mailboxLabel: string | null;
  mailboxEmail: string | null;
}

function gmailUrl(threadId: string | null, mailboxEmail: string | null): string | null {
  if (!threadId) return null;
  const auth = mailboxEmail
    ? `?authuser=${encodeURIComponent(mailboxEmail)}`
    : "u/0/";
  return `https://mail.google.com/mail/${auth}#all/${threadId}`;
}

// New (undismissed) inbound messages from existing customers, surfaced at the
// top of the B2B / Consumer tabs. Each: dismiss, open-in-Gmail, and an
// AI-assisted Compose reply.
export function CustomerMessagesPanel({
  messages,
  audience,
}: {
  messages: CustomerMessageItem[];
  audience: "b2b" | "consumer" | "supplier";
}) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState<string | null>(null);
  // Optimistically hide dismissed items before the refresh lands.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = messages.filter((m) => !hidden.has(m.id));

  async function dismiss(id: string) {
    setDismissing(id);
    setHidden((h) => new Set(h).add(id));
    try {
      const res = await fetch(`/api/customer-messages/${id}/dismiss`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Couldn't dismiss");
        setHidden((h) => {
          const next = new Set(h);
          next.delete(id);
          return next;
        });
        return;
      }
      router.refresh();
    } finally {
      setDismissing(null);
    }
  }

  if (shown.length === 0) return null;

  return (
    <Card className="mt-6 border-sky-200 bg-sky-50/40">
      <CardContent>
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Mail className="h-4 w-4 text-sky-600" />
          New messages from {audience === "supplier" ? "suppliers" : "customers"}{" "}
          ({shown.length})
        </p>
        <ul className="mt-3 divide-y divide-zinc-100">
          {shown.map((m) => {
            const url = gmailUrl(m.threadId, m.mailboxEmail);
            return (
              <li key={m.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {m.displayName}{" "}
                      <span className="font-normal text-zinc-400">
                        &lt;{m.fromEmail}&gt;
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-zinc-700">
                      {m.subject || "(no subject)"}
                    </p>
                    {m.snippet && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">
                        {m.snippet}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      {m.receivedAt
                        ? new Date(m.receivedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : ""}
                      {m.mailboxLabel ? ` · in ${m.mailboxLabel}'s inbox` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-zinc-400" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ComposeMessageButton
                    target={{
                      to: m.fromEmail,
                      contactName: m.displayName,
                      theirSubject: m.subject,
                      theirMessage: m.snippet,
                      relationship:
                        audience === "b2b"
                          ? "b2b_customer"
                          : audience === "supplier"
                            ? "supplier"
                            : "customer",
                    }}
                    onSent={() => dismiss(m.id)}
                  />
                  {url && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open in Gmail
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={dismissing === m.id}
                    onClick={() => dismiss(m.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
