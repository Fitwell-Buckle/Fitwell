"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Reply {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  dateMs: number;
}

// Fetches the lead's email replies (from the owner's Gmail) on mount — i.e.
// when the user opens the Replies tab (Radix only mounts the active tab). Also
// marks replies as seen so the "new" dot clears on the next page load.
export function RepliesTab({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [replies, setReplies] = useState<Reply[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/replies`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setReplies(d.data?.replies ?? []);
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
            Checking your inbox…
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
            No replies from this lead yet.
          </p>
        )}
        {state === "ready" && replies.length > 0 && (
          <ul className="divide-y divide-zinc-100">
            {replies.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {r.subject || "(no subject)"}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
