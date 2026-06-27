import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productIdea } from "@/lib/schema";
import { addReference, createPrototype } from "@/lib/prototypes/service";

export interface IdeaInput {
  name: string;
  description?: string | null;
  status?: string;
  impact?: number | null;
  confidence?: number | null;
  ease?: number | null;
  notes?: string | null;
  // Raw Fusion share link + its resolved embed URL (resolution happens in the
  // route, mirroring prototype references).
  fusionUrl?: string | null;
  fusionEmbedUrl?: string | null;
}

export async function createIdea(input: IdeaInput) {
  const [created] = await db
    .insert(productIdea)
    .values({
      name: input.name,
      description: input.description || null,
      status: input.status || "idea",
      impact: input.impact ?? null,
      confidence: input.confidence ?? null,
      ease: input.ease ?? null,
      notes: input.notes || null,
      fusionUrl: input.fusionUrl || null,
      fusionEmbedUrl: input.fusionEmbedUrl || null,
    })
    .returning({ id: productIdea.id });
  return created;
}

export async function updateIdea(id: string, input: Partial<IdeaInput>) {
  const [updated] = await db
    .update(productIdea)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.impact !== undefined ? { impact: input.impact ?? null } : {}),
      ...(input.confidence !== undefined
        ? { confidence: input.confidence ?? null }
        : {}),
      ...(input.ease !== undefined ? { ease: input.ease ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.fusionUrl !== undefined
        ? { fusionUrl: input.fusionUrl || null }
        : {}),
      ...(input.fusionEmbedUrl !== undefined
        ? { fusionEmbedUrl: input.fusionEmbedUrl || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(productIdea.id, id))
    .returning({ id: productIdea.id });
  return updated ?? null;
}

export async function deleteIdea(id: string) {
  const [deleted] = await db
    .delete(productIdea)
    .where(eq(productIdea.id, id))
    .returning({ id: productIdea.id });
  return deleted ?? null;
}

export async function listIdeas() {
  return db.query.productIdea.findMany({
    orderBy: desc(productIdea.createdAt),
    with: { promotedPrototype: { columns: { id: true, name: true } } },
  });
}

// The gate: graduate an idea into a prototype, carrying its name + concept, and
// record the lineage (idea → prototype). Idempotent — a re-promote returns the
// existing prototype rather than creating a duplicate.
export async function promoteIdeaToPrototype(
  id: string,
): Promise<{ prototypeId: string; alreadyPromoted: boolean } | null> {
  const idea = await db.query.productIdea.findFirst({
    where: eq(productIdea.id, id),
  });
  if (!idea) return null;
  if (idea.promotedPrototypeId) {
    return { prototypeId: idea.promotedPrototypeId, alreadyPromoted: true };
  }
  const created = await createPrototype({
    name: idea.name,
    description: idea.description,
    status: "concept",
  });
  // Carry the idea's CAD sketch forward to the prototype as a reference (embed
  // already resolved on the idea, so no re-fetch).
  if (idea.fusionUrl) {
    await addReference({
      prototypeId: created.id,
      url: idea.fusionUrl,
      embedUrl: idea.fusionEmbedUrl ?? null,
      title: null,
    });
  }
  await db
    .update(productIdea)
    .set({
      status: "promoted",
      promotedPrototypeId: created.id,
      promotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productIdea.id, id));
  return { prototypeId: created.id, alreadyPromoted: false };
}
