import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushSubscription } from "@/lib/schema";

export const runtime = "nodejs";

// Browser PushSubscription.toJSON() shape.
const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Register (or refresh) the current admin's push subscription for this device.
// Idempotent on `endpoint` — re-subscribing the same browser updates the keys
// and re-points it at the current user rather than creating a duplicate.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  await db
    .insert(pushSubscription)
    .values({
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers.get("user-agent") ?? null,
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get("user-agent") ?? null,
        lastUsedAt: new Date(),
      },
    });

  return NextResponse.json({ data: { ok: true } });
}

// Remove this device's subscription (Disable on this device).
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = z
    .object({ endpoint: z.string().url() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.endpoint, parsed.data.endpoint));
  return NextResponse.json({ data: { ok: true } });
}
