import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { utmAttribution } from "@/lib/schema";

export const runtime = "nodejs";

// The Shopify theme snippet posts here cross-origin from the storefront.
const ALLOWED_ORIGINS = new Set([
  "https://www.fitwellbuckle.co",
  "https://fitwellbuckle.co",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://www.fitwellbuckle.co";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Accept both `posthogDistinctId` (current) and `fwDistinctId` (legacy snippet
// name) so a snippet deploy lag doesn't drop tracking writes.
const trackingSchema = z
  .object({
    posthogDistinctId: z.string().min(1).max(200).optional(),
    fwDistinctId: z.string().min(1).max(200).optional(),
    sessionId: z.string().min(1).max(200),
    source: z.string().max(500).nullish(),
    medium: z.string().max(500).nullish(),
    campaign: z.string().max(500).nullish(),
    term: z.string().max(500).nullish(),
    content: z.string().max(500).nullish(),
    gclid: z.string().max(500).nullish(),
    landingPage: z.string().max(2048).nullish(),
    referrer: z.string().max(2048).nullish(),
  })
  .refine((d) => d.posthogDistinctId || d.fwDistinctId, {
    message: "posthogDistinctId or fwDistinctId is required",
    path: ["posthogDistinctId"],
  });

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  let parsed;
  try {
    parsed = trackingSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid payload", details: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400, headers: cors },
    );
  }

  try {
    // First-touch only: a session's attribution is captured once and never
    // overwritten (specs/invariants/attribution.md §2). The unique index on
    // session_id makes the insert idempotent under client retries / replays.
    await db
      .insert(utmAttribution)
      .values({
        posthogDistinctId: parsed.posthogDistinctId ?? parsed.fwDistinctId,
        sessionId: parsed.sessionId,
        source: parsed.source ?? null,
        medium: parsed.medium ?? null,
        campaign: parsed.campaign ?? null,
        term: parsed.term ?? null,
        content: parsed.content ?? null,
        gclid: parsed.gclid ?? null,
        landingPage: parsed.landingPage ?? null,
        referrer: parsed.referrer ?? null,
      })
      .onConflictDoNothing({ target: utmAttribution.sessionId });

    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error("UTM tracking insert failed:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: cors },
    );
  }
}
