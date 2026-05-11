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

export const metadata: Metadata = {
  title: "Customers | Fitwell Admin",
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

  const { data: customers, pagination } = await getCustomers(
    { page, limit: 20 },
    { search },
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Customers</h1>
      <p className="mt-1 text-sm text-zinc-500">
        All customers synced from Shopify
      </p>

      <form action="" method="GET" className="mt-6 flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by name or email..."
          className="flex h-10 w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="mt-6 rounded-lg border bg-white">
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
                      className="font-medium text-blue-600 hover:underline"
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
      </div>

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
