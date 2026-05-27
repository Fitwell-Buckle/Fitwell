import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionStageLabel } from "@/lib/schema";
import { STAGES, type ProductionStage } from "@/lib/production/stages";
import { getStageLabels, STAGE_LABELS_CACHE_TAG } from "@/lib/production/stage-labels";

const patchSchema = z.object({
  labels: z.record(z.string(), z.string().max(60)),
});

// Effective stage labels (defaults merged with overrides).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ data: await getStageLabels() });
}

// Rename one or more stages. An empty/blank label reverts that stage to its
// default. Admin-only.
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
    input = patchSchema.parse(await req.json());
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
    for (const [key, raw] of Object.entries(input.labels)) {
      if (!STAGES.includes(key as ProductionStage)) continue;
      const stage = key as ProductionStage;
      const label = raw.trim();
      if (!label) {
        await db.delete(productionStageLabel).where(eq(productionStageLabel.stage, stage));
      } else {
        await db
          .insert(productionStageLabel)
          .values({ stage, label, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: productionStageLabel.stage,
            set: { label, updatedAt: new Date() },
          });
      }
    }
    revalidateTag(STAGE_LABELS_CACHE_TAG);
    return NextResponse.json({ data: await getStageLabels() });
  } catch (err) {
    console.error("Update stage labels failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
