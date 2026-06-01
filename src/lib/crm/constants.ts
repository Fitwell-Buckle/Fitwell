// Shared CRM constants. Mirror specs/strategy/b2b-pipeline.md — change there
// first, then update these arrays. Kept in a server/client-safe module (no db
// imports) so UI and API both consume the same source of truth.

// B2B pipeline stages, in canonical order. A booth scan defaults to
// `prospect`; promotion to `lead` requires a named decision-maker per the
// spec's anti-pattern.
export const LEAD_STAGES = [
  "prospect",
  "lead",
  "sample",
  "pilot_order",
  "recurring_order",
  "partnership",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

// Seven B2B entry channels from specs/strategy/b2b-pipeline.md.
export const LEAD_SOURCE_CHANNELS = [
  "b2b_trade_shows_consumer",
  "b2b_trade_shows_industry",
  "b2b_outbound_cold",
  "b2b_inbound",
  "b2b_peer_referral",
  "b2b_strap_maker_referral_into_brand_customers",
  "b2b_d2c_reverse_attribution",
] as const;
export type LeadSourceChannel = (typeof LEAD_SOURCE_CHANNELS)[number];

// Coarse buyer-type tags for CRM leads. Deliberately simpler than the
// B1–B6 marketing personas in specs/strategy/personas.md — at lead-capture
// time we only know the buyer category, not the full marketing persona.
export const LEAD_PERSONA_TAGS = [
  "watch_oem",
  "strap_oem",
  "retailer",
  "distributor",
] as const;
export type LeadPersonaTag = (typeof LEAD_PERSONA_TAGS)[number];

// Lead lifecycle status. `dropped` is the soft-delete state.
export const LEAD_STATUSES = ["active", "converted", "dropped"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
