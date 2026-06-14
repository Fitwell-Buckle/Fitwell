import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPushConfigured, sendWebPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";

// Fire a test notification to every device the current admin has registered.
// Backs the "Send test notification" button in Settings — the real-device check
// that push actually lands on a locked phone.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push not configured — VAPID keys are not set." },
      { status: 503 },
    );
  }

  const result = await sendWebPushToUser(session.user.id, {
    title: "Fitwell Portal",
    body: "🔔 Test notification — push is working on this device.",
    url: "/notifications",
    tag: "push-test",
  });

  if (result.sent === 0) {
    return NextResponse.json(
      {
        error:
          "No devices received it. Enable notifications on this device first, " +
          "and on iPhone make sure the app is added to your home screen.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ data: result });
}
