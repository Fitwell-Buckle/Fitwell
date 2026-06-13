"use client";

import { MobileMenuButton } from "./admin-sidebar";
import { DateRangePicker } from "./date-range-picker";

export function MobileHeader() {
  return (
    // Pad the bar down by the iOS safe-area inset so the menu button clears the
    // status bar / Dynamic Island when running as an installed PWA (standalone
    // + viewport-fit=cover puts content full-bleed under the status bar). The
    // inset is 0 in normal browsers and on desktop, so this is a no-op there.
    <div className="flex h-[calc(3rem_+_env(safe-area-inset-top))] shrink-0 items-center border-b border-zinc-200/80 bg-white px-4 pt-[env(safe-area-inset-top)] md:px-10">
      <MobileMenuButton />
      <div className="flex min-w-0 flex-1 items-center">
        <DateRangePicker embedded />
      </div>
    </div>
  );
}
