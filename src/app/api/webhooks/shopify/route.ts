import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook, handleWebhookTopic } from "@/lib/shopify/webhooks";
import { flushEvents } from "@/lib/analytics/posthog";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");
  const shopDomain = req.headers.get("x-shopify-shop-domain");

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
    // Serverless dies after the response — flush buffered PostHog events now.
    await flushEvents();
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    // Log the error but return 200 to prevent Shopify retries on transient errors.
    // Shopify will keep retrying on non-2xx responses, which can cause cascading failures.
    console.error(
      `Webhook processing error [topic=${topic}, shop=${shopDomain}]:`,
      error,
    );
    return NextResponse.json({ status: "ok", warning: "processing error logged" });
  }
}
