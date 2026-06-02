import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { listCustomerMessages } from "@/lib/crm/customer-messages";
import { CustomerMessagesPanel } from "@/components/crm/customer-messages-panel";
import { SupplierManager } from "./supplier-manager";

export const metadata: Metadata = {
  title: "Supplier List | Fitwell Admin",
};

export default async function SuppliersPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [suppliers, messages] = await Promise.all([
    db.query.supplier.findMany({
      orderBy: asc(supplier.name),
      with: { contacts: { columns: { id: true, email: true, name: true } } },
    }),
    listCustomerMessages("supplier"),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Suppliers" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/modules/production">Back</Link>
        </Button>
      </div>

      <CustomerMessagesPanel
        audience="supplier"
        messages={messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          fromEmail: m.fromEmail,
          displayName: m.displayName,
          subject: m.subject,
          snippet: m.snippet,
          receivedAt: m.receivedAt ? m.receivedAt.toISOString() : null,
          mailboxLabel: m.mailboxLabel,
          mailboxEmail: m.mailboxEmail,
        }))}
      />

      <SupplierManager
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          contactName: s.contactName,
          contactEmail: s.contactEmail,
          phone: s.phone,
          shippingAddress: s.shippingAddress,
          notes: s.notes,
          contacts: s.contacts.map((c) => ({
            id: c.id,
            email: c.email,
            name: c.name,
          })),
        }))}
      />
    </div>
  );
}
