/**
 * Pure classification + mapping logic for the strategy funnel.
 * No DB imports — kept separate from strategy.ts so tests run without
 * a DATABASE_URL.
 *
 * Mirrors the segment rules in scripts/persona-segments.ts. When these
 * change, both must change together (the dashboard and the analysis
 * script should always tell the same story).
 */

export type RetentionStage =
  | "first_buyer"
  | "second_buyer"
  | "multi_unit"
  | "outfitter"
  | "advocate";

export type Channel =
  | "email_klaviyo_welcome_flow"
  | "email_klaviyo_other"
  | "judgeme_re_engagement"
  | "paid_meta_cold"
  | "paid_meta_retargeting"
  | "organic_meta"
  | "paid_search_branded"
  | "paid_search_category"
  | "paid_search_problem"
  | "organic_search"
  | "strap_maker_partnership"
  | "press_editorial"
  | "direct"
  | "other_unattributed";

export type Confidence = "strong" | "medium" | "weak" | "missing";

/**
 * Classify a customer into a retention-loop stage. Mutually exclusive,
 * hierarchical: outfitter > multi_unit > second_buyer > first_buyer.
 * The `advocate` stage is set externally (requires Judge.me data) and
 * never returned from this function.
 */
export function classifyRetentionStage(
  orderCount: number,
  totalQty: number,
): RetentionStage | null {
  if (orderCount < 1) return null;
  if (totalQty >= 5 || orderCount >= 3) return "outfitter";
  if (totalQty >= 3 && totalQty <= 4) return "multi_unit";
  if (orderCount === 2) return "second_buyer";
  if (orderCount === 1) return "first_buyer";
  return null;
}

/**
 * Map a customer's first-touch UTM into the channel-first taxonomy
 * defined in specs/strategy/funnel.md.
 */
export function mapToChannel(input: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}): Channel {
  const s = (input.utmSource ?? "").toLowerCase().trim();
  const m = (input.utmMedium ?? "").toLowerCase().trim();
  const c = (input.utmCampaign ?? "").toLowerCase().trim();

  if (s.includes("klaviyo") || c.includes("klaviyo")) {
    if (c.includes("welcome")) return "email_klaviyo_welcome_flow";
    return "email_klaviyo_other";
  }

  if (s.includes("judgeme") || c.includes("judgeme")) {
    return "judgeme_re_engagement";
  }

  const isMeta =
    s === "meta" ||
    s === "facebook" ||
    s === "fb" ||
    s === "ig" ||
    s === "instagram";
  if (isMeta) {
    if (m === "cpc" || m === "paid" || m === "paid_social" || m === "cpm") {
      if (c.includes("retarget") || c.includes("rt-")) {
        return "paid_meta_retargeting";
      }
      return "paid_meta_cold";
    }
    return "organic_meta";
  }

  if (s === "google") {
    if (m === "cpc" || m === "paid") {
      if (c.includes("brand") || c.includes("fitwell")) {
        return "paid_search_branded";
      }
      if (c.includes("problem") || c.includes("comfort")) {
        return "paid_search_problem";
      }
      return "paid_search_category";
    }
    if (m === "organic") return "organic_search";
  }

  if (s.includes("delugs") || s.includes("wis-")) {
    return "strap_maker_partnership";
  }
  if (
    s.includes("fratello") ||
    s.includes("hodinkee") ||
    s.includes("worn") ||
    s.includes("time-tide")
  ) {
    return "press_editorial";
  }

  if (!s || s === "(direct)" || s === "direct") return "direct";

  return "other_unattributed";
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  email_klaviyo_welcome_flow: "Klaviyo welcome flow",
  email_klaviyo_other: "Klaviyo (other)",
  judgeme_re_engagement: "Judge.me re-engagement",
  paid_meta_cold: "Meta paid (cold)",
  paid_meta_retargeting: "Meta retargeting",
  organic_meta: "Meta organic",
  paid_search_branded: "Google branded search (paid)",
  paid_search_category: "Google category search (paid)",
  paid_search_problem: "Google problem search (paid)",
  organic_search: "Organic search",
  strap_maker_partnership: "Strap-maker partnership",
  press_editorial: "Press / editorial",
  direct: "Direct / unattributed",
  other_unattributed: "Other / unmapped",
};

export const RETENTION_STAGE_META: Record<
  RetentionStage,
  { label: string; rule: string }
> = {
  first_buyer: {
    label: "First Buyer",
    rule: "1 order, ≤ 2 units",
  },
  second_buyer: {
    label: "Second Buyer",
    rule: "2 orders, ≤ 2 units",
  },
  multi_unit: {
    label: "Multi-Unit",
    rule: "3–4 total units",
  },
  outfitter: {
    label: "Outfitter",
    rule: "5+ units OR 3+ orders",
  },
  advocate: {
    label: "Advocate",
    rule: "Outfitter who has left a public review or generated attributable advocacy",
  },
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  strong: "Strong",
  medium: "Medium",
  weak: "Weak",
  missing: "Needs instrumentation",
};

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function confidenceLabel(c: Confidence): string {
  return CONFIDENCE_LABEL[c];
}
