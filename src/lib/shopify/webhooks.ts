import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("SHOPIFY_WEBHOOK_SECRET not configured");
    return false;
  }

  const hmac = createHmac("sha256", secret).update(body).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function handleWebhookTopic(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (topic) {
    case "orders/create":
    case "orders/updated":
      console.log(`Processing ${topic}:`, payload.id);
      // TODO: Upsert order into local DB
      break;
    case "customers/create":
    case "customers/update":
      console.log(`Processing ${topic}:`, payload.id);
      // TODO: Upsert customer into local DB
      break;
    case "refunds/create":
      console.log(`Processing ${topic}:`, payload.id);
      // TODO: Handle refund
      break;
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }
}
