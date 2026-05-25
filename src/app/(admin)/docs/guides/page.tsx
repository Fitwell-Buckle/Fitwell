import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guides, guideCategories } from "./guides-data";

export const metadata: Metadata = {
  title: "Guides | Fitwell Docs",
};

export default async function GuidesIndexPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <PageHeader title="Guides" />
      <p className="mt-2 text-sm text-zinc-500">
        Step-by-step walkthroughs for everything in the admin — creating POs,
        tracking production, invoicing, and the supplier &amp; B2B portals. New
        here? Start with “Signing in &amp; getting around”.
      </p>

      <div className="mt-6 space-y-8">
        {guideCategories.map((category) => {
          const items = guides.filter((g) => g.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {category}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((g) => (
                  <Link key={g.slug} href={`/docs/guides/${g.slug}`} className="group">
                    <Card className="h-full transition-colors group-hover:border-zinc-300 group-hover:shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{g.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed text-zinc-500">{g.summary}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
