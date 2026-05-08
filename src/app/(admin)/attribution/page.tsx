import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Attribution | Fitwell Admin",
};

export default function AttributionPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Attribution</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Channel attribution and marketing ROI
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Attribution data will appear once UTM tracking and orders are synced.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Connect campaigns to see per-campaign attribution.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
