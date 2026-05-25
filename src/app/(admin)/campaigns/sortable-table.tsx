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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mono } from "@/components/ui/data-table";
import { ArrowUpDown } from "lucide-react";

type GoogleReachExtras = {
  kind: "google";
  budgetLostIs: number | null;
  rankLostIs: number | null;
  absoluteTopIs: number | null;
};

type MetaReachExtras = {
  kind: "meta";
  reach: number;
  audienceLower: number | null;
  audienceUpper: number | null;
  frequency: number | null;
  qualityRanking: string | null;
  engagementRanking: string | null;
  conversionRanking: string | null;
};

type ReachExtras = GoogleReachExtras | MetaReachExtras;

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
  reachPct: number | null;
  reachExtras: ReachExtras;
  classificationBadge: React.ReactNode;
  platformBadge: React.ReactNode;
  roasBadge: React.ReactNode;
}

type SortKey =
  | "impressions"
  | "clicks"
  | "ctr"
  | "cost"
  | "cpc"
  | "conversions"
  | "revenue"
  | "roas"
  | "reachPct";

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

// Adaptive precision so very-small reach percentages (broad Meta audiences)
// don't collapse to "0%". Adds decimals as needed; sub-0.1% becomes "<0.1%".
function pct0(value: number) {
  if (value === 0) return "0%";
  if (value >= 0.1) return `${Math.round(value * 100)}%`;
  if (value >= 0.01) return `${(value * 100).toFixed(1)}%`;
  if (value >= 0.001) return `${(value * 100).toFixed(2)}%`;
  return "<0.1%";
}

function compactInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

const RANKING_LABEL: Record<string, { label: string; tone: string }> = {
  ABOVE_AVERAGE: { label: "Above avg", tone: "text-emerald-600" },
  AVERAGE: { label: "Average", tone: "text-zinc-600" },
  BELOW_AVERAGE_10: { label: "Bottom 35%", tone: "text-amber-600" },
  BELOW_AVERAGE_20: { label: "Bottom 20%", tone: "text-orange-600" },
  BELOW_AVERAGE_35: { label: "Bottom 10%", tone: "text-red-600" },
  UNKNOWN: { label: "Unknown", tone: "text-zinc-400" },
};

function rankingLabel(value: string | null) {
  if (!value) return { label: "—", tone: "text-zinc-400" };
  return RANKING_LABEL[value.toUpperCase()] ?? { label: value, tone: "text-zinc-600" };
}

function reachTone(value: number | null): string {
  if (value == null) return "text-zinc-400";
  if (value >= 0.75) return "text-emerald-600";
  if (value >= 0.4) return "text-zinc-700";
  return "text-amber-600";
}

function ReachPctCell({
  reachPct,
  extras,
}: {
  reachPct: number | null;
  extras: ReachExtras;
}) {
  const value =
    reachPct == null ? <span className="text-zinc-300">&mdash;</span> : (
      <span className={`tabular-nums ${reachTone(reachPct)}`}>
        {pct0(reachPct)}
      </span>
    );

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-zinc-300 underline-offset-2">
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" className="w-64">
        {extras.kind === "google" ? (
          <GoogleReachTooltip reachPct={reachPct} extras={extras} />
        ) : (
          <MetaReachTooltip reachPct={reachPct} extras={extras} />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function GoogleReachTooltip({
  reachPct,
  extras,
}: {
  reachPct: number | null;
  extras: GoogleReachExtras;
}) {
  return (
    <div className="space-y-2">
      <div className="font-semibold text-zinc-900">Search impression share</div>
      <div className="text-zinc-500">
        % of eligible auctions you appeared in.
      </div>
      <div className="space-y-1 border-t border-zinc-100 pt-2">
        <Row
          label="Reach"
          value={reachPct == null ? "—" : pct0(reachPct)}
          bold
        />
        <Row
          label="Lost to budget"
          value={extras.budgetLostIs == null ? "—" : pct0(extras.budgetLostIs)}
          hint="raise budget to capture"
        />
        <Row
          label="Lost to ad rank"
          value={extras.rankLostIs == null ? "—" : pct0(extras.rankLostIs)}
          hint="improve bid or Quality Score"
        />
        <Row
          label="Absolute top"
          value={
            extras.absoluteTopIs == null ? "—" : pct0(extras.absoluteTopIs)
          }
          hint="when shown, % at #1"
        />
      </div>
    </div>
  );
}

function MetaReachTooltip({
  reachPct,
  extras,
}: {
  reachPct: number | null;
  extras: MetaReachExtras;
}) {
  const quality = rankingLabel(extras.qualityRanking);
  const engagement = rankingLabel(extras.engagementRanking);
  const conversion = rankingLabel(extras.conversionRanking);
  return (
    <div className="space-y-2">
      <div className="font-semibold text-zinc-900">Audience reach</div>
      <div className="text-zinc-500">
        Unique people reached vs. estimated addressable audience.
      </div>
      <div className="space-y-1 border-t border-zinc-100 pt-2">
        <Row
          label="Reach"
          value={
            reachPct == null
              ? "—"
              : `${pct0(reachPct)} of ~${
                  extras.audienceLower
                    ? compactInt(extras.audienceLower)
                    : "—"
                }`
          }
          bold
        />
        <Row
          label="Reached"
          value={compactInt(extras.reach)}
          hint={
            extras.frequency != null
              ? `${extras.frequency.toFixed(1)}× frequency`
              : undefined
          }
        />
        <div className="border-t border-zinc-100 pt-1.5" />
        <Row
          label="Quality"
          value={<span className={quality.tone}>{quality.label}</span>}
        />
        <Row
          label="Engagement"
          value={<span className={engagement.tone}>{engagement.label}</span>}
        />
        <Row
          label="Conversion"
          value={<span className={conversion.tone}>{conversion.label}</span>}
        />
      </div>
      <div className="border-t border-zinc-100 pt-2 text-[10px] leading-tight text-zinc-400">
        Reach is summed across days; same person on multiple days counts more
        than once. Treat % as directional.
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-zinc-600 ${bold ? "font-medium" : ""}`}>
        {label}
      </span>
      <span className={`tabular-nums ${bold ? "font-medium text-zinc-900" : "text-zinc-700"}`}>
        {value}
        {hint && (
          <span className="ml-2 text-[10px] text-zinc-400">{hint}</span>
        )}
      </span>
    </div>
  );
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
    const impressions =
      channel === "all"
        ? totals.impressions
        : filtered.reduce((s, r) => s + r.impressions, 0);
    const clicks =
      channel === "all"
        ? totals.clicks
        : filtered.reduce((s, r) => s + r.clicks, 0);
    const cost =
      channel === "all" ? totals.cost : filtered.reduce((s, r) => s + r.cost, 0);
    const conversions =
      channel === "all"
        ? totals.conversions
        : filtered.reduce((s, r) => s + r.conversions, 0);
    const revenue =
      channel === "all"
        ? totals.revenue
        : filtered.reduce((s, r) => s + r.revenue, 0);
    const roas = channel === "all" ? totals.roas : cost > 0 ? revenue / cost : 0;
    // Impression-weighted Reach % across the filtered set. Cross-platform
    // mixes apples and oranges (Google's auction share vs. Meta's audience
    // saturation), so we only compute when filtered to a single channel family.
    const withReach = filtered.filter(
      (r) => r.reachPct != null && r.impressions > 0,
    );
    const reachWeight = withReach.reduce((s, r) => s + r.impressions, 0);
    const reachPct =
      reachWeight > 0 && channel !== "all"
        ? withReach.reduce((s, r) => s + (r.reachPct ?? 0) * r.impressions, 0) /
          reachWeight
        : null;
    return {
      impressions,
      clicks,
      cost,
      conversions,
      revenue,
      roas,
      reachPct,
      roasBadge: totals.roasBadge,
    };
  }, [channel, filtered, totals]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "roas") {
        const aBlank = a.clicks < 100 || a.cost === 0;
        const bBlank = b.clicks < 100 || b.cost === 0;
        if (aBlank !== bBlank) return aBlank ? 1 : -1;
      }
      if (sortKey === "reachPct") {
        // Push nulls to the bottom regardless of direction
        const av = a.reachPct;
        const bv = b.reachPct;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortDir === "desc" ? bv - av : av - bv;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
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
    <TooltipProvider>
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
            <SortHead k="reachPct">Reach %</SortHead>
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
                <ReachPctCell
                  reachPct={row.reachPct}
                  extras={row.reachExtras}
                />
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
              {filteredTotals.reachPct == null ? (
                <span
                  className="text-zinc-300"
                  title="Reach % combines Google's auction-share with Meta's audience-saturation — not meaningful to mix across channels. Filter to a single channel to see a weighted total."
                >
                  &mdash;
                </span>
              ) : (
                <span
                  className={`tabular-nums ${reachTone(filteredTotals.reachPct)}`}
                >
                  {pct0(filteredTotals.reachPct)}
                </span>
              )}
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
    </TooltipProvider>
  );
}
