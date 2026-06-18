import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencer } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { NewOrderModes } from "./new-order-modes";

export const metadata: Metadata = {
  title: "New gifting order | Fitwell Admin",
};

export default async function NewInfluencerOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ influencerId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { influencerId } = await searchParams;

  const influencers = await db.query.influencer.findMany({
    columns: { id: true, name: true, handle: true, assignedCollectionIds: true },
    orderBy: asc(influencer.name),
  });

  return (
    <div>
      <PageHeader title="New gifting order" />
      <NewOrderModes
        defaultInfluencerId={influencerId}
        influencers={influencers.map((i) => ({
          id: i.id,
          name: i.name,
          handle: i.handle,
          assignedCollectionIds: i.assignedCollectionIds ?? [],
        }))}
      />
    </div>
  );
}
