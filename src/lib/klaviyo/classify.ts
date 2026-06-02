/**
 * Pure-logic classifiers for Klaviyo data. Lives separately from
 * queries.ts so the unit tests don't pull in the DB connection.
 */

export type FlowBucket = "welcome" | "post_purchase" | "other";

/**
 * Classify a flow name into welcome / post-purchase / other. Matches the
 * naming patterns the team uses in Klaviyo today; broaden over time as
 * new flow types come online.
 */
export function classifyFlowName(name: string | null): FlowBucket {
  if (!name) return "other";
  const lower = name.toLowerCase();
  if (lower.includes("welcome")) return "welcome";
  if (
    lower.includes("post-purchase") ||
    lower.includes("post purchase") ||
    lower.includes("thank you") ||
    lower.includes("outfit")
  ) {
    return "post_purchase";
  }
  return "other";
}
