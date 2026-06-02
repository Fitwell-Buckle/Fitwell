"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mailboxColor } from "@/lib/crm/mailbox-color";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  poId: string | null;
  leadId: string | null;
  href: string | null;
  // Which team inbox an email-derived notification relates to (color + filter).
  mailbox: string | null;
  mailboxEmail: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Shared notification inbox used by both the admin (`/notifications`) and the
 * supplier portal (`/supplier/notifications`). Email-derived notifications
 * (customer messages, lead replies) carry a mailbox, so the list color-codes
 * and filters by inbox — the same Tom/Oliver system as the messaging views.
 */
export function NotificationList({
  items,
  apiPath,
  poHrefBase,
  leadHrefBase,
  currentUserEmail,
}: {
  items: NotificationItem[];
  apiPath: string;
  poHrefBase: string;
  leadHrefBase?: string;
  currentUserEmail?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"unread" | "read">("unread");
  const [mailboxFilter, setMailboxFilter] = useState<string | null>(null);

  const unread = items.filter((n) => !n.readAt).length;
  const readCount = items.length - unread;

  const tabItems = items.filter((n) => (tab === "unread" ? !n.readAt : !!n.readAt));

  // Mailbox filter chips — built from the current tab's items, your inbox first.
  const counts = new Map<string, number>();
  for (const n of tabItems) {
    if (n.mailbox) counts.set(n.mailbox, (counts.get(n.mailbox) ?? 0) + 1);
  }
  const myLabel =
    tabItems.find(
      (n) =>
        n.mailboxEmail &&
        currentUserEmail &&
        n.mailboxEmail.toLowerCase() === currentUserEmail.toLowerCase(),
    )?.mailbox ?? null;
  const mailboxes = [...counts.keys()].sort((a, b) =>
    a === myLabel ? -1 : b === myLabel ? 1 : 0,
  );

  const shown = mailboxFilter
    ? tabItems.filter((n) => n.mailbox === mailboxFilter)
    : tabItems;

  async function mark(payload: { id?: string; all?: boolean }) {
    setBusy(true);
    try {
      await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
  const chip = "rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between border-b border-zinc-200">
        <div className="flex gap-1">
          <button
            type="button"
            className={tabCls(tab === "unread")}
            onClick={() => setTab("unread")}
          >
            New{unread > 0 ? ` (${unread})` : ""}
          </button>
          <button
            type="button"
            className={tabCls(tab === "read")}
            onClick={() => setTab("read")}
          >
            Dismissed{readCount > 0 ? ` (${readCount})` : ""}
          </button>
        </div>
        {tab === "unread" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || unread === 0}
            onClick={() => mark({ all: true })}
          >
            Dismiss all
          </Button>
        )}
      </div>

      {/* Filter by inbox (your own first) when any notification is mailbox-tagged. */}
      {mailboxes.length >= 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMailboxFilter(null)}
            className={cn(
              chip,
              mailboxFilter === null
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            )}
          >
            All ({tabItems.length})
          </button>
          {mailboxes.map((m) => {
            const c = mailboxColor(m);
            const active = mailboxFilter === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMailboxFilter(active ? null : m)}
                className={cn(chip, active ? c.active : c.tag)}
              >
                {m} ({counts.get(m)})
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">
            {tab === "unread" ? "Nothing new." : "Nothing dismissed yet."}
          </p>
        ) : (
          shown.map((n) => {
            const c = n.mailbox ? mailboxColor(n.mailbox) : null;
            return (
              <div
                key={n.id}
                className={cn(
                  "rounded-lg border border-l-4 p-3",
                  n.readAt ? "border-zinc-200 bg-white" : "border-zinc-300 bg-zinc-50",
                  c ? c.stripe : "border-l-transparent",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-zinc-900">
                    {!n.readAt && (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" />
                    )}
                    {n.title}
                  </p>
                  <p className="shrink-0 text-xs text-zinc-400">
                    {new Date(n.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {n.body && (
                  <p className="mt-1 line-clamp-3 text-sm text-zinc-600">
                    {n.body}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      Dismiss
                    </Button>
                  )}
                  {n.mailbox && c && (
                    <span
                      className={cn(
                        "ml-auto inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                        c.tag,
                      )}
                    >
                      {n.mailbox}&apos;s inbox
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
