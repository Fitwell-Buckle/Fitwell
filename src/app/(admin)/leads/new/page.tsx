import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { NewLeadForm } from "./new-lead-form";

export const metadata: Metadata = {
  title: "New lead | Fitwell Admin",
};

export default async function NewLeadPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .orderBy(asc(company.name));

  return (
    <div>
      <Link
        href="/leads"
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Leads
      </Link>
      <div className="mt-3">
        <PageHeader title="New lead" />
      </div>
      <NewLeadForm companies={companies} />
    </div>
  );
}
