import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Customer Detail | Fitwell Admin",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">Customer Detail</h1>
      <p className="mt-1 text-sm text-zinc-500">Customer ID: {id}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">Customer data will appear here after sync.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">No orders found.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
