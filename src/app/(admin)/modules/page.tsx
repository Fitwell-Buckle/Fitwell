import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Factory, Megaphone } from "lucide-react";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Modules | Fitwell Admin",
};

const modules = [
  {
    href: "/modules/production",
    label: "Production",
    icon: Factory,
    description:
      "Track buckle production across suppliers and stages — POs, kanban, and timelines.",
    available: true,
  },
  {
    href: "#",
    label: "Marketing",
    icon: Megaphone,
    description: "Campaign planning and content workflows.",
    available: false,
  },
];

export default async function ModulesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div>
      <PageHeader title="Modules" />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const inner = (
            <Card
              className={
                m.available
                  ? "h-full p-6 transition-colors hover:border-zinc-300 hover:shadow-md"
                  : "h-full p-6 opacity-60"
              }
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                  <m.icon className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold text-zinc-900">
                  {m.label}
                </span>
                {!m.available && <Badge>Coming soon</Badge>}
              </div>
              <p className="mt-3 text-sm text-zinc-500">{m.description}</p>
            </Card>
          );

          return m.available ? (
            <Link key={m.label} href={m.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={m.label}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
