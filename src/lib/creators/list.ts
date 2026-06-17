/**
 * Filter + sort logic for the /creators list page. Pure — the page builds
 * rows from DB queries and passes URL params through here, so the
 * URL-state behavior is unit-testable without a database.
 */

import type { PipelineStage } from "./lifecycle";

export const CREATOR_STATUSES = [
  "prospect",
  "contacted",
  "agreed", // renamed from "committed" 2026-06-12 (migration 0067)
  "active",
  "burned",
  "archived",
] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

export const VETTING_STATUSES = ["unreviewed", "approved", "rejected"] as const;
export type VettingStatus = (typeof VETTING_STATUSES)[number];

export interface CreatorListRow {
  id: string;
  name: string;
  status: string;
  vettingStatus: string;
  scoreBoost: number;
  country: string | null;
  /** Stamped by the page from Shopify active markets + row country. */
  outOfMarket: boolean;
  /** Derived lifecycle stage (lifecycle.ts); null for burned/archived. */
  stage: PipelineStage | null;
  /** Heuristic: platforms look like two different entities merged (edit.ts). */
  possibleMismatch: boolean;
  primaryPlatform: string | null;
  crossPlatformFit: number | null;
  /** How the creator entered the system (creator.source); null = legacy/import. */
  source: string | null;
  platforms: {
    platform: string;
    handle: string;
    fitScore: number | null;
    watchConfidence: string | null;
  }[];
  followersTotal: number;
  bestErPct: number | null;
  lastPostDate: string | null; // ISO date
  hasEmail: boolean;
}

export interface CreatorListParams {
  /** ig | yt | tt | multi */
  platform?: string;
  status?: string;
  /** unreviewed | approved | rejected */
  vetting?: string;
  /** "out" shows ONLY out-of-market creators (the parked bench) */
  market?: string;
  /** "1" shows ONLY creators flagged as possible bad cross-platform merges */
  mismatch?: string;
  /** Pipeline stage filter (clicked from the pipeline bar). */
  stage?: string;
  /** Provenance filter, e.g. "self_registration" for the signup review queue. */
  source?: string;
  /** substring match on name or any handle */
  q?: string;
  /** fit | followers | er | lastpost | name */
  sort?: string;
  dir?: "asc" | "desc";
  /** burned/archived/rejected rows are hidden unless this is "1" */
  all?: string;
}

/** The number the list ranks by: algorithmic fit + human boost. */
export function effectiveFit(row: Pick<CreatorListRow, "crossPlatformFit" | "scoreBoost">): number {
  return (row.crossPlatformFit ?? 0) + row.scoreBoost;
}

export function filterCreators(
  rows: CreatorListRow[],
  params: CreatorListParams,
): CreatorListRow[] {
  let out = rows;

  // Rejected creators are hidden from EVERY view except the explicit
  // "Rejected" pill or "Everything" — including lifecycle-status filters.
  if (params.all !== "1" && params.vetting !== "rejected") {
    out = out.filter((r) => r.vettingStatus !== "rejected");
  }
  // Same for out-of-market (the parked bench): hidden everywhere except
  // its own pill or "Everything". They come back automatically when the
  // market is enabled in Shopify (outOfMarket flips to false).
  if (params.market === "out") {
    out = out.filter((r) => r.outOfMarket);
  } else if (params.all !== "1") {
    out = out.filter((r) => !r.outOfMarket);
  }
  if (params.all !== "1" && !params.status) {
    out = out.filter(
      (r) => r.status !== "burned" && r.status !== "archived",
    );
  }
  if (params.status) {
    out = out.filter((r) => r.status === params.status);
  }
  if (params.vetting) {
    out = out.filter((r) => r.vettingStatus === params.vetting);
  } else if (
    // To-vet default: the plain landing view is the vetting queue —
    // approving (or rejecting) a creator empties it from here, the same
    // way rejecting always has. Approved creators live under the
    // "Approved" pill and remain visible in pipeline/stage/market/mismatch
    // views (which explicitly opt out of this default).
    params.all !== "1" &&
    !params.status &&
    !params.stage &&
    !params.source &&
    params.market !== "out" &&
    params.mismatch !== "1"
  ) {
    out = out.filter((r) => r.vettingStatus === "unreviewed");
  }
  if (params.mismatch === "1") {
    out = out.filter((r) => r.possibleMismatch);
  }
  if (params.source) {
    out = out.filter((r) => r.source === params.source);
  }
  if (params.platform === "multi") {
    out = out.filter((r) => r.platforms.length > 1);
  } else if (params.platform) {
    out = out.filter((r) =>
      r.platforms.some((p) => p.platform === params.platform),
    );
  }
  if (params.stage) {
    out = out.filter((r) => r.stage === params.stage);
  }
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.platforms.some((p) => p.handle.includes(q)),
    );
  }
  return out;
}

export function sortCreators(
  rows: CreatorListRow[],
  params: CreatorListParams,
): CreatorListRow[] {
  const sort = params.sort ?? "fit";
  const dir = params.dir ?? (sort === "name" ? "asc" : "desc");
  const mul = dir === "asc" ? 1 : -1;

  const value = (r: CreatorListRow): number | string => {
    switch (sort) {
      case "followers":
        return r.followersTotal;
      case "er":
        return r.bestErPct ?? -1;
      case "lastpost":
        return r.lastPostDate ?? "";
      case "name":
        return r.name.toLowerCase();
      case "fit":
      default:
        return effectiveFit(r);
    }
  };

  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  });
}

export function applyCreatorListParams(
  rows: CreatorListRow[],
  params: CreatorListParams,
): CreatorListRow[] {
  return sortCreators(filterCreators(rows, params), params);
}
