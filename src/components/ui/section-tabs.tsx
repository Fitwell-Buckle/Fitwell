"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  tabBarFlexCls,
  tabBaseCls,
  tabActiveCls,
  tabInactiveCls,
} from "./tab-styles";

export interface SectionTab {
  href: string;
  label: string;
  // Show a small blue dot next to the label (e.g. unsent drafts pending).
  dot?: boolean;
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
    <div className={cn(tabBarFlexCls, className)}>
      {tabs.map((t) => {
        const active = t.prefix
          ? pathname === t.href || pathname.startsWith(t.href + "/")
          : pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            // Don't auto-scroll on tab change — Next's default scrolls the
            // viewport to top, which makes the page jump every time you
            // switch tabs even though the tab bar (and the content area
            // below it) is what the user is looking at.
            scroll={false}
            className={cn(tabBaseCls, active ? tabActiveCls : tabInactiveCls)}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.dot && (
                <span
                  className="h-2 w-2 rounded-full bg-blue-500"
                  aria-label="pending"
                />
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
