import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listLeads } from "@/lib/crm/service";
import {
  countDraftMessages,
  leadIdsWithDraftMessages,
} from "@/lib/crm/messages";
import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadRating } from "@/components/crm/lead-rating";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  sourceChannelLabel,
  stageBadgeClass,
  stageLabel,
} from "@/lib/crm/display";
import { LEADS_TABS } from "@/lib/nav-tabs";
import { cn } from "@/lib/utils";
import { LeadsFilters } from "./leads-filters";

export const metadata: Metadata = {
  title: "Leads | Fitwell Admin",
};

function strParam(
  v: string | string[] | undefined,
): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const filters = {
    stage: strParam(params.stage),
    sourceChannel: strParam(params.sourceChannel),
    ownerUserId: strParam(params.ownerUserId),
    status: strParam(params.status),
    search: strParam(params.search),
    sort: strParam(params.sort),
  };

  // Toggle the "Value" header between rating-sorted and the default
  // newest-first, preserving every other active filter in the URL.
  const sortedByRating = filters.sort === "rating";
  const sortHref = (() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "sort") continue;
      const s = strParam(v);
      if (s) sp.set(k, s);
    }
    if (!sortedByRating) sp.set("sort", "rating");
    const qs = sp.toString();
    return qs ? `/leads?${qs}` : "/leads";
  })();

  const [leads, draftCount, nextStepLeadIds] = await Promise.all([
    listLeads(filters),
    countDraftMessages(),
    leadIdsWithDraftMessages(),
  ]);
  const tabs = LEADS_TABS.map((t) =>
    t.href === "/messages" ? { ...t, dot: draftCount > 0 } : t,
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <PageHeader title="Leads" />
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/leads/new">+ Add lead</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/leads/capture">Capture</Link>
          </Button>
        </div>
      </div>

      <SectionTabs tabs={tabs} />

      <LeadsFilters />

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>
                <Link
                  href={sortHref}
                  className={cn(
                    "inline-flex items-center gap-1 hover:text-zinc-900",
                    sortedByRating && "font-semibold text-zinc-900",
                  )}
                  title="Sort by triage rating"
                >
                  Value
                  <ArrowDown
                    className={cn(
                      "h-3 w-3",
                      sortedByRating ? "text-zinc-900" : "text-zinc-300",
                    )}
                  />
                </Link>
              </TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Next Steps</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Captured</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-zinc-400"
                >
                  No leads match.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      {l.companyName ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-zinc-700">
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </div>
                    {l.email && (
                      <div className="text-xs text-zinc-500">{l.email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <LeadRating value={l.leadValue} temp={l.followUpTemp} />
                  </TableCell>
                  <TableCell>
                    <Badge className={stageBadgeClass(l.stage)}>
                      {stageLabel(l.stage)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {nextStepLeadIds.has(l.id) ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700"
                        title="Has a drafted follow-up waiting in Next Steps"
                      >
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        Next step
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-600">
                    {sourceChannelLabel(l.sourceChannel)}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {l.capturedAt
                      ? l.capturedAt.toLocaleDateString("en-US")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
