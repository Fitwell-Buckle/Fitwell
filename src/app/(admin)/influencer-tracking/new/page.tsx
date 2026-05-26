import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencer } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InfluencerOrderForm } from "./order-form";

export const metadata: Metadata = {
  title: "New gifting order | Fitwell Admin",
};

export default async function NewInfluencerOrderPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const influencers = await db.query.influencer.findMany({
    columns: { id: true, name: true, handle: true, assignedCollectionIds: true },
    orderBy: asc(influencer.name),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="New gifting order" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/influencer-tracking">Back</Link>
        </Button>
      </div>
      <InfluencerOrderForm
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
