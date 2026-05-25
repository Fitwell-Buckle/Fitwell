import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { PortalTopBar } from "./portal-top-bar";

export const metadata: Metadata = {
  title: "Fitwell B2B Portal",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The login page has no session → renders bare. Middleware enforces the role
  // for every other /portal route.
  const scope = await getCompanyScope();

  let topBar = null;
  if (scope) {
    const [logoUrl, comp] = await Promise.all([
      getStoreLogoUrl(),
      db.query.company.findFirst({
        where: eq(company.id, scope.companyId),
        columns: { name: true },
      }),
    ]);
    topBar = <PortalTopBar logoUrl={logoUrl} companyName={comp?.name ?? "Your company"} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      {topBar}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
