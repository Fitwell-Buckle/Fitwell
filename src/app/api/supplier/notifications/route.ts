import { NextResponse } from "next/server";
import { getSupplierScope } from "@/lib/production/supplier-session";
import {
  unreadSupplierNotificationCount,
  markSupplierNotificationRead,
  markAllSupplierNotificationsRead,
} from "@/lib/production/notifications";

// Unread count for the supplier portal nav badge.
export async function GET() {
  const scope = await getSupplierScope();
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    count: await unreadSupplierNotificationCount(scope.supplierId),
  });
}

// Mark one (`{ id }`) or all (`{ all: true }`) of this supplier's notifications read.
export async function POST(req: Request) {
  const scope = await getSupplierScope();
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    all?: boolean;
  };
  if (body.all) {
    await markAllSupplierNotificationsRead(scope.supplierId);
  } else if (typeof body.id === "string") {
    await markSupplierNotificationRead(body.id, scope.supplierId);
  }
  return NextResponse.json({ ok: true });
}
