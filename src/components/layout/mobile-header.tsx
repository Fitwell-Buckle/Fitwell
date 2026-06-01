"use client";

import { MobileMenuButton } from "./admin-sidebar";
import { DateRangePicker } from "./date-range-picker";

export function MobileHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-zinc-200/80 bg-white px-4 md:px-10">
      <MobileMenuButton />
      <div className="flex min-w-0 flex-1 items-center">
        <DateRangePicker embedded />
      </div>
    </div>
  );
}
