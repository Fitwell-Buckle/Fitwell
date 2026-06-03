"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";

export interface MessageView {
  id: string;
  toEmail: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body: string;
  status: string;
  scheduledAt: string | null;
  // The contact this is going to (lead, customer, or supplier) + a link to
  // their detail page (null if none).
  contactName: string;
  contactHref: string | null;
}

// "YYYY-MM-DDTHH:mm" in local time for a datetime-local input, defaulting to
// ~1 hour out.
function defaultScheduleLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageCard({ message }: { message: MessageView }) {
  const router = useRouter();
  const [subject, setSubject] = useState(message.subject ?? "");
  const [body, setBody] = useState(message.body);
  const [cc, setCc] = useState(message.cc ?? "");
  const [bcc, setBcc] = useState(message.bcc ?? "");
  const [showCc, setShowCc] = useState(!!(message.cc || message.bcc));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleLocal());
  const scheduled = message.status === "scheduled";
  const dirty =
    subject !== (message.subject ?? "") ||
    body !== message.body ||
    cc !== (message.cc ?? "") ||
    bcc !== (message.bcc ?? "");

  // Schedule the send: persist any edits + set status/scheduledAt. The
  // send-scheduled cron sends it from your Gmail once the time passes.
  async function schedule() {
    if (!message.toEmail) {
      toast.error("This lead has no email address to send to.");
      return;
    }
    const when = new Date(scheduleAt);
    if (!scheduleAt || isNaN(when.getTime())) {
      toast.error("Pick a date & time.");
      return;
    }
    if (when.getTime() < Date.now()) {
      toast.error("Pick a time in the future.");
      return;
    }
    await patch(
      {
        subject: subject || null,
        body,
        cc: cc.trim() || null,
        bcc: bcc.trim() || null,
        status: "scheduled",
        scheduledAt: when.toISOString(),
      },
      `Scheduled for ${fmtWhen(when.toISOString())}`,
    );
  }

  // Ask AI to recompose the on-screen draft, steered by the notes box. Replaces
  // the editor contents — the user reviews, then Saves/Sends as usual.
  async function rewrite() {
    if (!body.trim()) {
      toast.error("Nothing to recompose yet.");
      return;
    }
    const instruction = notes.trim() || undefined;
    setRewriting(true);
    try {
      const res = await fetch(`/api/messages/${message.id}/rewrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject || null, body, instruction }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? `Recompose failed (${res.status})`);
        return;
      }
      if (json.data?.subject) setSubject(json.data.subject);
      if (json.data?.body) setBody(json.data.body);
      toast.success("Recomposed — review, then save or send.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recompose failed");
    } finally {
      setRewriting(false);
    }
  }

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
          body: JSON.stringify({
            subject: subject || null,
            body,
            cc: cc.trim() || null,
            bcc: bcc.trim() || null,
          }),
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
            {message.contactHref ? (
              <Link
                href={message.contactHref}
                className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
              >
                {message.contactName}
              </Link>
            ) : (
              <span className="font-medium text-zinc-900">
                {message.contactName}
              </span>
            )}
            {message.toEmail && (
              <span className="ml-2 text-zinc-500">{message.toEmail}</span>
            )}
          </div>
          {scheduled ? (
            <Badge className="bg-blue-100 text-blue-800">
              Scheduled
              {message.scheduledAt ? ` · ${fmtWhen(message.scheduledAt)}` : ""}
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800">Draft</Badge>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-start gap-2">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
            {!showCc && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => setShowCc(true)}
              >
                Cc/Bcc
              </Button>
            )}
          </div>
          {showCc && (
            <>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Cc — name@example.com, other@example.com"
              />
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="Bcc — name@example.com, other@example.com"
              />
            </>
          )}
          <textarea
            className="min-h-[160px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Notes to guide the AI (optional)
            </label>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. offer a sample, push for a call next week, keep it short — then Recompose with AI"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !dirty}
            onClick={() =>
              patch(
                {
                  subject: subject || null,
                  body,
                  cc: cc.trim() || null,
                  bcc: bcc.trim() || null,
                },
                "Saved",
              )
            }
          >
            {dirty ? "Save edits" : "Saved"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={rewrite}
            disabled={busy || rewriting || !body.trim()}
          >
            <Sparkles className="h-4 w-4" />
            {rewriting ? "Recomposing…" : "Recompose with AI"}
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

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
          <span className="text-xs text-zinc-500">Schedule for later:</span>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !message.toEmail}
            onClick={schedule}
          >
            {scheduled ? "Reschedule" : "Schedule send"}
          </Button>
          {scheduled && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => patch({ status: "draft" }, "Schedule cancelled")}
            >
              Cancel schedule
            </Button>
          )}
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
