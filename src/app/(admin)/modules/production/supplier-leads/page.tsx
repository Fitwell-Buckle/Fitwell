import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ArrowDown } from "lucide-react";
import { listSupplierLeads } from "@/lib/suppliers/lead-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadRating } from "@/components/crm/lead-rating";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Supplier Leads | Fitwell Admin",
};

function strParam(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function displayName(l: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
}): string {
  const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim();
  return name || l.companyName || l.email || "Unknown";
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  converted: "bg-violet-50 text-violet-700",
  dropped: "bg-zinc-100 text-zinc-500",
};

export default async function SupplierLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const leads = await listSupplierLeads({
    status: strParam(params.status),
    supplierType: strParam(params.supplierType),
    search: strParam(params.search),
    sort: strParam(params.sort),
  });

  // Toggle the "Value" header between rating-sorted and the default
  // newest-first, preserving every other active filter in the URL.
  const sortedByRating = strParam(params.sort) === "rating";
  const sortHref = (() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "sort") continue;
      const s = strParam(v);
      if (s) sp.set(k, s);
    }
    if (!sortedByRating) sp.set("sort", "rating");
    const qs = sp.toString();
    const base = "/modules/production/supplier-leads";
    return qs ? `${base}?${qs}` : base;
  })();

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PageHeader title="Supplier Leads" />
          <InfoTooltip label="About supplier leads">
            Captured supplier business cards — potential new suppliers. Promote
            one to create a real supplier record.
          </InfoTooltip>
        </div>
        <Button asChild size="sm">
          <Link href="/modules/production/supplier-leads/capture">
            Capture supplier
          </Link>
        </Button>
      </div>

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
              <TableHead>Persona</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Captured</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-zinc-400">
                  No supplier leads yet.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/modules/production/supplier-leads/${l.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      {l.companyName ?? displayName(l)}
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
                  <TableCell className="text-xs text-zinc-600">
                    {l.supplierTypes?.length ? l.supplierTypes.join(", ") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={STATUS_BADGE[l.status] ?? "bg-zinc-100 text-zinc-600"}
                    >
                      {l.status}
                    </Badge>
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
