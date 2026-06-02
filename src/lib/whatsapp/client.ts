// Send a WhatsApp text message via the Meta Cloud API. Requires WHATSAPP_TOKEN
// + WHATSAPP_PHONE_NUMBER_ID. Returns a reason code on failure (never throws) so
// callers can surface a clear message. Note: outside the 24-hour customer-care
// window Meta only allows pre-approved template messages — a plain text send
// will fail with "re_engagement"/policy errors there.
export interface WhatsAppSendResult {
  ok: boolean;
  error?: "not_configured" | "send_failed";
}

export async function sendWhatsApp(
  toPhone: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  if (!token || !phoneNumberId) return { ok: false, error: "not_configured" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toPhone.replace(/\D/g, ""),
          type: "text",
          text: { body: text },
        }),
      },
    );
    return res.ok ? { ok: true } : { ok: false, error: "send_failed" };
  } catch {
    return { ok: false, error: "send_failed" };
  }
}
