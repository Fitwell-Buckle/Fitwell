"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface DetailTabSpec {
  /** Stable id used for tab state. */
  value: string;
  /** Label shown in the tab strip. */
  label: string;
  /** Show a small blue dot next to the label (e.g. items need action). */
  dot?: boolean;
  /** Tab body — wrap in `<Card>` (or equivalent) inside the caller if you want
   *  framing, since `DetailTabs` itself only provides the tab strip + content
   *  swap (no padded container). */
  content: ReactNode;
}

/**
 * Tabbed container for a detail page's reference/history sections. Action
 * surfaces (forms, status toggles, primary buttons) should stay above the
 * tabs so they're always visible — these tabs are for read-only/secondary
 * content that benefits from one-at-a-time display.
 *
 * Used by:
 *   - /modules/production/po/[id]      → Items / Progress / Activity
 *   - /invoices/[id]                   → Attachments / Linked POs / History
 */
export function DetailTabs({ tabs }: { tabs: DetailTabSpec[] }) {
  if (tabs.length === 0) return null;
  return (
    <div className="mt-5">
      <Tabs defaultValue={tabs[0].value}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.dot && (
                  <span
                    className="h-2 w-2 rounded-full bg-blue-500"
                    aria-label="pending"
                  />
                )}
              </span>
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
