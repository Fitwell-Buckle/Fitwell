import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  productionSettingsSchema,
  upsertProductionSettings,
} from "@/lib/production/production-settings";

// Update production module settings (the supplier ETA-reminder toggle +
// interval) edited in admin Settings. Admin-only.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = productionSettingsSchema.parse(await req.json());
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
    await upsertProductionSettings(input);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Update production settings failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
