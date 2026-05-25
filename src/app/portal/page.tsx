import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import { getCatalogCached, type CatalogVariant } from "@/lib/catalog/load";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { PortalOrder } from "./portal-order";

export default async function PortalHomePage() {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const [comp, catalog] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, scope.companyId),
      columns: { name: true },
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
    (async (): Promise<CatalogVariant[]> => {
      try {
        return await getCatalogCached();
      } catch {
        return [];
      }
    })(),
  ]);

  const discount = comp?.priceTier?.discountPercent ?? 0;

  return (
    <div>
      <PageHeader title="Place an order" />
      <p className="mt-1 text-sm text-zinc-500">
        Ordering for <span className="font-medium text-zinc-700">{comp?.name ?? "your company"}</span>
        {discount > 0 ? (
          <>
            {" "}
            at your pricing:{" "}
            <Badge className="bg-emerald-50 text-emerald-700">
              {comp?.priceTier?.name} — {discount}% off retail
            </Badge>
          </>
        ) : (
          " at retail pricing."
        )}
      </p>

      <PortalOrder variants={catalog} discountPercent={discount} />
    </div>
  );
}
