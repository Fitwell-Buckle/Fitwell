"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export interface ComposeTarget {
  to: string;
  contactName?: string | null;
  theirSubject?: string | null;
  theirMessage?: string | null;
  relationship?: "customer" | "b2b_customer" | "lead" | "supplier" | "influencer";
}

// "Compose Message" button + AI-assisted reply modal. Drafts a reply via Claude
// on open (editable), then sends from the signed-in admin's Gmail.
export function ComposeMessageButton({
  target,
  label = "Compose Message",
  variant = "outline",
  onSent,
}: {
  target: ComposeTarget;
  label?: string;
  variant?: "outline" | "secondary" | "default" | "ghost";
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={!target.to}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ComposeModal
        open={open}
        onOpenChange={setOpen}
        target={target}
        onSent={onSent}
      />
    </>
  );
}

function ComposeModal({
  open,
  onOpenChange,
  target,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: ComposeTarget;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafted, setDrafted] = useState(false);

  async function generate() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/compose/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: target.contactName ?? null,
          theirSubject: target.theirSubject ?? null,
          theirMessage: target.theirMessage ?? null,
          relationship: target.relationship ?? "customer",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Couldn't draft a reply — write your own below.");
        return;
      }
      if (json.data?.subject) setSubject(json.data.subject);
      setBody(json.data?.body ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft a reply");
    } finally {
      setDrafting(false);
    }
  }

  // On first open, seed a "Re:" subject and fetch an AI draft once.
  useEffect(() => {
    if (!open || drafted) return;
    setDrafted(true);
    const re = target.theirSubject
      ? `Re: ${target.theirSubject.replace(/^re:\s*/i, "")}`
      : "";
    setSubject(re);
    setBody("");
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    if (!body.trim()) {
      setError("Write a message first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/compose/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: target.to, subject, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error ?? "Send failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Sent to ${target.to}`);
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Compose message"
      description={`To ${target.to}`}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Subject
          </label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-zinc-500">
              Message
            </label>
            <button
              type="button"
              onClick={generate}
              disabled={drafting || sending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {drafting ? "Drafting…" : "Re-draft with AI"}
            </button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={drafting ? "Drafting a reply…" : "Write your reply…"}
            className="min-h-[200px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || drafting || !body.trim()}>
            {sending ? "Sending…" : "Send via Gmail"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
