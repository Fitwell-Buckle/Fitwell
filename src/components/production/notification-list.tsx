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
  href: string | null;
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
  const [tab, setTab] = useState<"unread" | "read">("unread");
  const unread = items.filter((n) => !n.readAt).length;
  const readCount = items.length - unread;
  const shown = items.filter((n) =>
    tab === "unread" ? !n.readAt : !!n.readAt,
  );

  async function mark(payload: { id?: string; all?: boolean }) {
    setBusy(true);
    try {
      await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Tell other surfaces (the sidebar unread badge) to re-read the count so
      // marking read here clears the badge everywhere immediately — not just
      // after the next navigation. router.refresh() only re-renders this page's
      // server components, not the persistent sidebar.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("admin-notifications-changed"));
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const tabCls = (active: boolean) =>
    cn(
      "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "border-zinc-900 text-zinc-900"
        : "border-transparent text-zinc-500 hover:text-zinc-800",
    );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between border-b border-zinc-200">
        <div className="flex gap-1">
          <button
            type="button"
            className={tabCls(tab === "unread")}
            onClick={() => setTab("unread")}
          >
            Unread{unread > 0 ? ` (${unread})` : ""}
          </button>
          <button
            type="button"
            className={tabCls(tab === "read")}
            onClick={() => setTab("read")}
          >
            Read{readCount > 0 ? ` (${readCount})` : ""}
          </button>
        </div>
        {tab === "unread" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || unread === 0}
            onClick={() => mark({ all: true })}
          >
            Mark all read
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">
            {tab === "unread" ? "Nothing unread." : "Nothing read yet."}
          </p>
        ) : (
          shown.map((n) => (
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
                  {n.href && !n.poId && !n.leadId && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={n.href}>Open</Link>
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
