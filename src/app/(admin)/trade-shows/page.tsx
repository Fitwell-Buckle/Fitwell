import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { listTradeShows, listVendors } from "@/lib/tradeshows/service";
import { PageHeader } from "@/components/ui/page-header";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Trade Shows | Fitwell Admin",
};

function fmtRange(starts: string | null, ends: string | null): string | null {
  if (!starts) return null;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const s = new Date(starts).toLocaleDateString("en-US", opts);
  if (!ends || ends === starts) return s;
  const e = new Date(ends).toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
}

export default async function TradeShowsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const shows = await listTradeShows();
  // Per-show progress. Show count is tiny (one or two active), so a query each
  // is fine.
  const withStats = await Promise.all(
    shows.map(async (show) => {
      const vendors = await listVendors(show.id);
      const visited = vendors.filter((v) => v.visited).length;
      return { show, total: vendors.length, visited };
    }),
  );

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <PageHeader title="Trade Shows" />
        <InfoTooltip label="About trade shows">
          Booth-walking worklists for the shows you attend. Mark vendors
          visited, scan cards, leave voice notes, and promote the promising
          ones into your Supplier Leads or Customer Leads pipelines.
        </InfoTooltip>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {withStats.length === 0 ? (
          <p className="text-sm text-zinc-400">No trade shows yet.</p>
        ) : (
          withStats.map(({ show, total, visited }) => {
            const range = fmtRange(show.startsOn, show.endsOn);
            const pct = total ? Math.round((visited / total) * 100) : 0;
            return (
              <Link key={show.id} href={`/trade-shows/${show.id}`}>
                <Card className="p-5 transition-colors hover:border-zinc-300">
                  <h3 className="font-semibold text-zinc-900">{show.name}</h3>
                  <div className="mt-2 space-y-1 text-sm text-zinc-500">
                    {(show.location || show.city) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {[show.location, show.city, show.country]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                    {range && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {range}
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>
                        {visited} / {total} visited
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
