"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from "@/components/ui/table";
import { Mono } from "@/components/ui/data-table";
import { ArrowUpDown } from "lucide-react";

interface AdRow {
  platform: string;
  campaignName: string;
  adsetName: string | null;
  adName: string | null;
  landingUrl: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  conversions: number;
  revenue: number;
  roas: number;
  classificationBadge: React.ReactNode;
  platformBadge: React.ReactNode;
  roasBadge: React.ReactNode;
}

type SortKey = "impressions" | "clicks" | "ctr" | "cost" | "cpc" | "conversions" | "revenue" | "roas";

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function SortableCampaignTable({
  rows,
  totals,
}: {
  rows: AdRow[];
  totals: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
    roas: number;
    roasBadge: React.ReactNode;
  };
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHead({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <TableHead
        className={`cursor-pointer select-none text-right hover:text-zinc-700 ${active ? "text-zinc-700" : ""} ${className ?? ""}`}
        onClick={() => toggleSort(k)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
        </span>
      </TableHead>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 min-w-[320px] bg-white">
            Path
          </TableHead>
          <SortHead k="impressions">Impressions</SortHead>
          <SortHead k="clicks">Clicks</SortHead>
          <SortHead k="ctr">CTR</SortHead>
          <SortHead k="cost">Spend</SortHead>
          <SortHead k="cpc">CPC</SortHead>
          <SortHead k="conversions">Conversions</SortHead>
          <SortHead k="revenue">Revenue</SortHead>
          <SortHead k="roas">ROAS</SortHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="sticky left-0 bg-inherit">
              <div className="mb-1 flex items-center gap-1.5">
                {row.platformBadge}
                {row.classificationBadge}
              </div>
              <div className="text-sm font-medium leading-tight text-zinc-900">
                {row.campaignName}
              </div>
              {row.adsetName && (
                <div className="text-xs leading-tight text-zinc-500">
                  {row.adsetName}
                </div>
              )}
              {row.adName && (
                <div className="text-xs leading-tight text-zinc-500">
                  {row.adName}
                </div>
              )}
              {row.landingUrl && (
                <div className="font-mono text-[11px] leading-tight text-zinc-500">
                  {row.landingUrl}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Mono>{row.impressions.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{row.clicks.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-zinc-500">{pct(row.ctr)}</span>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{fmt(row.cost)}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-zinc-500">{fmt(row.cpc)}</span>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{row.conversions.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{fmt(row.revenue)}</Mono>
            </TableCell>
            <TableCell className="text-right">{row.roasBadge}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="sticky left-0 bg-zinc-50/50 font-semibold text-zinc-900">
            Total
          </TableCell>
          <TableCell className="text-right">
            <Mono>{totals.impressions.toLocaleString()}</Mono>
          </TableCell>
          <TableCell className="text-right">
            <Mono>{totals.clicks.toLocaleString()}</Mono>
          </TableCell>
          <TableCell className="text-right">
            <span className="text-zinc-500">
              {pct(totals.impressions > 0 ? totals.clicks / totals.impressions : 0)}
            </span>
          </TableCell>
          <TableCell className="text-right">
            <Mono>{fmt(totals.cost)}</Mono>
          </TableCell>
          <TableCell className="text-right">
            <span className="text-zinc-500">
              {fmt(totals.clicks > 0 ? totals.cost / totals.clicks : 0)}
            </span>
          </TableCell>
          <TableCell className="text-right">
            <Mono>{totals.conversions.toLocaleString()}</Mono>
          </TableCell>
          <TableCell className="text-right">
            <Mono>{fmt(totals.revenue)}</Mono>
          </TableCell>
          <TableCell className="text-right">{totals.roasBadge}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
