"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface MessageView {
  id: string;
  leadId: string;
  toEmail: string | null;
  subject: string | null;
  body: string;
  status: string;
  leadName: string;
}

function MessageCard({ message }: { message: MessageView }) {
  const router = useRouter();
  const [subject, setSubject] = useState(message.subject ?? "");
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const dirty = subject !== (message.subject ?? "") || body !== message.body;

  async function patch(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? `Failed (${res.status})`);
        return;
      }
      toast.success(okMsg);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function send() {
    if (!message.toEmail) {
      toast.error("This lead has no email address.");
      return;
    }
    if (
      !confirm(
        `Send this email to ${message.toEmail} from your Gmail?` +
          (dirty ? "\n\nUnsaved edits will be saved and sent." : ""),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      // Persist any edits first so what's sent matches what's on screen.
      if (dirty) {
        const save = await fetch(`/api/messages/${message.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject: subject || null, body }),
        });
        if (!save.ok) {
          toast.error("Couldn't save edits before sending");
          return;
        }
      }
      const res = await fetch(`/api/messages/${message.id}/send`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? `Send failed (${res.status})`);
        return;
      }
      toast.success(`Sent to ${message.toEmail}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <Link
              href={`/leads/${message.leadId}`}
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
            >
              {message.leadName}
            </Link>
            {message.toEmail && (
              <span className="ml-2 text-zinc-500">{message.toEmail}</span>
            )}
          </div>
          <Badge className="bg-amber-100 text-amber-800">Draft</Badge>
        </div>

        <div className="mt-3 space-y-2">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <textarea
            className="min-h-[160px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => patch({ subject: subject || null, body }, "Saved")}
          >
            {dirty ? "Save edits" : "Saved"}
          </Button>
          <Button size="sm" variant="outline" onClick={copy} disabled={busy}>
            Copy
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => patch({ status: "dismissed" }, "Dismissed")}
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => patch({ status: "sent" }, "Marked as sent")}
          >
            Mark as sent
          </Button>
          <Button
            size="sm"
            disabled={busy || !message.toEmail}
            onClick={send}
          >
            Send via Gmail
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MessagesList({ messages }: { messages: MessageView[] }) {
  if (messages.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent>
          <p className="py-8 text-center text-sm text-zinc-400">
            No messages to send. Drafts appear here automatically after a lead
            is captured.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      {messages.map((m) => (
        <MessageCard key={m.id} message={m} />
      ))}
    </div>
  );
}
