import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countUnreviewedSignups } from "@/lib/creators/notifications";

// Drives the blue dot on the "Creators" nav item — count of unreviewed
// self-registered creators. Polled by the admin sidebar (like the other
// count endpoints). Admin-only; returns 0 for everyone else.
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || role === "supplier" || role === "company") {
    return NextResponse.json({ count: 0 });
  }
  try {
    return NextResponse.json({ count: await countUnreviewedSignups() });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
