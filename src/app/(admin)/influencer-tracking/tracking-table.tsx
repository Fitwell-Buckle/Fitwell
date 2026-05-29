"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteButton } from "@/components/ui/delete-button";
import { DataTable, Mono } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import {
  deadlineStatus,
  DEADLINE_STATUS_LABELS,
  deadlineStatusBadgeClass,
  DEADLINE_STATUS_ORDER,
  type DeadlineStatus,
} from "@/lib/influencer/influencer";
import { cn } from "@/lib/utils";

export interface TrackingRow {
  id: string;
  orderNumber: string;
  influencerName: string;
  influencerHandle: string | null;
  issuedDate: string;
  contentDueDate: string | null;
  publishedAt: string | null;
  affiliateLink: string | null;
  status: string;
  subtotalCents: number;
}

export function InfluencerTrackingTable({
  rows,
  today,
}: {
  rows: TrackingRow[];
  today: string;
}) {
  // Sort most-urgent first (missed, approaching, …), then by due date.
  const ordered = [...rows].sort((a, b) => {
    const sa = deadlineStatus({
      contentDueDate: a.contentDueDate,
      publishedAt: a.publishedAt,
      today,
    });
    const sb = deadlineStatus({
      contentDueDate: b.contentDueDate,
      publishedAt: b.publishedAt,
      today,
    });
    if (DEADLINE_STATUS_ORDER[sa] !== DEADLINE_STATUS_ORDER[sb]) {
      return DEADLINE_STATUS_ORDER[sa] - DEADLINE_STATUS_ORDER[sb];
    }
    return (a.contentDueDate ?? "9999").localeCompare(b.contentDueDate ?? "9999");
  });

  // Summary counts for the urgency chips.
  const counts = { missed: 0, approaching: 0, hit: 0 } as Record<string, number>;
  for (const r of rows) {
    const s = deadlineStatus({
      contentDueDate: r.contentDueDate,
      publishedAt: r.publishedAt,
      today,
    });
    if (s in counts) counts[s] += 1;
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <SummaryChip
          label="Approaching"
          n={counts.approaching}
          className="bg-amber-50 text-amber-700"
        />
        <SummaryChip label="Missed" n={counts.missed} className="bg-red-50 text-red-700" />
        <SummaryChip
          label="Published"
          n={counts.hit}
          className="bg-emerald-50 text-emerald-700"
        />
      </div>

      <DataTable className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Influencer</TableHead>
              <TableHead className="text-right">Gift value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Content due</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Affiliate link</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-zinc-400">
                  No gifting orders match.
                </TableCell>
              </TableRow>
            ) : (
              ordered.map((r) => <Row key={r.id} row={r} today={today} />)
            )}
          </TableBody>
        </Table>
      </DataTable>
    </>
  );
}

function SummaryChip({
  label,
  n,
  className,
}: {
  label: string;
  n: number;
  className: string;
}) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 font-medium", className)}>
      {n} {label}
    </span>
  );
}

function Row({ row, today }: { row: TrackingRow; today: string }) {
  const router = useRouter();
  const [due, setDue] = useState(row.contentDueDate ?? "");
  const [published, setPublished] = useState(row.publishedAt ?? "");
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState(row.affiliateLink ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Resync local state when the server data refreshes after a save.
  useEffect(() => setDue(row.contentDueDate ?? ""), [row.contentDueDate]);
  useEffect(() => setPublished(row.publishedAt ?? ""), [row.publishedAt]);
  useEffect(() => setLink(row.affiliateLink ?? ""), [row.affiliateLink]);

  const status: DeadlineStatus = deadlineStatus({
    contentDueDate: due || null,
    publishedAt: published || null,
    today,
  });

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/influencer-orders/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Save failed.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErr("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const dateInputCls =
    "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

  return (
    <TableRow>
      <TableCell>
        <Mono>{row.orderNumber}</Mono>
      </TableCell>
      <TableCell className="text-zinc-700">
        {row.influencerName}
        {row.influencerHandle && (
          <span className="ml-2 text-xs text-zinc-400">{row.influencerHandle}</span>
        )}
      </TableCell>
      <TableCell className="text-right text-zinc-500">
        {fmtMoney(row.subtotalCents)}
      </TableCell>
      <TableCell>
        <Badge className={deadlineStatusBadgeClass(status)}>
          {DEADLINE_STATUS_LABELS[status]}
        </Badge>
      </TableCell>
      <TableCell>
        <input
          type="date"
          className={dateInputCls}
          value={due}
          disabled={busy}
          onChange={(e) => setDue(e.target.value)}
          onBlur={() => {
            const v = due || null;
            if (v !== (row.contentDueDate ?? null)) patch({ contentDueDate: v });
          }}
          aria-label="Content due date"
        />
      </TableCell>
      <TableCell>
        {published ? (
          <span className="flex items-center gap-2 text-xs text-zinc-600">
            {fmtDate(published)}
            <button
              type="button"
              className="text-zinc-400 underline hover:text-zinc-600"
              disabled={busy}
              onClick={() => {
                setPublished("");
                patch({ publishedAt: null });
              }}
            >
              clear
            </button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPublished(today);
              patch({ publishedAt: today });
            }}
          >
            Mark published
          </Button>
        )}
      </TableCell>
      <TableCell>
        {editingLink ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-40 text-xs"
              placeholder="https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                if ((await patch({ affiliateLink: link.trim() || null })) !== false)
                  setEditingLink(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setLink(row.affiliateLink ?? "");
                setEditingLink(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : row.affiliateLink ? (
          <div className="flex items-center gap-2">
            <a
              href={row.affiliateLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[180px] items-center gap-1 truncate text-xs text-blue-700 underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.affiliateLink}</span>
            </a>
            <button
              type="button"
              className="text-xs text-zinc-400 underline hover:text-zinc-600"
              onClick={() => setEditingLink(true)}
            >
              edit
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-xs text-zinc-400 underline hover:text-zinc-600"
            onClick={() => setEditingLink(true)}
          >
            Add link
          </button>
        )}
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      </TableCell>
      <TableCell className="text-right">
        <DeleteButton
          entityKind="Gifting order"
          entityLabel={`Gifting order ${row.orderNumber}`}
          deleteUrl={`/api/influencer-orders/${row.id}`}
          iconOnly
        />
      </TableCell>
    </TableRow>
  );
}
