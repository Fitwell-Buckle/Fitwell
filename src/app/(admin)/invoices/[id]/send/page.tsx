import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "../invoice-document";
import { InvoiceSendForm } from "./send-form";
import { PrintButton } from "../print/print-button";

// Title doubles as the browser's "Save as PDF" filename when printing from here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await db.query.invoice.findFirst({
    where: eq(invoice.id, id),
    columns: { invoiceNumber: true },
  });
  return {
    title: { absolute: `Fitwell Invoice ${row?.invoiceNumber ?? ""}`.trim() },
  };
}

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
        <PrintButton />
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
