"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  Rocket,
  Layers,
  Database,
  Wrench,
  RefreshCw,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const docsNavItems = [
  { href: "/docs", label: "Overview", icon: BookOpen, exact: true },
  { href: "/docs/guides", label: "Guides", icon: GraduationCap },
  { href: "/docs/onboarding", label: "Getting Started", icon: Rocket },
  { href: "/docs/architecture", label: "Architecture", icon: Layers },
  { href: "/docs/schema", label: "Schema & Data Model", icon: Database },
  { href: "/docs/data-sync", label: "Data Sync", icon: RefreshCw },
  { href: "/docs/user-tracking", label: "User Tracking", icon: Activity },
  { href: "/docs/contributing", label: "Contributing", icon: Wrench },
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-zinc-200 pb-3">
      {docsNavItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
