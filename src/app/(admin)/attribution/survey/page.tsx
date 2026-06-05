import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateRange } from "@/lib/date-range";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  commitAttribution,
  groupKey,
  groupLabel,
  type CommittedAttribution,
} from "@/lib/grapevine/attribution-merge";
import type {
  ChannelHint,
  PlatformHint,
} from "@/lib/grapevine/channel-mapping";

export const metadata: Metadata = {
  title: "Self-report Attribution | Fitwell Admin",
};

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

type Row = {
  orderId: string;
  totalPrice: number | null;
  platformHint: PlatformHint | null;
  channelHint: ChannelHint | null;
  channelDetail: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  surveyRaw: string | null;
};

export default async function SurveyAttributionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);

  // Pull every order in window + any survey response + best-effort UTM touch.
  // The UTM join uses the `converted=true` flag on utm_attribution; per
  // [[utm-linking-gap]] this misses most orders today, which is OK — the
  // commit function will fall back to platform-only or "unattributed".
  const rows = await db.execute<Row>(sql`
    select
      o.id as "orderId",
      o.total_price as "totalPrice",
      asr.platform_hint as "platformHint",
      asr.channel_hint as "channelHint",
      asr.channel_detail as "channelDetail",
      asr.raw_answer as "surveyRaw",
      utm.source as "utmSource",
      utm.medium as "utmMedium"
    from "order" o
    left join attribution_survey_response asr
      on asr.order_id = o.id and asr.provider = 'grapevine'
    left join utm_attribution utm
      on utm.fw_distinct_id = o.fw_distinct_id and utm.converted = true
    where o.processed_at >= ${from}
      and o.processed_at <= ${to}
      and o.cancelled_at is null
  `);

  const allRows = rows.rows as Row[];

  // Headline counts
  const totalOrders = allRows.length;
  const surveyedOrders = allRows.filter(
    (r) => r.platformHint || r.channelHint,
  ).length;
  const orderRevenue = allRows.reduce(
    (sum, r) => sum + (r.totalPrice ?? 0),
    0,
  );
  const surveyedRevenue = allRows
    .filter((r) => r.platformHint || r.channelHint)
    .reduce((sum, r) => sum + (r.totalPrice ?? 0), 0);

  // Per-order commit and group
  type GroupAgg = {
    label: string;
    source: CommittedAttribution["source"];
    orders: number;
    revenue: number;
  };
  const groups = new Map<string, GroupAgg>();
  const deltaRows: { surveyLabel: string; utmLabel: string; revenue: number }[] = [];

  for (const r of allRows) {
    const survey = r.platformHint || r.channelHint
      ? {
          platformHint: r.platformHint,
          channelHint: r.channelHint,
          channelDetail: r.channelDetail,
        }
      : null;
    const utm = r.utmSource ? { source: r.utmSource, medium: r.utmMedium } : null;
    const committed = commitAttribution(survey, utm);

    const key = groupKey(committed);
    const label = groupLabel(committed);
    const existing = groups.get(key);
    if (existing) {
      existing.orders += 1;
      existing.revenue += r.totalPrice ?? 0;
    } else {
      groups.set(key, {
        label,
        source: committed.source,
        orders: 1,
        revenue: r.totalPrice ?? 0,
      });
    }

    // Delta diagnostic: where survey reveals one platform/channel but UTM
    // points elsewhere on the same order.
    if (survey && utm) {
      const surveySide = committed.channel
        ? `channel:${committed.channel}`
        : `platform:${committed.platform}`;
      const utmSide = `utm:${utm.source}/${utm.medium ?? "-"}`;
      // Only surface when the survey "platform/channel" doesn't naturally
      // imply the UTM source — i.e. compound-path candidates.
      if (!surfacesObviously(committed, utm)) {
        deltaRows.push({
          surveyLabel: groupLabel(committed),
          utmLabel: `${utm.source}/${utm.medium ?? "—"}`,
          revenue: r.totalPrice ?? 0,
        });
      }
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) => b.orders - a.orders);

  const responseRate = totalOrders > 0
    ? Math.round((surveyedOrders / totalOrders) * 100)
    : 0;

  return (
    <div>
      <PageHeader title="Self-report Attribution" />
      <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
        Where do customers say they discovered Fitwell? Survey responses
        (Grapevine) are the primary signal; UTM is added when present (rare
        today — see UTM linking gap).
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
        Note: this page counts <em>orders with a linked survey response</em>,
        not raw survey responses. Grapevine&apos;s dashboard counts every
        response — some answered surveys can&apos;t resolve to an order in
        our database (e.g. orders from before our Shopify sync window) and
        won&apos;t appear here.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Survey coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">
              {surveyedOrders} / {totalOrders}
            </div>
            <div className="text-sm text-muted-foreground">
              {responseRate}% of orders in range have a survey response
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Surveyed revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{fmt(surveyedRevenue)}</div>
            <div className="text-sm text-muted-foreground">
              of {fmt(orderRevenue)} total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compound-path candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{deltaRows.length}</div>
            <div className="text-sm text-muted-foreground">
              orders where survey says one platform but UTM points elsewhere
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Channel mix (committed when possible)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Share of attributed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedGroups.map((g) => {
                const totalAttributedOrders = sortedGroups
                  .filter((x) => x.source !== "none")
                  .reduce((s, x) => s + x.orders, 0);
                const share = totalAttributedOrders > 0
                  ? Math.round((g.orders / totalAttributedOrders) * 100)
                  : 0;
                return (
                  <TableRow key={g.label + g.source}>
                    <TableCell>{g.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {SOURCE_LABEL[g.source]}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {g.orders}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(g.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {g.source === "none" ? "—" : `${share}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deltaRows.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Survey ↔ UTM delta (compound-path evidence)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Orders where the survey reveals one platform (e.g. Instagram) but
              the UTM points elsewhere (e.g. Google). These are the strongest
              evidence we have of compound paths like "saw it on Instagram,
              then branded-searched on Google." Sample is small until the UTM
              linking gap is closed.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Survey said</TableHead>
                  <TableHead>UTM said</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deltaRows.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{d.surveyLabel}</TableCell>
                    <TableCell className="font-mono text-sm">{d.utmLabel}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(d.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const SOURCE_LABEL: Record<CommittedAttribution["source"], string> = {
  survey_committed: "Survey (committed)",
  survey_platform: "Survey (platform-only)",
  utm_only: "UTM only",
  none: "No signal",
};

// True when survey platform and UTM source point at the same family — no
// compound-path signal. Used to filter the delta table to interesting rows.
function surfacesObviously(
  committed: CommittedAttribution,
  utm: { source: string | null; medium: string | null },
): boolean {
  const utmSrc = (utm.source ?? "").toLowerCase();
  const surveyPlatform = committed.platform;
  if (!surveyPlatform) return false;
  if (
    (surveyPlatform === "instagram" || surveyPlatform === "facebook") &&
    (utmSrc === "meta" || utmSrc === "facebook" || utmSrc === "instagram" || utmSrc === "ig")
  ) {
    return true;
  }
  if (surveyPlatform === "tiktok" && utmSrc === "tiktok") return true;
  if (surveyPlatform === "google_search" && utmSrc === "google") return true;
  return false;
}
