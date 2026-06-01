import type {
  LeadPersonaTag,
  LeadSourceChannel,
  LeadStage,
  LeadStatus,
} from "./constants";

// Pure display helpers shared by every CRM screen. Kept out of constants.ts
// so the enum source-of-truth file stays minimal.

const STAGE_LABELS: Record<LeadStage, string> = {
  prospect: "Prospect",
  lead: "Lead",
  sample: "Sample",
  pilot_order: "Pilot order",
  recurring_order: "Recurring order",
  partnership: "Partnership",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as LeadStage] ?? stage;
}

// Tailwind classes for a stage pill. Cooler colors early in the pipeline,
// warmer further in. Unknown stages fall back to neutral.
const STAGE_BADGE_CLASS: Record<LeadStage, string> = {
  prospect: "bg-zinc-100 text-zinc-700",
  lead: "bg-sky-100 text-sky-800",
  sample: "bg-indigo-100 text-indigo-800",
  pilot_order: "bg-amber-100 text-amber-800",
  recurring_order: "bg-emerald-100 text-emerald-800",
  partnership: "bg-violet-100 text-violet-800",
};

export function stageBadgeClass(stage: string): string {
  return STAGE_BADGE_CLASS[stage as LeadStage] ?? "bg-zinc-100 text-zinc-600";
}

const SOURCE_LABELS: Record<LeadSourceChannel, string> = {
  b2b_trade_shows_consumer: "Tradeshow (consumer)",
  b2b_trade_shows_industry: "Tradeshow (industry)",
  b2b_outbound_cold: "Outbound (cold)",
  b2b_inbound: "Inbound",
  b2b_peer_referral: "Peer referral",
  b2b_strap_maker_referral_into_brand_customers: "Strap-maker referral",
  b2b_d2c_reverse_attribution: "D2C reverse-attribution",
};

export function sourceChannelLabel(channel: string): string {
  return SOURCE_LABELS[channel as LeadSourceChannel] ?? channel;
}

const PERSONA_LABELS: Record<LeadPersonaTag, string> = {
  watch_oem: "Watch OEM",
  strap_oem: "Strap OEM",
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
