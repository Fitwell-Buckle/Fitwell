import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, isNotNull, max, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  creatorOutreach,
  creatorPlatform,
  creatorPost,
  creatorStatsDaily,
  influencerOrder,
} from "@/lib/schema";
import {
  PIPELINE_STAGES,
  pipelineStage,
  STAGE_LABELS,
} from "@/lib/creators/lifecycle";
import {
  applyCreatorListParams,
  CREATOR_STATUSES,
  effectiveFit,
  type CreatorListRow,
} from "@/lib/creators/list";
import { getActiveMarkets, isOutOfMarket } from "@/lib/creators/markets";
import { AddCreator } from "./add-creator";
import { VetActions } from "./vet-actions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/ui/clickable-row";

export const metadata: Metadata = {
  title: "Creators | Fitwell Admin",
};

const PLATFORM_LABELS: Record<string, string> = {
  ig: "IG",
  yt: "YT",
  tt: "TT",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
  none: "bg-zinc-50 text-zinc-400",
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;

  // Latest stats snapshot per platform record.
  const latestDates = db
    .select({
      pid: creatorStatsDaily.creatorPlatformId,
      d: max(creatorStatsDaily.snapshotDate).as("d"),
    })
    .from(creatorStatsDaily)
    .groupBy(creatorStatsDaily.creatorPlatformId)
    .as("latest");

  const [creators, latestStats, activeMarkets, outreachIds, giftAgg, postIds] =
    await Promise.all([
    db.query.creator.findMany({
      with: {
        platforms: {
          columns: {
            id: true,
            platform: true,
            handle: true,
            fitScore: true,
            watchConfidence: true,
          },
        },
        emails: { columns: { id: true } },
      },
    }),
    db
      .select({
        creatorPlatformId: creatorStatsDaily.creatorPlatformId,
        followers: creatorStatsDaily.followers,
        engagementRatePct: creatorStatsDaily.engagementRatePct,
        lastPostDate: creatorStatsDaily.lastPostDate,
      })
      .from(creatorStatsDaily)
      .innerJoin(
        latestDates,
        and(
          eq(creatorStatsDaily.creatorPlatformId, latestDates.pid),
          eq(creatorStatsDaily.snapshotDate, latestDates.d),
        ),
      ),
    getActiveMarkets(),
    // Lifecycle facts (derived stages — lifecycle.ts):
    db
      .selectDistinct({ creatorId: creatorOutreach.creatorId })
      .from(creatorOutreach),
    db
      .select({
        creatorId: influencerOrder.creatorId,
        sentAt: max(sql`coalesce(${influencerOrder.shippedAt}, ${influencerOrder.sentAt})`).as("sent_at"),
        deliveredAt: max(influencerOrder.deliveredAt),
      })
      .from(influencerOrder)
      .where(isNotNull(influencerOrder.creatorId))
      .groupBy(influencerOrder.creatorId),
    db
      .selectDistinct({ creatorId: creatorPlatform.creatorId })
      .from(creatorPost)
      .innerJoin(
        creatorPlatform,
        eq(creatorPost.creatorPlatformId, creatorPlatform.id),
      )
      .where(
        or(isNotNull(creatorPost.giftOrderId), eq(creatorPost.mentionedUs, true)),
      ),
  ]);

  const outreachSet = new Set(outreachIds.map((o) => o.creatorId));
  const postSet = new Set(postIds.map((p) => p.creatorId));
  const giftByCreator = new Map(
    giftAgg.map((g) => [g.creatorId, g]),
  );

  const statsByPlatformId = new Map(
    latestStats.map((s) => [s.creatorPlatformId, s]),
  );

  const rows: CreatorListRow[] = creators.map((c) => {
    const stats = c.platforms.map((p) => statsByPlatformId.get(p.id));
    const followersTotal = stats.reduce((sum, s) => sum + (s?.followers ?? 0), 0);
    const ers = stats
      .map((s) => s?.engagementRatePct)
      .filter((v): v is number => v != null);
    const lastPosts = stats
      .map((s) => s?.lastPostDate)
      .filter((v): v is string => v != null)
      .sort();
    const gift = giftByCreator.get(c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      vettingStatus: c.vettingStatus,
      scoreBoost: c.scoreBoost,
      country: c.country,
      outOfMarket: isOutOfMarket(c.country, activeMarkets),
      stage: pipelineStage({
        status: c.status,
        hasOutreach: outreachSet.has(c.id),
        sampleSentAt: (gift?.sentAt as Date | null) ?? null,
        sampleDeliveredAt: gift?.deliveredAt ?? null,
        hasPost: postSet.has(c.id),
      }),
      primaryPlatform: c.primaryPlatform,
      crossPlatformFit: c.crossPlatformFit,
      platforms: c.platforms.map((p) => ({
        platform: p.platform,
        handle: p.handle,
        fitScore: p.fitScore,
        watchConfidence: p.watchConfidence,
      })),
      followersTotal,
      bestErPct: ers.length ? Math.max(...ers) : null,
      lastPostDate: lastPosts.length ? lastPosts[lastPosts.length - 1] : null,
      hasEmail: c.emails.length > 0,
    };
  });

  const visible = applyCreatorListParams(rows, params);

  // Pill-link helper preserving other params.
  const pillHref = (key: string, value: string | null) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== key) next.set(k, v);
    }
    if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/creators?${qs}` : "/creators";
  };

  const pill = (label: string, key: string, value: string | null, active: boolean) => (
    <Link
      key={`${key}:${value ?? "all"}`}
      href={pillHref(key, value)}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Creators" />
        <div className="flex items-center gap-2">
          <Muted>
            {visible.length} of {rows.length}
          </Muted>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/influencer-tracking">Gifting orders</Link>
          </Button>
          <AddCreator />
        </div>
      </div>

      {/* Pipeline bar — derived stages, click to filter */}
      <div className="mb-3 flex items-stretch gap-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const count = rows.filter(
            (r) =>
              r.stage === stage &&
              !r.outOfMarket &&
              r.vettingStatus !== "rejected",
          ).length;
          const active = params.stage === stage;
          return (
            <Link
              key={stage}
              href={pillHref("stage", active ? null : stage)}
              className={`flex flex-1 flex-col items-center rounded-lg border px-2 py-2 transition-colors ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              }`}
            >
              <span className="font-mono text-lg font-semibold">{count}</span>
              <span
                className={`text-[11px] font-medium ${active ? "text-zinc-300" : "text-zinc-500"}`}
              >
                {i + 1}. {STAGE_LABELS[stage]}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pill("All platforms", "platform", null, !params.platform)}
        {pill("IG", "platform", "ig", params.platform === "ig")}
        {pill("YT", "platform", "yt", params.platform === "yt")}
        {pill("Multi", "platform", "multi", params.platform === "multi")}
        <span className="mx-1 h-4 w-px bg-zinc-200" />
        {pill("To vet", "vetting", "unreviewed", params.vetting === "unreviewed")}
        {pill("Approved", "vetting", "approved", params.vetting === "approved")}
        {pill("Rejected", "vetting", "rejected", params.vetting === "rejected")}
        {pill("Out of market", "market", "out", params.market === "out")}
        <span className="mx-1 h-4 w-px bg-zinc-200" />
        {pill("Active pipeline", "status", null, !params.status && params.all !== "1")}
        {CREATOR_STATUSES.map((s) =>
          pill(s, "status", s, params.status === s),
        )}
        {pill("Everything", "all", "1", params.all === "1" && !params.status)}
        <form action="/creators" className="ml-auto">
          {Object.entries(params)
            .filter(([k, v]) => v && k !== "q")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name or handle…"
            className="w-56 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
          />
        </form>
      </div>

      <DataTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Link href={pillHref("sort", "name")}>Name</Link>
              </TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead className="text-right">
                <Link href={pillHref("sort", "followers")}>Reach</Link>
              </TableHead>
              <TableHead className="text-right">
                <Link href={pillHref("sort", "er")}>ER%</Link>
              </TableHead>
              <TableHead>Watch</TableHead>
              <TableHead className="text-right">
                <Link href={pillHref("sort", "fit")}>Fit</Link>
              </TableHead>
              <TableHead>
                <Link href={pillHref("sort", "lastpost")}>Last post</Link>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center">
                  <Muted>
                    No creators match. Imported yet? Run
                    scripts/import-creators-csv.ts.
                  </Muted>
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => {
              const bestConfidence =
                r.platforms
                  .map((p) => p.watchConfidence)
                  .find((c) => c === "high") ??
                r.platforms
                  .map((p) => p.watchConfidence)
                  .find((c) => c === "medium") ??
                r.platforms[0]?.watchConfidence ??
                "none";
              return (
                <ClickableRow key={r.id} href={`/creators/${r.id}`}>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.country && (
                      <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
                        {r.country}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.platforms.map((p) => (
                        <Badge
                          key={p.platform}
                          className={
                            p.platform === r.primaryPlatform
                              ? "bg-zinc-900 text-white"
                              : undefined
                          }
                        >
                          {PLATFORM_LABELS[p.platform] ?? p.platform}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{formatFollowers(r.followersTotal)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{r.bestErPct != null ? r.bestErPct.toFixed(1) : "—"}</Mono>
                  </TableCell>
                  <TableCell>
                    <Badge className={CONFIDENCE_STYLES[bestConfidence] ?? ""}>
                      {bestConfidence}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{effectiveFit(r).toFixed(1)}</Mono>
                  </TableCell>
                  <TableCell>
                    <Muted>{r.lastPostDate ?? "—"}</Muted>
                  </TableCell>
                  <TableCell>
                    <Badge>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.hasEmail ? "✓" : <Muted>—</Muted>}</TableCell>
                  <TableCell>
                    <VetActions
                      creatorId={r.id}
                      vettingStatus={r.vettingStatus}
                      scoreBoost={r.scoreBoost}
                    />
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
