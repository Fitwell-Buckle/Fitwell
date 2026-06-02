import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rewriteEmail } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

const rewriteSchema = z.object({
  subject: z.string().nullish(),
  body: z.string().min(1, "Nothing to rewrite."),
  instruction: z.string().max(500).nullish(),
});

// AI-rewrite the on-screen draft (subject + body, plus an optional steer). Works
// on the values posted from the editor — unsaved edits included — and returns a
// rewritten {subject, body} for the user to review before saving/sending. The
// route never persists; the editor does that via PATCH as before. Admin-only.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI rewrite isn't configured (ANTHROPIC_API_KEY missing)." },
      { status: 503 },
    );
  }

  let input;
  try {
    input = rewriteSchema.parse(await req.json());
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
    const rewritten = await rewriteEmail({
      subject: input.subject,
      body: input.body,
      instruction: input.instruction,
    });
    return NextResponse.json({ data: rewritten });
  } catch (err) {
    console.error("Rewrite email failed:", err);
    return NextResponse.json(
      { error: "Couldn't rewrite the email — please try again." },
      { status: 502 },
    );
  }
}
