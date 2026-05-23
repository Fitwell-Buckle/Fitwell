import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setStage } from "@/lib/production/service";
import { STAGES, type ProductionStage } from "@/lib/production/stages";

const bodySchema = z.object({ stage: z.string() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (!STAGES.includes(input.stage as ProductionStage)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  }

  try {
    const transitions = await setStage({
      lineItemId: id,
      toStage: input.stage as ProductionStage,
      userId: session.user.id,
    });
    return NextResponse.json({ data: { transitions } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Set line-item stage failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
