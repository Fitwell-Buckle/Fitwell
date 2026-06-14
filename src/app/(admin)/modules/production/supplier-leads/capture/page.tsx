import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { CaptureClient } from "./capture-client";

export const metadata: Metadata = {
  title: "Capture supplier | Fitwell Admin",
};

export default async function SupplierCapturePage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <Link
        href="/modules/production/supplier-leads"
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Supplier Leads
      </Link>
      <div className="mt-3">
        <PageHeader title="Capture supplier" />
      </div>
      <div className="mt-6">
        <CaptureClient />
      </div>
    </div>
  );
}
