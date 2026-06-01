import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { CaptureClient } from "./capture-client";

export const metadata: Metadata = {
  title: "Capture lead | Fitwell Admin",
};

export default async function CapturePage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <Link
        href="/leads"
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Leads
      </Link>
      <div className="mt-3">
        <PageHeader title="Capture lead" />
      </div>
      <div className="mt-6">
        <CaptureClient />
      </div>
    </div>
  );
}
