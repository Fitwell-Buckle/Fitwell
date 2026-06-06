// Shared visual language for tab strips across the admin.
//
// "Lifted pill" — each tab is a rounded button. The active tab fills with
// white and gets a subtle drop shadow, so it reads as a small raised surface
// floating on the page background. Inactive tabs are transparent muted text
// that lift to a white-translucent pill on hover.
//
// The active tab shares its visual language (white + shadow-sm + rounded)
// with the content card below it, so the two surfaces look like they belong
// to the same group without needing any connecting shapes between them.
//
// Used by:
//   • SectionTabs (route-level navigation: Customers, Leads, …)
//   • ProductionViewToggle (Inventory / Board / Timeline)

export const tabBarFlexCls =
  "mt-4 inline-flex items-center gap-1 text-sm";
export const tabBarInlineCls = "inline-flex items-center gap-1 text-sm";

export const tabBaseCls =
  "rounded-full px-4 py-1.5 font-medium transition-colors";
export const tabActiveCls = "bg-white text-zinc-900 shadow-sm";
export const tabInactiveCls =
  "text-zinc-600 hover:bg-white/60 hover:text-zinc-900";
