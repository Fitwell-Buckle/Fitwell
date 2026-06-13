// "Lifted pill" visual language — each item is a rounded button; the active one
// fills white with a subtle drop shadow so it reads as a raised surface.
//
// Used ONLY by the ProductionViewToggle (Inventory / Board / Timeline) — a
// segmented view switcher, where the pill look reads as a control. The actual
// TAB strips — route-level nav (SectionTabs) and detail-page tabs (Radix
// ui/tabs / DetailTabs) — use the underline style instead (the standard); see
// section-tabs.tsx and ui/tabs.tsx.

export const tabBarFlexCls =
  "mt-4 inline-flex items-center gap-1 text-sm";
export const tabBarInlineCls = "inline-flex items-center gap-1 text-sm";

export const tabBaseCls =
  "rounded-full px-4 py-1.5 font-medium transition-colors";
export const tabActiveCls = "bg-white text-zinc-900 shadow-sm";
export const tabInactiveCls =
  "text-zinc-600 hover:bg-white/60 hover:text-zinc-900";
