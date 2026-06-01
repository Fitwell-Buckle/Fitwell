"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  poId: string | null;
  leadId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Shared notification inbox used by both the admin (`/notifications`) and the
 * supplier portal (`/supplier/notifications`). `apiPath` is the mark-read
 * endpoint; `poHrefBase` is the PO link prefix for each side.
 */
export function NotificationList({
  items,
  apiPath,
  poHrefBase,
  leadHrefBase,
}: {
  items: NotificationItem[];
  apiPath: string;
  poHrefBase: string;
  leadHrefBase?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = items.filter((n) => !n.readAt).length;

  async function mark(payload: { id?: string; all?: boolean }) {
    setBusy(true);
    try {
      await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{unread} unread</p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || unread === 0}
          onClick={() => mark({ all: true })}
        >
          Mark all read
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">
            No notifications yet.
          </p>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-lg border p-3",
                n.readAt ? "border-zinc-200 bg-white" : "border-zinc-300 bg-zinc-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {!n.readAt && (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" />
                    )}
                    {n.title}
                  </p>
                  {n.body && <p className="mt-0.5 text-sm text-zinc-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-zinc-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {n.poId && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`${poHrefBase}/${n.poId}`}>Open PO</Link>
                    </Button>
                  )}
                  {n.leadId && leadHrefBase && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`${leadHrefBase}/${n.leadId}`}>Open lead</Link>
                    </Button>
                  )}
                  {!n.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => mark({ id: n.id })}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
