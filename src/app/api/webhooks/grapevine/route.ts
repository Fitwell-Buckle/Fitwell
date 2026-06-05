import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  grapevineWebhookPayload,
  ingestGrapevineResponse,
} from "@/lib/grapevine/ingest";

export const runtime = "nodejs";

// Grapevine post-purchase survey responses arrive here via Shopify Flow:
//   Grapevine "Response Completed" trigger →
//   Shopify Flow "Send HTTP request" action →
//   this endpoint
//
// Tom configures the Flow action to send JSON matching `grapevineWebhookPayload`
// and to set header `x-grapevine-secret: <GRAPEVINE_WEBHOOK_SECRET>`.
//
// Setup instructions live in specs/work-plans/todo/grapevine-integration.md
// (Phase 1c). Inert until GRAPEVINE_WEBHOOK_SECRET is set and the Flow is
// configured and turned on.

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-grapevine-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = grapevineWebhookPayload.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await ingestGrapevineResponse(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("grapevine webhook failed:", err);
    // Return 500 so Shopify Flow retries — unlike Shopify webhooks proper,
    // Flow's HTTP action surfaces 5xx as a retryable error in the Flow run
    // history, which is what we want for transient DB failures.
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}

function secretMatches(provided: string | null): boolean {
  const expected = process.env.GRAPEVINE_WEBHOOK_SECRET;
  if (!expected) return false; // refuse all traffic until configured
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
