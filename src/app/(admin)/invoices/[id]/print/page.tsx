import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { InvoiceDocument } from "../invoice-document";
import { PrintButton } from "./print-button";

// The page <title> is what the browser suggests as the "Save as PDF" filename,
// so name it "Fitwell Invoice INV-…". `absolute` skips any title template.
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

export default async function InvoicePrintPage({
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
      </div>

      <div className="mt-6">
        <InvoiceDocument inv={inv} />
      </div>
    </div>
  );
}
