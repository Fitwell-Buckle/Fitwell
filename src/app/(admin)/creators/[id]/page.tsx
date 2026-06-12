import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { count, desc, eq, inArray, or, sum } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  creatorPost,
  creatorStatsDaily,
  influencer,
  influencerOrder,
  order,
  orderDiscountCode,
} from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import { CreatorActions } from "./creator-actions";
import { CreatorEditor } from "./creator-editor";
import { OutreachPanel } from "./outreach-panel";

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

  const codeStrings = record.discountCodes.map((c) => c.code);

  const [latestStats, posts, giftOrders, redemptions] = await Promise.all([
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
  ]);

  const redemptionByCode = new Map(redemptions.map((r) => [r.code, r]));

  // Newest snapshot per platform.
  const latestByPlatform = new Map<string, (typeof latestStats)[number]>();
  for (const s of latestStats) {
    if (!latestByPlatform.has(s.creatorPlatformId)) {
      latestByPlatform.set(s.creatorPlatformId, s);
    }
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

      <div className="mb-4">
        <CreatorActions creatorId={record.id} />
      </div>

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
              </DataTable>
            );
          })}

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
            <div className="mb-2 font-medium">Contact</div>
            {record.emails.length === 0 ? (
              <Muted>No emails on file.</Muted>
            ) : (
              <ul className="space-y-1.5">
                {record.emails.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <a
                      href={`mailto:${e.email}`}
                      className="font-mono text-zinc-700 underline-offset-2 hover:underline"
                    >
                      {e.email}
                    </a>
                    {e.kind && <Badge>{e.kind}</Badge>}
                    {e.portalAccess && <Badge>portal</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </DataTable>

          {/* Discount codes */}
          <DataTable className="p-4">
            <div className="mb-2 font-medium">Discount codes</div>
            {record.discountCodes.length === 0 ? (
              <Muted>
                None issued. Code generation ships with Phase 4 (needs the
                write_discounts scope).
              </Muted>
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

          {/* Status + notes */}
          <DataTable className="p-4">
            <CreatorEditor
              creatorId={record.id}
              status={record.status}
              notes={record.notes}
              country={record.country}
            />
          </DataTable>
        </div>
      </div>
    </div>
  );
}
