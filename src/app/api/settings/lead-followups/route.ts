import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  followupSettingsSchema,
  upsertFollowupSettings,
} from "@/lib/crm/followup-settings";

// Update the single lead follow-up rule (on/off + days-after-send) edited in
// admin Settings. Admin-only.
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
    input = followupSettingsSchema.parse(await req.json());
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
    await upsertFollowupSettings(input);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Update lead follow-up settings failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
