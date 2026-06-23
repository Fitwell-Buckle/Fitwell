import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cadModel, productCadModel } from "@/lib/schema";
import { getCatalogCached } from "@/lib/catalog/load";
import {
  pushModelToShopify,
  deleteProductMedia,
  listProductModelMediaIds,
} from "./shopify-media";
import { applyFinishToGlb } from "./stl-to-glb";
import { matchFinish } from "./finishes";

// CAD models that have a finished GLB — the ones eligible to publish to a SKU.
export async function listReadyCadModels() {
  return db
    .select({
      id: cadModel.id,
      name: cadModel.name,
      glbUrl: cadModel.glbUrl,
      status: cadModel.status,
    })
    .from(cadModel)
    .where(and(eq(cadModel.status, "ready"), isNotNull(cadModel.glbUrl)))
    .orderBy(desc(cadModel.updatedAt));
}

export interface ProductCadLink {
  sku: string;
  cadModelId: string | null;
  modelName: string | null;
  glbUrl: string | null;
  modelStatus: string | null;
  publishedToWebsiteAt: Date | null;
  shopifyMediaId: string | null;
  shopifyPublishedAt: Date | null;
}

export async function getProductCadModel(
  sku: string,
): Promise<ProductCadLink | null> {
  const [row] = await db
    .select({
      sku: productCadModel.sku,
      cadModelId: productCadModel.cadModelId,
      modelName: cadModel.name,
      glbUrl: cadModel.glbUrl,
      modelStatus: cadModel.status,
      publishedToWebsiteAt: productCadModel.publishedToWebsiteAt,
      shopifyMediaId: productCadModel.shopifyMediaId,
      shopifyPublishedAt: productCadModel.shopifyPublishedAt,
    })
    .from(productCadModel)
    .leftJoin(cadModel, eq(productCadModel.cadModelId, cadModel.id))
    .where(eq(productCadModel.sku, sku));
  return row ?? null;
}

// Link (or relink) a SKU to a saved CAD model. Upsert keyed by SKU.
export async function linkCadModel(sku: string, cadModelId: string | null) {
  await db
    .insert(productCadModel)
    .values({ sku, cadModelId })
    .onConflictDoUpdate({
      target: productCadModel.sku,
      set: { cadModelId, updatedAt: new Date() },
    });
}

// Push the SKU's linked model to its Shopify product as native 3D media.
// Resolves the Shopify product from the SKU via the catalog. Writes to the
// live storefront, so it's a deliberate, separate action from the in-app
// publish.
export async function pushToShopify(
  sku: string,
): Promise<{ mediaId: string; status: string }> {
  const link = await getProductCadModel(sku);
  if (!link?.cadModelId) throw new Error("Link a CAD model to this SKU first.");
  if (link.modelStatus !== "ready" || !link.glbUrl) {
    throw new Error("That CAD model has no finished 3D model yet.");
  }

  const catalog = await getCatalogCached();
  const variant = catalog.find((v) => v.sku === sku);
  if (!variant?.shopifyProductId) {
    throw new Error("No Shopify product found for this SKU.");
  }

  const res = await fetch(link.glbUrl);
  if (!res.ok) throw new Error("Could not read the generated GLB.");
  const storedGlb = new Uint8Array(await res.arrayBuffer());

  // Bake this SKU's finish into the GLB before handing it to Shopify. The stored
  // GLB is silver (the default) and the portal viewer recolors it live, but that
  // recolor never leaves the browser — so without this, Shopify always shows
  // silver. Match the finish from the same fields the product page uses.
  const finishText = [variant.color, variant.title, variant.variantTitle]
    .filter(Boolean)
    .join(" ");
  const finishId = matchFinish(finishText)?.id ?? null;
  const glb = await applyFinishToGlb(storedGlb, finishId);

  const { mediaId, status } = await pushModelToShopify({
    productId: variant.shopifyProductId,
    glb,
    filename: `${sku.replace(/[^a-zA-Z0-9._-]/g, "_")}.glb`,
    alt: link.modelName ?? sku,
  });

  // Remove EVERY other 3D model on the product so a recolored re-push fully
  // replaces them — not just the one id we last tracked. Earlier pushes (before
  // this cleanup existed) can leave stale silver models behind that the
  // storefront then shows instead of the new one. Done after the new media is
  // created so a delete failure can't leave the product with no model.
  const priorMediaIds = await listProductModelMediaIds(variant.shopifyProductId);
  for (const priorId of priorMediaIds) {
    if (priorId !== mediaId) {
      await deleteProductMedia({
        productId: variant.shopifyProductId,
        mediaId: priorId,
      });
    }
  }

  await db
    .update(productCadModel)
    .set({
      shopifyProductId: variant.shopifyProductId,
      shopifyMediaId: mediaId,
      shopifyPublishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productCadModel.sku, sku));

  return { mediaId, status };
}

