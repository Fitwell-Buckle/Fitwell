// Shared trade-show constants. Server/client-safe (no db imports) so UI and
// API consume the same source of truth.

// Which CRM pipeline a vendor feeds. 'both' = could be a supplier we buy from
// *and* a brand we sell buckles to (drives which "Convert to …" actions show).
export const VENDOR_SIDES = ["supplier", "customer", "both"] as const;
export type VendorSide = (typeof VENDOR_SIDES)[number];

export const VENDOR_SIDE_LABELS: Record<VendorSide, string> = {
  supplier: "Supplier",
  customer: "Customer",
  both: "Both",
};

// Follow-up state for a booth conversation. 'none' = not yet triaged.
export const FOLLOW_UP_STATUSES = [
  "none",
  "todo",
  "scheduled",
  "done",
  "skip",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  none: "No follow-up",
  todo: "To do",
  scheduled: "Scheduled",
  done: "Done",
  skip: "Skip",
};

export const TRADE_SHOW_STATUSES = ["active", "archived"] as const;
export type TradeShowStatus = (typeof TRADE_SHOW_STATUSES)[number];
