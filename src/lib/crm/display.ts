import type {
  LeadPersonaTag,
  LeadSourceChannel,
  LeadStage,
  LeadStatus,
} from "./constants";

// Pure display helpers shared by every CRM screen. Kept out of constants.ts
// so the enum source-of-truth file stays minimal.

const STAGE_LABELS: Record<LeadStage, string> = {
  lead: "Lead",
  sample: "Sample",
  customer: "Customer",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as LeadStage] ?? stage;
}

// Tailwind classes for a stage pill. Cooler colors early in the pipeline,
// warmer further in. Unknown stages fall back to neutral.
const STAGE_BADGE_CLASS: Record<LeadStage, string> = {
  lead: "bg-sky-100 text-sky-800",
  sample: "bg-amber-100 text-amber-800",
  customer: "bg-emerald-100 text-emerald-800",
};

export function stageBadgeClass(stage: string): string {
  return STAGE_BADGE_CLASS[stage as LeadStage] ?? "bg-zinc-100 text-zinc-600";
}

const SOURCE_LABELS: Record<LeadSourceChannel, string> = {
  // The default capture source — kept generic ("Tradeshow") since that's
  // what the booth flow is for.
  b2b_trade_shows_consumer: "Tradeshow",
  b2b_trade_shows_industry: "Tradeshow (industry)",
  b2b_outbound_cold: "Outbound (cold)",
  b2b_inbound: "Inbound",
  b2b_peer_referral: "Peer referral",
  b2b_strap_maker_referral_into_brand_customers: "Strap-maker referral",
  b2b_d2c_reverse_attribution: "D2C reverse-attribution",
  b2b_creator_pipeline: "Creator pipeline",
};

export function sourceChannelLabel(channel: string): string {
  return SOURCE_LABELS[channel as LeadSourceChannel] ?? channel;
}

const PERSONA_LABELS: Record<LeadPersonaTag, string> = {
  watch_oem: "Watch OEM",
  strap_oem: "Strap OEM",
  buckle_clasp_oem: "Buckle / Clasp OEM",
  retailer: "Retailer",
  distributor: "Distributor",
};

export function personaLabel(persona: string): string {
  return PERSONA_LABELS[persona as LeadPersonaTag] ?? persona;
}

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  converted: "bg-violet-50 text-violet-700",
  dropped: "bg-zinc-100 text-zinc-500",
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status as LeadStatus] ?? "bg-zinc-100 text-zinc-600";
}

// "Ada Lovelace" → "AL"; falls back to "—" if no useful name fragments.
export function leadDisplayName(lead: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
}): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (lead.companyName) return lead.companyName;
  if (lead.email) return lead.email;
  return "Unknown";
}

/**
 * Split a display name into first + last. First whitespace token is the first
 * name, the remainder is the last name ("Mary Jane Watson" → first "Mary",
 * last "Jane Watson"). Handles the "Last, First" form some address books use
 * ("Smith, John" → first "John", last "Smith"). Single-token names fill only
 * first. Returns empty strings when there's nothing to split.
 */
export function splitFullName(full: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const name = (full ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { firstName: "", lastName: "" };
  const comma = name.indexOf(",");
  if (comma !== -1) {
    const last = name.slice(0, comma).trim();
    const first = name.slice(comma + 1).trim();
    // Only treat as "Last, First" when both sides are present.
    if (last && first) return { firstName: first, lastName: last };
  }
  const space = name.indexOf(" ");
  if (space === -1) return { firstName: name, lastName: "" };
  return {
    firstName: name.slice(0, space),
    lastName: name.slice(space + 1).trim(),
  };
}
