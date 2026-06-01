import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { matchByEmail } from "@/lib/crm/service";

const querySchema = z.object({
  email: z.string().min(3).max(320),
});

// Look up whether an email's domain matches an existing company and whether
// an active lead with that email already exists (scoped to the matched
// company when one is found, otherwise global). Used by the capture flow
// to decide whether to surface a "link to Company X" or "attach card to
// existing lead Y" prompt.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    email: url.searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await matchByEmail(parsed.data.email);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("matchByEmail failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
