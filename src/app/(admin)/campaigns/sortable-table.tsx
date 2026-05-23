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

interface ChannelGroup {
  label: string;
  platforms: string[];
  parent?: string;
}

const CHANNEL_GROUPS: Record<string, ChannelGroup> = {
  all: { label: "All Channels", platforms: [] },
  meta: { label: "All Meta", platforms: ["facebook", "instagram", "threads", "audience_network", "messenger", "meta"] },
  facebook: { label: "Facebook", platforms: ["facebook"], parent: "meta" },
  instagram: { label: "Instagram", platforms: ["instagram"], parent: "meta" },
  google: { label: "All Google", platforms: ["google", "search", "display", "youtube", "shopping", "mixed"] },
  search: { label: "Google Search", platforms: ["search"], parent: "google" },
  display: { label: "Google Display", platforms: ["display"], parent: "google" },
  youtube: { label: "YouTube", platforms: ["youtube"], parent: "google" },
};

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
  const [channel, setChannel] = useState("all");

  const availableChannels = useMemo(() => {
    const platforms = new Set(rows.map((r) => r.platform.toLowerCase()));
    return Object.entries(CHANNEL_GROUPS).filter(([key, group]) => {
      if (key === "all") return true;
      return group.platforms.some((p) => platforms.has(p));
    });
  }, [rows]);

  const filtered = useMemo(() => {
    if (channel === "all") return rows;
    const group = CHANNEL_GROUPS[channel];
    if (!group) return rows;
    return rows.filter((r) => group.platforms.includes(r.platform.toLowerCase()));
  }, [rows, channel]);

  const filteredTotals = useMemo(() => {
    if (channel === "all") return totals;
    const impressions = filtered.reduce((s, r) => s + r.impressions, 0);
    const clicks = filtered.reduce((s, r) => s + r.clicks, 0);
    const cost = filtered.reduce((s, r) => s + r.cost, 0);
    const conversions = filtered.reduce((s, r) => s + r.conversions, 0);
    const revenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const roas = cost > 0 ? revenue / cost : 0;
    return { impressions, clicks, cost, conversions, revenue, roas, roasBadge: totals.roasBadge };
  }, [channel, filtered, totals]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "roas") {
        const aBlank = a.clicks < 100 || a.cost === 0;
        const bBlank = b.clicks < 100 || b.cost === 0;
        if (aBlank !== bBlank) return aBlank ? 1 : -1;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

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
    <div>
      <div className="mb-4">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
        >
          {availableChannels.map(([key, group]) => (
            <option key={key} value={key}>
              {group.parent ? `    ${group.label}` : group.label}
            </option>
          ))}
        </select>
      </div>
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
              <Mono>{filteredTotals.impressions.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{filteredTotals.clicks.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-zinc-500">
                {pct(filteredTotals.impressions > 0 ? filteredTotals.clicks / filteredTotals.impressions : 0)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{fmt(filteredTotals.cost)}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-zinc-500">
                {fmt(filteredTotals.clicks > 0 ? filteredTotals.cost / filteredTotals.clicks : 0)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{filteredTotals.conversions.toLocaleString()}</Mono>
            </TableCell>
            <TableCell className="text-right">
              <Mono>{fmt(filteredTotals.revenue)}</Mono>
            </TableCell>
            <TableCell className="text-right">
              {channel === "all"
                ? filteredTotals.roasBadge
                : filteredTotals.cost > 0
                  ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums bg-zinc-200 text-zinc-700">{filteredTotals.roas.toFixed(2)}x</span>
                  : <span className="text-zinc-300">&mdash;</span>}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
