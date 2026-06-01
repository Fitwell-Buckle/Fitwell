import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countNewCustomerMessages } from "@/lib/crm/customer-messages";

// Undismissed customer-message counts per audience, for the nav dot.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data: await countNewCustomerMessages() });
}
