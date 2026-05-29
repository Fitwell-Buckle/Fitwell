"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface TabSpec {
  /** Stable id used for tab state. */
  value: string;
  /** Label shown in the tab strip. */
  label: string;
  /** Tab body — already wrapped in a `<Card>` (or equivalent) by the caller. */
  content: ReactNode;
}

/**
 * Tabbed container for the PO detail page's reference/history sections (Costs,
 * Progress, Activity). The actionable bits (PoControls, PoReceive, SubPoCovers,
 * Sub-POs index) stay above the tabs so they remain visible at all times.
 */
export function PoDetailsTabs({ tabs }: { tabs: TabSpec[] }) {
  if (tabs.length === 0) return null;
  return (
    <div className="mt-5">
      <Tabs defaultValue={tabs[0].value}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
