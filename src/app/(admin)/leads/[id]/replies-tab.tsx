"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Reply {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  dateMs: number;
  // Which team inbox this was found in (cross-mailbox search).
  mailbox?: string;
  // The owner email of that inbox — targets the right Google account on click.
  mailboxEmail?: string;
}

// Build a deep link that opens the conversation in Gmail. `authuser` nudges
// Gmail to the right account when the viewer is signed into several.
function gmailThreadUrl(r: Reply): string {
  const base = "https://mail.google.com/mail/";
  const auth = r.mailboxEmail
    ? `?authuser=${encodeURIComponent(r.mailboxEmail)}`
    : "u/0/";
  return `${base}${auth}#all/${r.threadId}`;
}

// Fetches the contact's emails on mount — across every connected team inbox,
// not just the lead owner's, so a contact who emailed a colleague still shows
// up (Radix only mounts the active tab). Also marks replies as seen so the
// "new" dot clears on the next page load.
export function RepliesTab({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);
  // Labels of the inboxes that were actually searched (Gmail-connected admins).
  const [mailboxes, setMailboxes] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/replies`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setReplies(d.data?.replies ?? []);
        setMailboxes(d.data?.mailboxes ?? []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    // Mark seen (best-effort) so the blue dot clears next load.
    fetch(`/api/leads/${leadId}/replies-seen`, { method: "POST" }).catch(
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [leadId]);

  return (
    <Card>
      <CardContent>
        {state === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Checking inboxes…
          </p>
        )}
        {state === "error" && (
          <p className="py-6 text-center text-sm text-zinc-400">
            Couldn&apos;t load replies. Connect Google (sign out/in) to see a
            lead&apos;s email replies here.
          </p>
        )}
        {state === "ready" && replies.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">
            No emails from this contact yet
            {mailboxes.length > 0
              ? ` — searched ${mailboxes.join(", ")}.`
              : "."}
          </p>
        )}
        {state === "ready" && replies.length > 0 && (
          <ul className="divide-y divide-zinc-100">
            {replies.map((r) => (
              <li key={`${r.mailbox ?? ""}-${r.id}`}>
                <a
                  href={gmailThreadUrl(r)}
                  target="_blank"
                  rel="noreferrer"
                  className="group block py-3 transition-colors hover:bg-zinc-50"
                  title="Open this conversation in Gmail"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-zinc-900">
                      <span className="truncate">
                        {r.subject || "(no subject)"}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                    </p>
                    <p className="shrink-0 text-xs text-zinc-400">
                      {r.dateMs
                        ? new Date(r.dateMs).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : ""}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{r.from}</p>
                  <p className="mt-1 text-sm text-zinc-600">{r.snippet}</p>
                  {r.mailbox && (
                    <p className="mt-1 text-xs text-zinc-400">
                      In {r.mailbox}&apos;s inbox
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        {state === "ready" && mailboxes.length > 0 && (
          <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
            Searched {mailboxes.length} connected inbox
            {mailboxes.length === 1 ? "" : "es"}: {mailboxes.join(", ")}. A
            teammate&apos;s emails only show here once they sign into admin with
            Google.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
