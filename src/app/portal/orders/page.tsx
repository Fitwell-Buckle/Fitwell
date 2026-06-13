import { redirect } from "next/navigation";
import { getCompanyScope } from "@/lib/portal/company-session";
import { listInvoicesForCompany } from "@/lib/invoicing/service";
import { PageHeader } from "@/components/ui/page-header";
import { PortalOrdersTable } from "./orders-table";

export default async function PortalOrdersPage() {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const orders = await listInvoicesForCompany(scope.companyId);

  return (
    <div>
      <PageHeader title="Your orders" />
      <div className="mt-6">
        <PortalOrdersTable orders={orders} />
      </div>
    </div>
  );
}
