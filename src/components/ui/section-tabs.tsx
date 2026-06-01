"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
}

// A horizontal tab bar that presents sibling routes as tabs. The active tab is
// matched by pathname (exact, or prefix when `prefix` is set — so detail pages
// keep their parent tab highlighted). Used to group paired list pages under one
// section heading (e.g. Consumer | B2B orders) without merging the pages.
export function SectionTabs({
  tabs,
  className,
}: {
  tabs: (SectionTab & { prefix?: boolean })[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div className={cn("mt-4 flex gap-1 border-b border-zinc-200", className)}>
      {tabs.map((t) => {
        const active = t.prefix
          ? pathname === t.href || pathname.startsWith(t.href + "/")
          : pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
