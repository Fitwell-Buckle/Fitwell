import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Conversion Funnel | Fitwell Admin",
};

export default function FunnelPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Conversion Funnel</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Visitor to purchase conversion analysis
      </p>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Funnel Stages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Funnel data will appear once PostHog events and Shopify orders are synced.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
