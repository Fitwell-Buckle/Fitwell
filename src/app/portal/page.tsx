import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
  type CatalogVariant,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { PortalOrder } from "./portal-order";

export default async function PortalHomePage() {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const [comp, catalog, groups] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, scope.companyId),
      columns: {
        name: true,
        assignedCollectionIds: true,
        assignedProductIds: true,
      },
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
    (async (): Promise<CatalogVariant[]> => {
      try {
        return await getCatalogCached();
      } catch {
        return [];
      }
    })(),
    (async (): Promise<CatalogCollectionGroup[]> => {
      try {
        return await getCatalogGroupsCached();
      } catch {
        return [];
      }
    })(),
  ]);

  const discount = comp?.priceTier?.discountPercent ?? 0;

  // Limit the orderable catalog to this brand's assigned collections + products
  // (null = unrestricted). Enforced again at checkout.
  const allowed = allowedVariantIds({
    assignedCollectionIds: comp?.assignedCollectionIds,
    assignedProductIds: comp?.assignedProductIds,
    groups,
    catalog,
  });
  const visibleCatalog = allowed
    ? catalog.filter((v) => allowed.has(v.shopifyVariantId))
    : catalog;

  return (
    <div>
      <PageHeader title="Place an order" />
      <p className="mt-1 text-sm text-zinc-500">
        Ordering for <span className="font-medium text-zinc-700">{comp?.name ?? "your brand"}</span>
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

      <PortalOrder variants={visibleCatalog} discountPercent={discount} />
    </div>
  );
}
