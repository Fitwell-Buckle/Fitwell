import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { count, desc, eq, inArray, or, sum } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  company,
  creatorPayout,
  creatorPost,
  creatorStatsDaily,
  customer,
  influencer,
  influencerOrder,
  lead,
  order,
  orderDiscountCode,
} from "@/lib/schema";
import { computeCommission } from "@/lib/creators/commission";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import { rightsStatus, type RightsTier } from "@/lib/creators/assets";
import { flagPossibleMismatch } from "@/lib/creators/edit";
import { AddPlatform } from "./add-platform";
import { AssetsPanel } from "./assets-panel";
import { ConvertCreator } from "./convert-creator";
import { CreatorActions } from "./creator-actions";
import { CreatorEditor } from "./creator-editor";
import { EmailsEditor } from "./emails-editor";
import { OutreachPanel } from "./outreach-panel";
import { PlatformEditor } from "./platform-editor";
import { StatsChart } from "./stats-chart";
import { VetButtons } from "./vet-buttons";

export const metadata: Metadata = {
  title: "Creator | Fitwell Admin",
};

const PLATFORM_NAMES: Record<string, string> = {
  ig: "Instagram",
  yt: "YouTube",
  tt: "TikTok",
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-zinc-800">{value}</div>
    </div>
  );
}

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  const record = await db.query.creator.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, id),
    with: {
      platforms: true,
      emails: true,
      discountCodes: true,
      assets: {
        orderBy: (a, { desc: descOp }) => descOp(a.receivedAt),
      },
      outreach: {
        with: {
          events: {
            orderBy: (e, { desc: descOp }) => descOp(e.occurredAt),
          },
        },
      },
    },
  });
  if (!record) notFound();

  const platformIds = record.platforms.map((p) => p.id);

  const possibleMismatch = flagPossibleMismatch(
    record.name,
    record.platforms.map((p) => ({ platform: p.platform, handle: p.handle })),
  );

  // Reclassification state: was this creator converted to a B2B lead/company
  // or a retail customer? (customerId alone = gifting recipient; only count it
  // as a customer reclassification once the creator is archived.)
  let convertedTo:
    | { kind: "B2B lead" | "B2B company" | "customer"; href: string; label: string }
    | null = null;
  if (record.leadId) {
    const [l] = await db
      .select({
        companyName: lead.companyName,
        firstName: lead.firstName,
        lastName: lead.lastName,
      })
      .from(lead)
      .where(eq(lead.id, record.leadId));
    convertedTo = {
      kind: "B2B lead",
      href: `/leads/${record.leadId}`,
      label:
        l?.companyName ||
        [l?.firstName, l?.lastName].filter(Boolean).join(" ") ||
        "lead",
    };
  } else if (record.companyId) {
    const [co] = await db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, record.companyId));
    convertedTo = {
      kind: "B2B company",
      href: `/customers/brands/${record.companyId}`,
      label: co?.name ?? "company",
    };
  } else if (record.customerId && record.status === "archived") {
    const [cu] = await db
      .select({
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
      })
      .from(customer)
      .where(eq(customer.id, record.customerId));
    convertedTo = {
      kind: "customer",
      href: `/customers/${record.customerId}`,
      label:
        [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") ||
        cu?.email ||
        "customer",
    };
  }

  const codeStrings = record.discountCodes.map((c) => c.code);

  const [latestStats, posts, giftOrders, redemptions, payoutAgg] =
    await Promise.all([
    platformIds.length
      ? db
          .select()
          .from(creatorStatsDaily)
          .where(inArray(creatorStatsDaily.creatorPlatformId, platformIds))
          .orderBy(desc(creatorStatsDaily.snapshotDate))
      : Promise.resolve([]),
    platformIds.length
      ? db
          .select()
          .from(creatorPost)
          .where(inArray(creatorPost.creatorPlatformId, platformIds))
          .orderBy(desc(creatorPost.postedAt))
      : Promise.resolve([]),
    db
      .select({
        id: influencerOrder.id,
        orderNumber: influencerOrder.orderNumber,
        status: influencerOrder.status,
        issuedDate: influencerOrder.issuedDate,
        contentDueDate: influencerOrder.contentDueDate,
        publishedAt: influencerOrder.publishedAt,
        affiliateLink: influencerOrder.affiliateLink,
        sentAt: influencerOrder.sentAt,
        shippedAt: influencerOrder.shippedAt,
        deliveredAt: influencerOrder.deliveredAt,
        trackingNumber: influencerOrder.trackingNumber,
        trackingUrl: influencerOrder.trackingUrl,
        expectedPlatform: influencerOrder.expectedPlatform,
      })
      .from(influencerOrder)
      .leftJoin(influencer, eq(influencerOrder.influencerId, influencer.id))
      .where(
        or(eq(influencerOrder.creatorId, id), eq(influencer.creatorId, id)),
      ),
    // Redemptions via order_discount_code join — no stored counters.
    codeStrings.length
      ? db
          .select({
            code: orderDiscountCode.code,
            orders: count(orderDiscountCode.id),
            // Net of refunds — same convention as the dashboard's Total sales.
            grossCents: sum(order.totalPrice),
            refundedCents: sum(order.totalRefunded),
          })
          .from(orderDiscountCode)
          .innerJoin(order, eq(orderDiscountCode.orderId, order.id))
          .where(inArray(orderDiscountCode.code, codeStrings))
          .groupBy(orderDiscountCode.code)
      : Promise.resolve([]),
    // Commission already paid out — owed = earned − this.
    db
      .select({ total: sum(creatorPayout.amountCents) })
      .from(creatorPayout)
      .where(eq(creatorPayout.creatorId, id)),
  ]);

  const redemptionByCode = new Map(redemptions.map((r) => [r.code, r]));

  // Affiliate commission: attributed net revenue across this creator's codes,
  // × the creator's rate, − payouts already recorded (commission.ts).
  const attributedNetRevenueCents = redemptions.reduce(
    (acc, r) => acc + (Number(r.grossCents ?? 0) - Number(r.refundedCents ?? 0)),
    0,
  );
  const commission = computeCommission({
    attributedNetRevenueCents,
    commissionRatePct: record.commissionRatePct,
    paidCents: Number(payoutAgg[0]?.total ?? 0),
  });

  // Newest snapshot per platform (latestStats is ordered desc).
  const latestByPlatform = new Map<string, (typeof latestStats)[number]>();
  const historyByPlatform = new Map<string, typeof latestStats>();
  for (const s of latestStats) {
    if (!latestByPlatform.has(s.creatorPlatformId)) {
      latestByPlatform.set(s.creatorPlatformId, s);
    }
    const hist = historyByPlatform.get(s.creatorPlatformId) ?? [];
    if (hist.length < 90) hist.push(s);
    historyByPlatform.set(s.creatorPlatformId, hist);
  }

  // Merged activity timeline: outreach events ∪ sample milestones ∪ posts.
  type TimelineItem = { at: Date; label: string; detail: string | null; kind: string };
  const timeline: TimelineItem[] = [];
  for (const thread of record.outreach) {
    for (const e of thread.events) {
      const arrow =
        e.direction === "out" ? "→" : e.direction === "in" ? "←" : "·";
      timeline.push({
        at: e.occurredAt,
        label: `${arrow} ${e.summary}`,
        detail: [thread.channel, e.createdBy].filter(Boolean).join(" · "),
        kind: e.direction === "status" ? "status" : "outreach",
      });
    }
  }
  for (const o of giftOrders) {
    if (o.issuedDate)
      timeline.push({ at: new Date(o.issuedDate), label: `Gifting order ${o.orderNumber} created`, detail: null, kind: "sample" });
    if (o.sentAt)
      timeline.push({ at: o.sentAt, label: `${o.orderNumber} sent to Shopify`, detail: null, kind: "sample" });
    if (o.shippedAt)
      timeline.push({ at: o.shippedAt, label: `${o.orderNumber} shipped`, detail: o.trackingNumber, kind: "sample" });
    if (o.deliveredAt)
      timeline.push({ at: o.deliveredAt, label: `${o.orderNumber} delivered`, detail: null, kind: "sample" });
    if (o.publishedAt)
      timeline.push({ at: new Date(o.publishedAt), label: `${o.orderNumber} content published`, detail: null, kind: "post" });
  }
  for (const post of posts) {
    timeline.push({
      at: post.postedAt ?? post.detectedAt ?? new Date(0),
      label: `Post ${post.mentionedUs ? "mentioning Fitwell " : ""}detected`,
      detail: post.postUrl,
      kind: "post",
    });
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={record.name} />
        <div className="flex items-center gap-2">
          <Badge
            className={
              record.vettingStatus === "approved"
                ? "bg-emerald-100 text-emerald-700"
                : record.vettingStatus === "rejected"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
            }
          >
            {record.vettingStatus === "unreviewed"
              ? "to vet"
              : record.vettingStatus}
          </Badge>
          <Badge>{record.status}</Badge>
          {record.crossPlatformFit != null && (
            <Badge className="bg-zinc-900 text-white">
              fit {record.crossPlatformFit.toFixed(1)}
            </Badge>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/creators">← All creators</Link>
          </Button>
        </div>
      </div>

      {possibleMismatch && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ <span className="font-medium">Possible bad merge.</span> These
          platforms may be different people/brands that the import linked
          together. Use <span className="font-medium">Edit / fix → Split off</span>{" "}
          on the wrong platform below to give it its own creator record.
        </div>
      )}

      {convertedTo && (
        <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Reclassified — this creator was converted to a{" "}
          <span className="font-medium">{convertedTo.kind}</span> and archived.{" "}
          <Link href={convertedTo.href} className="font-medium underline">
            Open {convertedTo.label} ↗
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <VetButtons
          creatorId={record.id}
          vettingStatus={record.vettingStatus}
        />
        <CreatorActions creatorId={record.id} />
      </div>

      {!convertedTo && (
        <div className="mb-4">
          <ConvertCreator creatorId={record.id} creatorName={record.name} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Platform cards */}
          {record.platforms.map((p) => {
            const stats = latestByPlatform.get(p.id);
            return (
              <DataTable key={p.id} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {PLATFORM_NAMES[p.platform] ?? p.platform}
                    </span>
                    {p.profileUrl ? (
                      <a
                        href={p.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-zinc-500 hover:text-zinc-900"
                      >
                        @{p.handle} ↗
                      </a>
                    ) : (
                      <Mono>@{p.handle}</Mono>
                    )}
                    {p.platform === record.primaryPlatform && (
                      <Badge>primary</Badge>
                    )}
                    {p.isVerified && <Badge>verified</Badge>}
                  </div>
                  <Muted>
                    {p.dataSource ?? "unknown source"}
                    {p.fitScorePartial ? " · partial fit" : ""}
                  </Muted>
                </div>
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                  <Stat
                    label="Followers"
                    value={stats?.followers?.toLocaleString() ?? "—"}
                  />
                  <Stat
                    label="ER%"
                    value={stats?.engagementRatePct?.toFixed(2) ?? "—"}
                  />
                  <Stat
                    label="Watch score"
                    value={
                      p.watchScore != null
                        ? `${p.watchScore.toFixed(0)} (${p.watchConfidence})`
                        : "—"
                    }
                  />
                  <Stat
                    label="Fit"
                    value={p.fitScore != null ? p.fitScore.toFixed(1) : "—"}
                  />
                  <Stat label="Last post" value={stats?.lastPostDate ?? "—"} />
                  <Stat
                    label="Refreshed"
                    value={
                      p.lastRefreshedAt
                        ? p.lastRefreshedAt.toISOString().slice(0, 10)
                        : "—"
                    }
                  />
                </div>
                {p.bio && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">
                    {p.bio}
                  </p>
                )}
                <div className="mt-3">
                  <PlatformEditor
                    creatorId={record.id}
                    creatorName={record.name}
                    platform={{
                      id: p.id,
                      platform: p.platform,
                      handle: p.handle,
                      profileUrl: p.profileUrl,
                      bio: p.bio,
                      isVerified: p.isVerified,
                    }}
                    isOnlyPlatform={record.platforms.length === 1}
                  />
                </div>
                <div className="mt-3">
                  <StatsChart
                    label={PLATFORM_NAMES[p.platform] ?? p.platform}
                    points={(historyByPlatform.get(p.id) ?? [])
                      .slice()
                      .reverse()
                      .map((s) => ({
                        date: s.snapshotDate,
                        followers: s.followers,
                        erPct: s.engagementRatePct,
                      }))}
                  />
                </div>
              </DataTable>
            );
          })}

          <AddPlatform creatorId={record.id} />

          {/* Posts */}
          <DataTable className="p-4">
            <div className="mb-2 font-medium">Posts</div>
            {posts.length === 0 ? (
              <Muted>
                None detected yet — Phase 5 polling (YT nightly / IG 6h) will
                populate this; manual entry coming with it.
              </Muted>
            ) : (
              <ul className="space-y-2">
                {posts.map((post) => (
                  <li key={post.id} className="flex items-center gap-2 text-sm">
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-700 underline-offset-2 hover:underline"
                    >
                      {post.postUrl}
                    </a>
                    {post.mentionedUs && <Badge>mentions us</Badge>}
                    <Muted>
                      {post.postedAt
                        ? post.postedAt.toISOString().slice(0, 10)
                        : "undated"}
                    </Muted>
                  </li>
                ))}
              </ul>
            )}
          </DataTable>

          {/* Gifting orders */}
          <DataTable className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Gifting orders</span>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/influencer-tracking/new">New gifting order</Link>
              </Button>
            </div>
            {giftOrders.length === 0 ? (
              <Muted>No samples sent yet.</Muted>
            ) : (
              <ul className="space-y-2">
                {giftOrders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Mono>{o.orderNumber}</Mono>
                    <Badge>{o.status}</Badge>
                    {/* Logistics ladder: sent → shipped → delivered */}
                    {o.deliveredAt ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        delivered {o.deliveredAt.toISOString().slice(0, 10)}
                      </Badge>
                    ) : o.shippedAt ? (
                      <Badge className="bg-sky-100 text-sky-700">
                        shipped {o.shippedAt.toISOString().slice(0, 10)}
                      </Badge>
                    ) : (
                      <Muted>not shipped</Muted>
                    )}
                    {o.trackingNumber &&
                      (o.trackingUrl ? (
                        <a
                          href={o.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-zinc-500 underline-offset-2 hover:underline"
                        >
                          {o.trackingNumber} ↗
                        </a>
                      ) : (
                        <Muted>{o.trackingNumber}</Muted>
                      ))}
                    {o.contentDueDate && (
                      <Muted>
                        post due {o.contentDueDate}
                        {o.expectedPlatform ? ` on ${o.expectedPlatform}` : ""}
                      </Muted>
                    )}
                    {o.publishedAt ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        published {o.publishedAt}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </DataTable>

          {/* Activity timeline */}
          <DataTable className="p-4">
            <div className="mb-2 font-medium">Activity</div>
            {timeline.length === 0 ? (
              <Muted>Nothing yet — outreach, samples, and posts land here.</Muted>
            ) : (
              <ul className="space-y-1.5">
                {timeline.map((item, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <Muted>{item.at.toISOString().slice(0, 10)}</Muted>
                    <span
                      className={
                        item.kind === "status" ? "text-zinc-400" : "text-zinc-700"
                      }
                    >
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="truncate text-xs text-zinc-400">
                        {item.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DataTable>
        </div>

        <div className="space-y-4">
          {/* Outreach threads */}
          <DataTable className="p-4">
            <OutreachPanel
              creatorId={record.id}
              threads={record.outreach.map((t) => ({
                id: t.id,
                channel: t.channel,
                status: t.status,
                terms: t.terms,
                nextFollowupAt: t.nextFollowupAt
                  ? t.nextFollowupAt.toISOString()
                  : null,
              }))}
            />
          </DataTable>

          {/* Contact */}
          <DataTable className="p-4">
            <EmailsEditor
              creatorId={record.id}
              emails={record.emails.map((e) => ({
                id: e.id,
                email: e.email,
                kind: e.kind,
                portalAccess: e.portalAccess,
              }))}
            />
          </DataTable>

          {/* Commission */}
          <DataTable className="p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              Commission
              {record.offerTier && (
                <Badge className="capitalize">{record.offerTier}</Badge>
              )}
              {commission.ratePct > 0 && <Badge>{commission.ratePct}%</Badge>}
            </div>
            {commission.ratePct === 0 ? (
              <Muted>
                No commission rate set — assign an offer tier / rate to start
                tracking earnings.
              </Muted>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Stat
                  label="Attributed revenue"
                  value={`$${(commission.attributedNetRevenueCents / 100).toLocaleString()}`}
                />
                <Stat
                  label="Earned"
                  value={`$${(commission.earnedCents / 100).toLocaleString()}`}
                />
                <Stat
                  label="Paid"
                  value={`$${(commission.paidCents / 100).toLocaleString()}`}
                />
                <Stat
                  label="Owed"
                  value={
                    <span className="flex items-center gap-1.5">
                      ${(commission.owedCents / 100).toLocaleString()}
                      {commission.payable && <Badge>ready to pay</Badge>}
                    </span>
                  }
                />
              </div>
            )}
          </DataTable>

          {/* Discount codes */}
          <DataTable className="p-4">
            <div className="mb-2 font-medium">Discount codes</div>
            {record.discountCodes.length === 0 ? (
              <Muted>None issued yet.</Muted>
            ) : (
              <ul className="space-y-1.5">
                {record.discountCodes.map((dc) => {
                  const r = redemptionByCode.get(dc.code);
                  const revenue = r
                    ? Number(r.grossCents ?? 0) - Number(r.refundedCents ?? 0)
                    : 0;
                  return (
                    <li key={dc.id} className="flex items-center gap-2 text-sm">
                      <Mono>{dc.codeRaw}</Mono>
                      {dc.percentOff != null && (
                        <Badge>{dc.percentOff}% off</Badge>
                      )}
                      <Muted>
                        {r
                          ? `${r.orders} orders · $${(revenue / 100).toLocaleString()}`
                          : "no redemptions yet"}
                      </Muted>
                    </li>
                  );
                })}
              </ul>
            )}
          </DataTable>

          {/* Assets + rights */}
          <DataTable className="p-4">
            <AssetsPanel
              creatorId={record.id}
              giftOrders={giftOrders.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
              }))}
              assets={record.assets.map((a) => ({
                id: a.id,
                storageUrl: a.storageUrl,
                assetType: a.assetType,
                rightsTier: a.rightsTier,
                rightsExpiresAt: a.rightsExpiresAt
                  ? a.rightsExpiresAt.toISOString().slice(0, 10)
                  : null,
                rightsStatus: rightsStatus(
                  a.rightsTier as RightsTier,
                  a.rightsExpiresAt,
                ),
                usageNotes: a.usageNotes,
                receivedAt: a.receivedAt.toISOString().slice(0, 10),
              }))}
            />
          </DataTable>

          {/* Edit: name, primary, status, boost, country, notes */}
          <DataTable className="p-4">
            <CreatorEditor
              creatorId={record.id}
              name={record.name}
              primaryPlatform={record.primaryPlatform}
              status={record.status}
              scoreBoost={record.scoreBoost}
              notes={record.notes}
              country={record.country}
              phone={record.phone}
            />
          </DataTable>
        </div>
      </div>
    </div>
  );
}
