"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

interface PoEmail {
  id: string;
  threadId: string | null;
  from: string;
  subject: string | null;
  snippet: string | null;
  dateMs: number;
  mailbox: string | null;
  gmailUrl: string | null;
}

/**
 * "Related emails" section in the PO Activity tab. Lazily searches the team's
 * connected Gmail inboxes (via /api/production/po/[id]/emails) for messages
 * mentioning this PO's number or SKUs — subject OR body — and lists them with
 * a Gmail deep-link. Read-only; never blocks the page render.
 */
export function PoRelatedEmails({ poId }: { poId: string }) {
  const [emails, setEmails] = useState<PoEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setEmails(null);
    setError(null);
    fetch(`/api/production/po/${poId}/emails`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        if (active) setEmails(d.data?.emails ?? []);
      })
      .catch(() => {
        if (active) setError("Couldn't load related emails.");
      });
    return () => {
      active = false;
    };
  }, [poId]);

  return (
    <div className="mt-6 border-t border-zinc-100 pt-4">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
        <Mail className="h-3.5 w-3.5" /> Related emails
      </h3>
      {emails === null && !error ? (
        <p className="mt-2 text-sm text-zinc-400">
          Searching your team&apos;s inboxes…
        </p>
      ) : error ? (
        <p className="mt-2 text-sm text-zinc-400">{error}</p>
      ) : emails && emails.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          No emails mention this PO&apos;s number or SKUs.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {emails?.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-zinc-100 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {e.subject || "(no subject)"}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {new Date(e.dateMs).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="text-xs text-zinc-500">
                {e.from}
                {e.mailbox ? ` · in ${e.mailbox}'s inbox` : ""}
              </div>
              {e.snippet && (
                <div className="mt-0.5 truncate text-xs text-zinc-400">
                  {e.snippet}
                </div>
              )}
              {e.gmailUrl && (
                <a
                  href={e.gmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                >
                  Open in Gmail →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
