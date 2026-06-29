import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { runAssistantTurn } from "@/lib/ai/assistant/agent";
import { loadConversation, persistTurn } from "@/lib/ai/assistant/persistence";

// The agent loop makes several model calls + DB queries; give it headroom.
export const maxDuration = 60;

const bodySchema = z.object({
  conversationId: z.string().nullish(),
  message: z.string().min(1).max(8000),
  model: z.enum(["sonnet", "opus"]).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rebuild prior history server-side (authoritative) when continuing a chat.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  if (body.conversationId) {
    const loaded = await loadConversation(userId, body.conversationId);
    if (!loaded) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    for (const m of loaded.messages) {
      history.push({ role: m.role, content: m.content });
    }
  }

  try {
    const result = await runAssistantTurn({
      messages: [...history, { role: "user", content: body.message }],
      model: body.model,
    });

    const conversationId = await persistTurn({
      userId,
      conversationId: body.conversationId ?? null,
      model: result.model,
      question: body.message,
      answer: result.answer,
      steps: result.steps,
      stoppedAtStepLimit: result.stoppedAtStepLimit,
    });

    return NextResponse.json({
      data: {
        conversationId,
        answer: result.answer,
        steps: result.steps,
        stoppedAtStepLimit: result.stoppedAtStepLimit,
        model: result.model,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Assistant failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
