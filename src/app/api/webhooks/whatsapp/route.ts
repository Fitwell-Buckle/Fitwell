import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  buildPhoneIndex,
  recordInboundWhatsApp,
} from "@/lib/crm/whatsapp-messages";

export const runtime = "nodejs";

// Meta Cloud API webhook for WhatsApp.
//
// GET  — verification handshake: Meta calls with hub.mode/hub.verify_token/
//        hub.challenge; echo the challenge when the token matches.
// POST — inbound message events: verify the X-Hub-Signature-256 HMAC (when
//        WHATSAPP_APP_SECRET is set), then record each message from a known
//        lead/customer (matched by phone) and raise a notification.
//
// Inert until WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET are configured and the
// webhook URL is registered in the Meta app. See specs/current/integrations.md.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function signatureValid(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not enforced until configured
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ignore unparseable; ack anyway
  }

  try {
    // Build the phone index once for the whole batch.
    const index = await buildPhoneIndex();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages?.length) continue;
        const nameByWaId = new Map(
          (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]),
        );
        for (const m of value.messages) {
          await recordInboundWhatsApp(
            {
              waMessageId: m.id,
              fromPhone: m.from,
              contactName: nameByWaId.get(m.from) ?? null,
              body: m.text?.body ?? (m.type ? `[${m.type}]` : null),
              timestampSec: m.timestamp ? Number(m.timestamp) : null,
            },
            index,
          );
        }
      }
    }
  } catch (err) {
    console.error("whatsapp webhook failed:", err);
  }

  // Always 200 so Meta doesn't retry/disable the webhook.
  return NextResponse.json({ ok: true });
}
