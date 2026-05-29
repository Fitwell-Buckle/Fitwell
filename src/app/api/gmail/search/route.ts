import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchAdminGmailContacts } from "@/lib/gmail/search";

// Admin-only proxy to the signed-in admin's Gmail. Returns email addresses
// found in From/To/Cc headers of messages matching `q`.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "user") {
    // Suppliers / companies have no business searching the admin's Gmail.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ data: [] });

  const { results, error } = await searchAdminGmailContacts(
    session.user.id,
    q,
  );
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  return NextResponse.json({ data: results });
}
