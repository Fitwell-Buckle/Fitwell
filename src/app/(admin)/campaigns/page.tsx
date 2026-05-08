import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Campaigns | Fitwell Admin",
};

export default function CampaignsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Campaigns</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Campaign performance across all channels
      </p>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campaign Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              No campaigns configured yet. Connect Google Ads to see campaign data.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
