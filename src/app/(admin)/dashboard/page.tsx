import type { Metadata } from "next";
import { MetricCard } from "@/components/charts/metric-card";

export const metadata: Metadata = {
  title: "Dashboard | Fitwell Admin",
};

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Overview of key business metrics
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Revenue"
          value="$0.00"
          trend={{ value: 0, direction: "up" }}
        />
        <MetricCard
          label="Orders"
          value="0"
          trend={{ value: 0, direction: "up" }}
        />
        <MetricCard
          label="Customers"
          value="0"
          trend={{ value: 0, direction: "up" }}
        />
        <MetricCard
          label="AOV"
          value="$0.00"
          trend={{ value: 0, direction: "up" }}
        />
      </div>
    </div>
  );
}
