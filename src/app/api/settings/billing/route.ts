import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  upsertBillingSettings,
  billingSettingsSchema,
} from "@/lib/invoicing/billing-settings";

// Update the free-text bank-wire / payment instructions shown on invoices
// (edited via the "Wire info" Setup modal on the B2B Orders page). Admin-only.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = billingSettingsSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    await upsertBillingSettings(input);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Update billing settings failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
