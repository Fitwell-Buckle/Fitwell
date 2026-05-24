import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { SupplierTopBar } from "./supplier-top-bar";

export const metadata: Metadata = {
  title: "Supplier Portal | Fitwell Buckle Co.",
};

export default async function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The login page has no session, so it renders bare (no top bar). Middleware
  // already enforces the role for every other /supplier route.
  const scope = await getSupplierScope();

  let topBar = null;
  if (scope) {
    const [logoUrl, sup] = await Promise.all([
      getStoreLogoUrl(),
      db.query.supplier.findFirst({
        where: eq(supplier.id, scope.supplierId),
        columns: { name: true },
      }),
    ]);
    topBar = <SupplierTopBar logoUrl={logoUrl} supplierName={sup?.name ?? "Supplier"} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      {topBar}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
