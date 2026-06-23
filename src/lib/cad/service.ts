import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { cadModel } from "@/lib/schema";
import { stlToGlb } from "./stl-to-glb";
import {
  resolveFusionShare,
  triggerStlExport,
  findStlExportLink,
} from "./fusion-export";

// Give up waiting for the Autodesk export email after this long.
const EXPORT_TIMEOUT_MS = 60 * 60 * 1000;

export interface CadModelInput {
  name: string;
  fusionUrl?: string | null;
}

export async function createCadModel(input: CadModelInput) {
  const [created] = await db
    .insert(cadModel)
    .values({
      name: input.name,
      fusionUrl: input.fusionUrl || null,
      status: "draft",
    })
    .returning({ id: cadModel.id });
  return created;
}

export async function updateCadModel(id: string, input: Partial<CadModelInput>) {
  const [updated] = await db
    .update(cadModel)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.fusionUrl !== undefined
        ? { fusionUrl: input.fusionUrl || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(cadModel.id, id))
    .returning({ id: cadModel.id });
  return updated ?? null;
}

export async function listCadModels() {
  return db.query.cadModel.findMany({ orderBy: desc(cadModel.updatedAt) });
}

export async function getCadModel(id: string) {
  const [row] = await db.select().from(cadModel).where(eq(cadModel.id, id));
  return row ?? null;
}

export async function deleteCadModel(id: string) {
  const row = await getCadModel(id);
  if (!row) return null;
  // Best-effort blob cleanup; always remove the row.
  for (const url of [row.sourceStlUrl, row.glbUrl]) {
    if (url) {
      try {
        await del(url);
      } catch (err) {
        console.error("CAD blob delete failed (continuing):", err);
      }
    }
  }
  await db.delete(cadModel).where(eq(cadModel.id, id));
  return { id };
}

// ── Fully-automated Fusion → GLB ────────────────────────────────────
// "Generate from Fusion": fire Autodesk's STL export (server-side GET) to the
// requesting admin's email, then a cron reads the export email back out of
// their inbox, downloads the STL, and converts it. No manual STL handling.

export async function requestFusionExport(
  cadModelId: string,
  userId: string,
  userEmail: string,
): Promise<void> {
  const model = await getCadModel(cadModelId);
  if (!model) throw new Error("CAD model not found.");
  if (!model.fusionUrl) {
    throw new Error("Add a Fusion share link to this model first.");
  }
  // Disambiguation: the export email carries no reliable per-model marker
  // (Autodesk strips plus-address tags; the doc name isn't readable server-
  // side). So we serialize — only one export in flight per requester's inbox
  // at a time — which makes "newest export email after the request" an exact
  // match. Concurrent requests to the same inbox are rejected, not mismatched.
  const inFlight = await db
    .select({ id: cadModel.id, name: cadModel.name })
    .from(cadModel)
    .where(
      and(
        eq(cadModel.status, "awaiting_export"),
        eq(cadModel.exportRequestedByUserId, userId),
      ),
    );
  if (inFlight.length > 0) {
    throw new Error(
      `Another Fusion export is already in progress ("${inFlight[0].name}"). Wait ~a minute for it to finish, then try again.`,
    );
  }

  const share = await resolveFusionShare(model.fusionUrl);
  if (!share) {
    throw new Error("Couldn't resolve that Fusion link to a share.");
  }
  await triggerStlExport(share.host, share.shareId, userEmail);
  await db
    .update(cadModel)
    .set({
      status: "awaiting_export",
      exportRequestedAt: new Date(),
      exportRequestedByUserId: userId,
      expectedFilename: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(cadModel.id, cadModelId));
}

// Cron worker: complete every model waiting on its Autodesk export email.
// Finds the email in the requester's inbox, downloads the STL, converts.
export async function processPendingExports(): Promise<{
  processed: number;
  pending: number;
  failed: number;
}> {
  const waiting = await db
    .select()
    .from(cadModel)
    .where(eq(cadModel.status, "awaiting_export"));

  let processed = 0;
  let failed = 0;
  let stillPending = 0;

  for (const m of waiting) {
    const since = m.exportRequestedAt?.getTime() ?? 0;
    try {
      const link = m.exportRequestedByUserId
        ? await findStlExportLink(m.exportRequestedByUserId, { sinceMs: since })
        : null;

      if (!link) {
        if (since && Date.now() - since > EXPORT_TIMEOUT_MS) {
          await db
            .update(cadModel)
            .set({
              status: "failed",
              errorMessage:
                "Didn't find the Autodesk export email within an hour.",
              updatedAt: new Date(),
            })
            .where(eq(cadModel.id, m.id));
          failed++;
        } else {
          stillPending++;
        }
        continue;
      }

      const res = await fetch(link);
      if (!res.ok) throw new Error(`STL download failed (${res.status}).`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File([bytes], m.expectedFilename ?? `${m.name}.stl`, {
        type: "model/stl",
      });
      // Reuses the same convert + store path as a manual upload.
      await processStl(m.id, file);
      processed++;
    } catch (err) {
      console.error(`Fusion export processing failed for ${m.id}:`, err);
      await db
        .update(cadModel)
        .set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Export failed.",
          updatedAt: new Date(),
        })
        .where(eq(cadModel.id, m.id));
      failed++;
    }
  }

  return { processed, pending: stillPending, failed };
}

// Upload an STL, convert it to a GLB, and store both in Vercel Blob. This is
// the automated heart of "Upload Model to Website": no Python/browser/email,
// just STL bytes → metallic GLB, reusable across every SKU that picks this
// model. Marks the row `processing` → `ready` (or `failed` with a message).
export async function processStl(
  id: string,
  file: File,
): Promise<{ glbUrl: string }> {
  await db
    .update(cadModel)
    .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
    .where(eq(cadModel.id, id));

  try {
    const stlBytes = new Uint8Array(await file.arrayBuffer());
    const stlBlob = await put(`cad/${id}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    const { glb, vertexCount, triangleCount } = await stlToGlb(stlBytes);
    const glbBlob = await put(`cad/${id}/model.glb`, Buffer.from(glb), {
      access: "public",
      addRandomSuffix: true,
      contentType: "model/gltf-binary",
    });

    await db
      .update(cadModel)
      .set({
        sourceStlUrl: stlBlob.url,
        sourceFilename: file.name,
        glbUrl: glbBlob.url,
        vertexCount,
        triangleCount,
        status: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(cadModel.id, id));

    return { glbUrl: glbBlob.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed.";
    await db
      .update(cadModel)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(cadModel.id, id));
    throw err;
  }
}

// Re-run STL → GLB for a model that already has a stored source STL, rebuilding
// the GLB with the current converter (e.g. after a shading/normals improvement).
// Reuses the same source bytes — no Fusion export or re-upload needed — and
// overwrites the model's `glbUrl`. SKUs already linked to this model pick up the
// new GLB automatically (the link is by id; the URL is read fresh).
export async function reconvertCadModel(id: string): Promise<{ glbUrl: string }> {
  const model = await db.query.cadModel.findFirst({
    where: eq(cadModel.id, id),
  });
  if (!model) throw new Error(`CAD model ${id} not found.`);
  if (!model.sourceStlUrl) {
    throw new Error(
      `CAD model ${id} has no stored source STL to re-convert from.`,
    );
  }

  await db
    .update(cadModel)
    .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
    .where(eq(cadModel.id, id));

  try {
    const res = await fetch(model.sourceStlUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch source STL (${res.status}).`);
    }
    const stlBytes = new Uint8Array(await res.arrayBuffer());

    const { glb, vertexCount, triangleCount } = await stlToGlb(stlBytes);
    const glbBlob = await put(`cad/${id}/model.glb`, Buffer.from(glb), {
      access: "public",
      addRandomSuffix: true,
      contentType: "model/gltf-binary",
    });

    // Drop the old GLB blob so we don't leak orphaned files on every re-convert.
    const oldGlbUrl = model.glbUrl;

    await db
      .update(cadModel)
      .set({
        glbUrl: glbBlob.url,
        vertexCount,
        triangleCount,
        status: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(cadModel.id, id));

    if (oldGlbUrl && oldGlbUrl !== glbBlob.url) {
      await del(oldGlbUrl).catch(() => {});
    }

    return { glbUrl: glbBlob.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed.";
    await db
      .update(cadModel)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(cadModel.id, id));
    throw err;
  }
}
