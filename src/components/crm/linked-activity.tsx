"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Mic,
  StickyNote,
  CircleDot,
  Mail,
  Phone,
  Loader2,
  Store,
  Users,
  Factory,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDictation } from "@/components/ui/use-dictation";

// Mirrors the server payload from /api/linked-activity (src/lib/tradeshows/
// activity.ts). Kept local so this client component pulls in no server code.
type ServerItem =
  | { kind: "note"; id: string; at: string; author: string | null; body: string }
  | {
      kind: "voice";
      id: string;
      at: string;
      author: string | null;
      transcript: string | null;
      blobUrl: string;
      durationSec: number | null;
    }
  | {
      kind: "lead_comment";
      id: string;
      at: string;
      author: string | null;
      body: string;
    }
  | { kind: "event"; id: string; at: string; label: string };

type MessageItem = {
  kind: "message";
  id: string;
  at: string;
  direction: "in" | "out";
  channel: "email" | "whatsapp";
  from: string;
  subject: string | null;
  snippet: string | null;
};

type Item = ServerItem | MessageItem;

interface LinkedActivityData {
  links: {
    vendorId: string;
    showId: string;
    vendorCompanyName: string;
    leadId: string | null;
    leadName: string | null;
    supplierLeadId: string | null;
    supplierLeadName: string | null;
    supplierId: string | null;
    supplierMsgEmails: string[];
  };
  notes: {
    booth: string | null;
    customerLead: string | null;
    supplierLead: string | null;
  };
  timeline: ServerItem[];
}

type Context = "vendor" | "lead" | "supplier";

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.round((now - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LinkedActivity(props: {
  context: Context;
  vendorId?: string;
  leadId?: string;
  supplierLeadId?: string;
}) {
  const [data, setData] = useState<LinkedActivityData | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const bodyRef = useRef("");
  bodyRef.current = body;

  const query = props.vendorId
    ? `vendorId=${props.vendorId}`
    : props.leadId
      ? `leadId=${props.leadId}`
      : `supplierLeadId=${props.supplierLeadId}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/linked-activity?${query}`);
    if (res.status === 204) {
      setData(null);
      return;
    }
    if (!res.ok) return;
    const json = await res.json();
    setData(json.data as LinkedActivityData);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Lazy-load the linked records' email + WhatsApp (inbound + sent) and merge
  // them into the timeline. Two message sources: the customer lead (by lead id,
  // via /replies) and the supplier side (by email address(es) + promoted
  // supplier id, via /inbound). A shared address can return the same email from
  // both, so we dedupe by message id.
  useEffect(() => {
    if (!data) {
      setMessages([]);
      return;
    }
    const { leadId, supplierId, supplierMsgEmails } = data.links;

    // Build (direction, url) fetch jobs from whichever sources exist.
    const jobs: { direction: "in" | "out"; url: string }[] = [];
    if (leadId) {
      jobs.push({ direction: "in", url: `/api/leads/${leadId}/replies` });
      jobs.push({
        direction: "out",
        url: `/api/leads/${leadId}/replies?direction=sent`,
      });
    }
    if (supplierMsgEmails.length > 0 || supplierId) {
      const params = new URLSearchParams();
      if (supplierMsgEmails.length > 0)
        params.set("emails", supplierMsgEmails.join(","));
      if (supplierId) {
        params.set("waType", "supplier");
        params.set("waId", supplierId);
      }
      const base = `/api/inbound?${params.toString()}`;
      jobs.push({ direction: "in", url: base });
      jobs.push({ direction: "out", url: `${base}&direction=sent` });
    }
    if (jobs.length === 0) {
      setMessages([]);
      return;
    }

    let active = true;
    Promise.all(
      jobs.map(async ({ direction, url }) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        const replies = (json?.data?.replies ?? []) as Array<{
          id: string;
          channel: "email" | "whatsapp";
          from: string;
          subject: string | null;
          snippet: string | null;
          dateMs: number;
        }>;
        return replies.map((r) => ({ direction, r }));
      }),
    ).then((results) => {
      if (!active) return;
      const byKey = new Map<string, MessageItem>();
      for (const { direction, r } of results.flat()) {
        const key = `${direction}-${r.id}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          kind: "message",
          id: key,
          at: new Date(r.dateMs).toISOString(),
          direction,
          channel: r.channel,
          from: r.from,
          subject: r.subject,
          snippet: r.snippet,
        });
      }
      setMessages([...byKey.values()]);
    });
    return () => {
      active = false;
    };
  }, [data]);

  const timeline: Item[] = useMemo(() => {
    if (!data) return [];
    return [...data.timeline, ...messages].sort((a, b) =>
      a.at > b.at ? -1 : a.at < b.at ? 1 : 0,
    );
  }, [data, messages]);

  const dictation = useDictation(setBody, () => bodyRef.current);

  async function addNote() {
    if (!data || !body.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(
        `/api/trade-shows/${data.links.showId}/vendors/${data.links.vendorId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        },
      );
      if (!res.ok) throw new Error();
      setBody("");
      if (dictation.listening) dictation.toggle();
      await load();
      toast.success("Note added");
    } catch {
      toast.error("Couldn't add note");
    } finally {
      setPosting(false);
    }
  }

  // Not linked to a trade-show booth → nothing to unify; render nothing.
  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
      </div>
    );
  }
  if (!data) return null;

  const { links, notes } = data;

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-900">
        Activity (all linked records)
      </h2>
      <Card className="p-4">
        {/* Cross-links to the same entity's other records */}
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <LinkChip
            icon={Store}
            label={`Booth · ${links.vendorCompanyName}`}
            href={`/trade-shows/${links.showId}/vendors/${links.vendorId}`}
            current={props.context === "vendor"}
          />
          {links.leadId && (
            <LinkChip
              icon={Users}
              label={`Customer Lead${links.leadName ? ` · ${links.leadName}` : ""}`}
              href={`/leads/${links.leadId}`}
              current={props.context === "lead"}
            />
          )}
          {links.supplierLeadId && (
            <LinkChip
              icon={Factory}
              label="Supplier Lead"
              href={`/modules/production/supplier-leads/${links.supplierLeadId}`}
              current={props.context === "supplier"}
            />
          )}
        </div>

        {/* Captured single-field notes, shown read-only for context */}
        {(notes.booth || notes.customerLead || notes.supplierLead) && (
          <div className="mb-3 space-y-1.5 rounded-md bg-zinc-50 p-3 text-sm">
            {notes.booth && <NoteLine label="Booth" text={notes.booth} />}
            {notes.customerLead && (
              <NoteLine label="Customer lead" text={notes.customerLead} />
            )}
            {notes.supplierLead && (
              <NoteLine label="Supplier lead" text={notes.supplierLead} />
            )}
          </div>
        )}

        {/* Add a shared note */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-500">
              Add a note (visible on every linked record)
            </label>
            {dictation.supported && (
              <button
                type="button"
                onClick={dictation.toggle}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
                  dictation.listening
                    ? "bg-red-50 text-red-600"
                    : "text-zinc-400 hover:text-zinc-600",
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                {dictation.listening ? "Listening…" : "Dictate"}
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Discussed pricing, next step is a sample…"
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <Button
            className="mt-2"
            size="sm"
            onClick={addNote}
            disabled={posting || !body.trim()}
          >
            {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add note
          </Button>
        </div>

        {/* Unified timeline */}
        {timeline.length === 0 ? (
          <p className="text-sm text-zinc-400">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((item) => (
              <TimelineRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function LinkChip({
  icon: Icon,
  label,
  href,
  current,
}: {
  icon: typeof Store;
  label: string;
  href: string;
  current: boolean;
}) {
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium",
        current
          ? "bg-zinc-200 text-zinc-700"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {current && <span className="text-zinc-400">· here</span>}
    </span>
  );
  return current ? inner : <Link href={href}>{inner}</Link>;
}

function NoteLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-zinc-400">{label}: </span>
      <span className="whitespace-pre-wrap text-zinc-700">{text}</span>
    </div>
  );
}

function TimelineRow({ item }: { item: Item }) {
  const meta = rowMeta(item);
  return (
    <li className="flex gap-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <meta.Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-zinc-500">
            {meta.title}
          </span>
          <span className="shrink-0 text-xs text-zinc-400">
            {relTime(item.at)}
          </span>
        </div>
        {meta.body && (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800">
            {meta.body}
          </p>
        )}
        {item.kind === "voice" && (
          <audio
            controls
            src={item.blobUrl}
            preload="none"
            className="mt-1 h-8 w-full max-w-sm"
          >
            <track kind="captions" />
          </audio>
        )}
      </div>
    </li>
  );
}

function rowMeta(item: Item): {
  Icon: typeof Store;
  title: string;
  body: string | null;
} {
  switch (item.kind) {
    case "note":
      return {
        Icon: StickyNote,
        title: `Note${item.author ? ` · ${item.author}` : ""}`,
        body: item.body,
      };
    case "lead_comment":
      return {
        Icon: MessageSquare,
        title: `Lead comment${item.author ? ` · ${item.author}` : ""}`,
        body: item.body,
      };
    case "voice":
      return {
        Icon: Mic,
        title: `Voice note${item.author ? ` · ${item.author}` : ""}`,
        body: item.transcript,
      };
    case "event":
      return { Icon: CircleDot, title: item.label, body: null };
    case "message":
      return {
        Icon: item.channel === "whatsapp" ? Phone : Mail,
        title: `${item.direction === "out" ? "Sent" : "Received"} · ${
          item.channel === "whatsapp" ? "WhatsApp" : "Email"
        } · ${item.from}`,
        body:
          [item.subject, item.snippet].filter(Boolean).join(" — ") || null,
      };
  }
}
