import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { draftReply } from "@/lib/ai/anthropic";
import { fetchThreadTranscript } from "@/lib/gmail/inbound";

const schema = z.object({
  contactName: z.string().max(200).nullish(),
  theirSubject: z.string().max(500).nullish(),
  theirMessage: z.string().max(10_000).nullish(),
  // The Gmail thread to pull full prior-conversation context from. The message
  // being replied to is in MY inbox, so we read the thread with my token.
  threadId: z.string().max(200).nullish(),
  // Optional notes from the user to steer the draft.
  instruction: z.string().max(1000).nullish(),
  relationship: z
    .enum(["customer", "b2b_customer", "lead", "supplier", "influencer"])
    .optional(),
});

// AI-draft a reply to an inbound email. Returns { subject, body } for the
// compose box to prefill (editable before sending).
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
      { error: "AI drafting not configured — set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let input;
  try {
    input = schema.parse(await req.json());
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
    const conversation = input.threadId
      ? await fetchThreadTranscript(session.user.id, input.threadId)
      : "";
    const draft = await draftReply({
      contactName: input.contactName,
      theirSubject: input.theirSubject,
      theirMessage: input.theirMessage,
      relationship: input.relationship ?? "customer",
      fromName: session.user.name ?? null,
      conversation,
      instruction: input.instruction,
    });
    return NextResponse.json({ data: draft });
  } catch (err) {
    console.error("compose draft failed:", err);
    return NextResponse.json({ error: "Couldn't draft a reply" }, { status: 500 });
  }
}
