"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  OUTREACH_CHANNELS,
  OUTREACH_STATUSES,
} from "@/lib/creators/lifecycle";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

export interface ThreadView {
  id: string;
  channel: string;
  status: string;
  terms: string | null;
  nextFollowupAt: string | null; // ISO date
}

export function OutreachPanel({
  creatorId,
  threads,
}: {
  creatorId: string;
  threads: ThreadView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newThread, setNewThread] = useState({ channel: "email", note: "" });
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logEvent, setLogEvent] = useState({
    direction: "out",
    summary: "",
    status: "",
  });

  async function post(url: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Outreach</span>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Start thread
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-2">
          <div className="flex gap-2">
            <select
              value={newThread.channel}
              onChange={(e) =>
                setNewThread({ ...newThread, channel: e.target.value })
              }
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              autoFocus
              placeholder="What did you send? (logged as the first touch)"
              value={newThread.note}
              onChange={(e) =>
                setNewThread({ ...newThread, note: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !newThread.note}
              onClick={async () => {
                if (
                  await post(`/api/admin/creators/${creatorId}/outreach`, newThread)
                ) {
                  setAdding(false);
                  setNewThread({ channel: "email", note: "" });
                }
              }}
            >
              Log outreach
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {threads.length === 0 && !adding && (
        <p className="text-sm text-zinc-400">
          No contact yet — log the first touch when you reach out.
        </p>
      )}

      {threads.map((t) => (
        <div key={t.id} className="rounded-lg border border-zinc-200 p-2">
          <div className="flex items-center gap-2">
            <Badge>{t.channel}</Badge>
            <select
              value={t.status}
              disabled={busy}
              onChange={(e) =>
                post(`/api/admin/creators/outreach/${t.id}`, {
                  direction: "note",
                  summary: `Status set to ${e.target.value}`,
                  status: e.target.value,
                })
              }
              className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
            >
              {OUTREACH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {t.nextFollowupAt && (
              <span className="text-[11px] text-zinc-400">
                follow up {t.nextFollowupAt.slice(0, 10)}
              </span>
            )}
            <button
              onClick={() => setLogFor(logFor === t.id ? null : t.id)}
              className="ml-auto text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              {logFor === t.id ? "close" : "+ log event"}
            </button>
          </div>
          {t.terms && (
            <p className="mt-1 text-xs text-zinc-500">Terms: {t.terms}</p>
          )}
          {logFor === t.id && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <select
                  value={logEvent.direction}
                  onChange={(e) =>
                    setLogEvent({ ...logEvent, direction: e.target.value })
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="out">sent →</option>
                  <option value="in">← received</option>
                  <option value="note">note</option>
                </select>
                <input
                  autoFocus
                  placeholder="Summary (e.g. replied — wants Ti version)"
                  value={logEvent.summary}
                  onChange={(e) =>
                    setLogEvent({ ...logEvent, summary: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
              <Button
                size="sm"
                disabled={busy || !logEvent.summary}
                onClick={async () => {
                  if (
                    await post(`/api/admin/creators/outreach/${t.id}`, {
                      direction: logEvent.direction,
                      summary: logEvent.summary,
                    })
                  ) {
                    setLogFor(null);
                    setLogEvent({ direction: "out", summary: "", status: "" });
                  }
                }}
              >
                Log
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
