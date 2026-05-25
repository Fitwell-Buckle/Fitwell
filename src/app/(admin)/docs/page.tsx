import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GraduationCap,
  Rocket,
  Layers,
  Database,
  RefreshCw,
  Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Docs | Fitwell Admin",
};

const sections = [
  {
    href: "/docs/guides",
    title: "Guides",
    description:
      "Step-by-step how-tos for using the admin: purchase orders, production, inventory, invoicing, and the supplier & B2B portals.",
    icon: GraduationCap,
  },
  {
    href: "/docs/onboarding",
    title: "Getting Started",
    description:
      "Clone the repo, set up your database branch, and run the dev server.",
    icon: Rocket,
  },
  {
    href: "/docs/architecture",
    title: "Architecture",
    description:
      "Tech stack, app structure, route groups, middleware, and infrastructure.",
    icon: Layers,
  },
  {
    href: "/docs/schema",
    title: "Schema & Data Model",
    description:
      "Database tables, relationships, design principles, and the single-schema rule.",
    icon: Database,
  },
  {
    href: "/docs/data-sync",
    title: "Data Sync",
    description:
      "How data flows from Shopify, GA4, Google Ads, and PostHog into the platform.",
    icon: RefreshCw,
  },
  {
    href: "/docs/contributing",
    title: "Contributing",
    description:
      "How to add pages, nav items, API routes, and database tables. Escalation rules for major decisions.",
    icon: Wrench,
  },
];

export default async function DocsIndexPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <PageHeader title="Developer Documentation" />
      <p className="mt-2 text-sm text-zinc-500">
        Reference documentation for the Fitwell admin platform. These pages
        render directly from the spec files in the repository — the same
        files that Claude reads when building features.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="group">
            <Card className="h-full transition-colors group-hover:border-zinc-300 group-hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <section.icon className="h-4 w-4 text-zinc-400" />
                  <CardTitle className="text-sm">{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-zinc-500">
                  {section.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
