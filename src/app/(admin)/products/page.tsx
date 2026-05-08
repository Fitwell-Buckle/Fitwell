import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Products | Fitwell Admin",
};

export default function ProductsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Products</h1>
      <p className="mt-1 text-sm text-zinc-500">
        SKU-level performance and inventory
      </p>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Product data will appear after Shopify sync.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
