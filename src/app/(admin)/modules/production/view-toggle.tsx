"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  tabBarInlineCls,
  tabBaseCls,
  tabActiveCls,
  tabInactiveCls,
} from "@/components/ui/tab-styles";

const VIEWS = [
  { key: "inventory", label: "Incoming Inventory" },
  { key: "board", label: "Production Board" },
  { key: "timeline", label: "Production Timeline" },
] as const;

/**
 * View toggle for the Production page (Inventory / Board / Timeline). Sets the
 * `view` query param (omitted for the default inventory view so the bare URL
 * stays clean). Existing filter params are preserved.
 *
 * Visual: lifted-pill tabs (see `tab-styles.ts`). The active tab and the
 * content card below share the same white + shadow-sm language.
 */
export function ProductionViewToggle({ view }: { view: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "inventory") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={tabBarInlineCls}>
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => setView(v.key)}
          aria-pressed={view === v.key}
          className={cn(
            tabBaseCls,
            view === v.key ? tabActiveCls : tabInactiveCls,
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
