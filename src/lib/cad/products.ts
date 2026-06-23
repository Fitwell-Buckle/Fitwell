import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cadModel, productCadModel } from "@/lib/schema";
import { getCatalogCached } from "@/lib/catalog/load";
import { pushModelToShopify } from "./shopify-media";

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

// Publish the linked model to the in-app public per-SKU viewer. Requires a
// linked, ready model with a GLB.
export async function publishToWebsite(sku: string) {
  const link = await getProductCadModel(sku);
  if (!link?.cadModelId) {
    throw new Error("Link a CAD model to this SKU first.");
  }
  if (link.modelStatus !== "ready" || !link.glbUrl) {
    throw new Error("That CAD model has no finished 3D model yet.");
  }
  await db
    .update(productCadModel)
    .set({ publishedToWebsiteAt: new Date(), updatedAt: new Date() })
    .where(eq(productCadModel.sku, sku));
  return { glbUrl: link.glbUrl };
}

export async function unpublishFromWebsite(sku: string) {
  await db
    .update(productCadModel)
    .set({ publishedToWebsiteAt: null, updatedAt: new Date() })
    .where(eq(productCadModel.sku, sku));
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
  const glb = new Uint8Array(await res.arrayBuffer());

  const { mediaId, status } = await pushModelToShopify({
    productId: variant.shopifyProductId,
    glb,
    filename: `${sku.replace(/[^a-zA-Z0-9._-]/g, "_")}.glb`,
    alt: link.modelName ?? sku,
  });

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

// For the public /3d/[sku] page: the GLB to show, only if published + ready.
export async function getPublishedModelForSku(
  sku: string,
): Promise<{ glbUrl: string; name: string } | null> {
  const link = await getProductCadModel(sku);
  if (!link || !link.publishedToWebsiteAt) return null;
  if (link.modelStatus !== "ready" || !link.glbUrl) return null;
  return { glbUrl: link.glbUrl, name: link.modelName ?? sku };
}
