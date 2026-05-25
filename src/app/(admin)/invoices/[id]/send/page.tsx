import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "../invoice-document";
import { InvoiceSendForm } from "./send-form";

export const metadata: Metadata = {
  title: "Send invoice | Fitwell Admin",
};

export default async function InvoiceSendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const inv = await getInvoiceDetail(id);
  if (!inv) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/invoices/${inv.id}`}>Back to invoice</Link>
        </Button>
      </div>

      <div className="mt-6">
        <InvoiceDocument inv={inv} />
      </div>

      <InvoiceSendForm
        invoiceId={inv.id}
        invoiceNumber={inv.invoiceNumber}
        defaultTo={inv.company?.contactEmail ?? ""}
        ccEmail={session.user.email ?? null}
      />
    </div>
  );
}
