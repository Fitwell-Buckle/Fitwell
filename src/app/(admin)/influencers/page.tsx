import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencer } from "@/lib/schema";
import { getCatalogGroupsCached } from "@/lib/catalog/load";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InfluencersManager } from "./influencers-manager";

export const metadata: Metadata = {
  title: "Influencer List | Fitwell Admin",
};

export default async function InfluencersPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const influencers = await db.query.influencer.findMany({
    orderBy: asc(influencer.name),
    with: { contacts: { columns: { id: true, email: true, name: true } } },
  });

  // Collection options for the assigned-collections picker (degrade gracefully
  // when Shopify is unavailable).
  let collections: { id: string; title: string }[] = [];
  try {
    collections = (await getCatalogGroupsCached()).map((g) => ({
      id: g.id,
      title: g.title,
    }));
  } catch {
    /* leave empty — assignment just won't list options */
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Influencer List" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/influencer-tracking">Orders</Link>
        </Button>
      </div>

      <InfluencersManager
        collections={collections}
        influencers={influencers.map((i) => ({
          id: i.id,
          name: i.name,
          handle: i.handle,
          platform: i.platform,
          contactName: i.contactName,
          contactEmail: i.contactEmail,
          customerId: i.customerId,
          assignedCollectionIds: i.assignedCollectionIds ?? [],
          notes: i.notes,
          contacts: i.contacts.map((c) => ({
            id: c.id,
            email: c.email,
            name: c.name,
          })),
        }))}
      />
    </div>
  );
}
