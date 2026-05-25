import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/production/notifications";

function denyNonAdmin(role: string | undefined) {
  return role === "supplier" || role === "company";
}

// Unread count for the nav badge.
export async function GET() {
  const session = await auth();
  if (!session?.user || denyNonAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ count: await unreadNotificationCount() });
}

// Mark one (`{ id }`) or all (`{ all: true }`) notifications read.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || denyNonAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  if (body.all) await markAllNotificationsRead();
  else if (typeof body.id === "string") await markNotificationRead(body.id);
  return NextResponse.json({ ok: true });
}
