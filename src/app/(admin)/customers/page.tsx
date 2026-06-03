import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCustomers } from "@/lib/admin/customers";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { DataTable } from "@/components/ui/data-table";
import { CUSTOMERS_TABS } from "@/lib/nav-tabs";
import {
  countNewCustomerMessages,
  listCustomerMessages,
} from "@/lib/crm/customer-messages";
import { CustomerMessagesPanel } from "@/components/crm/customer-messages-panel";

export const metadata: Metadata = {
  title: "Consumer List | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = typeof params.search === "string" ? params.search : undefined;

  const [{ data: customers, pagination }, messages, counts] = await Promise.all(
    [
      getCustomers({ page, limit: 20 }, { search }),
      listCustomerMessages("consumer"),
      countNewCustomerMessages(),
    ],
  );

  const tabs = CUSTOMERS_TABS.map((t) => ({
    ...t,
    dot:
      (t.href === "/customers/brands" ? counts.b2b : counts.consumer) > 0,
  }));

  return (
    <div>
      <PageHeader title="Customers" />
      <SectionTabs tabs={tabs} />

      <CustomerMessagesPanel
        audience="consumer"
        messages={messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          fromEmail: m.fromEmail,
          displayName: m.displayName,
          company: m.company,
          subject: m.subject,
          snippet: m.snippet,
          receivedAt: m.receivedAt ? m.receivedAt.toISOString() : null,
          mailboxLabel: m.mailboxLabel,
          mailboxEmail: m.mailboxEmail,
        }))}
      />

      <form action="" method="GET" className="mt-6 flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by name or email..."
          className="flex h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        />
        <Button type="submit">Search</Button>
      </form>

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>First Order</TableHead>
              <TableHead>Last Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-zinc-400"
                >
                  {search
                    ? "No customers match your search."
                    : "No customers yet. Run the Shopify sync to populate data."}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.orderCount ?? 0}</TableCell>
                  <TableCell>{fmt(c.totalSpent ?? 0)}</TableCell>
                  <TableCell>
                    {c.firstOrderAt
                      ? c.firstOrderAt.toLocaleDateString("en-US")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {c.lastOrderAt
                      ? c.lastOrderAt.toLocaleDateString("en-US")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
            customers)
          </p>
          <div className="flex gap-2">
            {pagination.page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/customers?page=${pagination.page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {pagination.page < pagination.totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/customers?page=${pagination.page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
