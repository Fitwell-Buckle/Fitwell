import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook, handleWebhookTopic } from "@/lib/shopify/webhooks";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");

  if (!hmacHeader || !topic) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  const isValid = verifyWebhook(body, hmacHeader);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    await handleWebhookTopic(topic, payload);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 },
    );
  }
}
