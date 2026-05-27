import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  productionStageDef,
  productionPoLineItem,
  productionStageEvent,
} from "@/lib/schema";
import { getStages, STAGE_LABELS_CACHE_TAG } from "@/lib/production/stage-labels";

const putSchema = z.object({
  // Desired stages in pipeline order. `key` absent = a brand-new stage.
  stages: z
    .array(z.object({ key: z.string().nullish(), label: z.string().min(1).max(60) }))
    .min(2)
    .max(40),
  // For each removed stage that still holds line items: which way to move them.
  moves: z.record(z.string(), z.enum(["forward", "back"])).optional(),
});

function slugKey(label: string, taken: Set<string>): string {
  const base =
    label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
    "stage";
  let key = base;
  let n = 1;
  while (taken.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
}

/** Nearest surviving stage in the given direction (falls back to the other). */
function moveTarget(
  currentKeys: string[],
  removedKey: string,
  direction: "forward" | "back",
  survive: Set<string>,
): string | null {
  const i = currentKeys.indexOf(removedKey);
  if (i === -1) return null;
  const fwd = currentKeys.slice(i + 1).find((k) => survive.has(k)) ?? null;
  const back = currentKeys.slice(0, i).reverse().find((k) => survive.has(k)) ?? null;
  return direction === "forward" ? (fwd ?? back) : (back ?? fwd);
}

// List the active stages (for the editor).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ data: await getStages() });
}

// Replace the pipeline: rename / add / delete / reorder stages. Deleting a stage
// soft-deletes it (history stays) and moves any line items still in it
// forward/back to the nearest surviving stage. Admin-only.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = putSchema.parse(await req.json());
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
    const allRows = await db.select().from(productionStageDef);
    const taken = new Set(allRows.map((r) => r.key));
    const currentActive = allRows
      .filter((r) => r.active)
      .sort((a, b) => a.position - b.position);
    const currentKeys = currentActive.map((r) => r.key);

    // Resolve a key for every submitted stage (existing or freshly generated).
    const desired = input.stages.map((s) => ({
      key: s.key && taken.has(s.key) ? s.key : slugKey(s.label, taken),
      label: s.label.trim(),
    }));
    const survive = new Set(desired.map((d) => d.key));
    const newTerminal = desired[desired.length - 1].key;

    const removed = currentKeys.filter((k) => !survive.has(k));

    // Move stranded line items out of each removed stage before deactivating it.
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    for (const key of removed) {
      const stranded = await db
        .select({ id: productionPoLineItem.id })
        .from(productionPoLineItem)
        .where(eq(productionPoLineItem.currentStage, key));
      if (stranded.length === 0) continue;

      const direction = input.moves?.[key];
      if (!direction) {
        return NextResponse.json(
          { error: `Choose where to move the items in "${key}" before deleting it.` },
          { status: 400 },
        );
      }
      const target = moveTarget(currentKeys, key, direction, survive);
      if (!target) {
        return NextResponse.json(
          { error: `No stage to move the items in "${key}" to.` },
          { status: 400 },
        );
      }

      for (const li of stranded) {
        await db
          .update(productionPoLineItem)
          .set({
            currentStage: target,
            updatedAt: now,
            actualCompletionDate: target === newTerminal ? today : null,
          })
          .where(eq(productionPoLineItem.id, li.id));
        await db
          .update(productionStageEvent)
          .set({ exitedAt: now })
          .where(
            and(
              eq(productionStageEvent.lineItemId, li.id),
              eq(productionStageEvent.stage, key),
              isNull(productionStageEvent.exitedAt),
            ),
          );
        await db.insert(productionStageEvent).values({
          lineItemId: li.id,
          stage: target,
          enteredAt: now,
          triggeredByUserId: session.user.id ?? null,
        });
      }
    }

    // Upsert the desired stages (label + position + active), then soft-delete the rest.
    for (let i = 0; i < desired.length; i++) {
      const d = desired[i];
      await db
        .insert(productionStageDef)
        .values({ key: d.key, label: d.label, position: i, active: true, updatedAt: now })
        .onConflictDoUpdate({
          target: productionStageDef.key,
          set: { label: d.label, position: i, active: true, updatedAt: now },
        });
    }
    for (const key of removed) {
      await db
        .update(productionStageDef)
        .set({ active: false, updatedAt: now })
        .where(eq(productionStageDef.key, key));
    }

    revalidateTag(STAGE_LABELS_CACHE_TAG);
    const data = desired.map((d, i) => ({
      key: d.key,
      label: d.label,
      position: i,
      active: true,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    console.error("Update stages failed:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
