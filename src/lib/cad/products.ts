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

export interface PushResult {
  /** One pushed model per variant that had a linked, ready model. */
  pushed: { sku: string; variantTitle: string | null; mediaId: string }[];
  /** Variants skipped because they have no linked/ready model. */
  skipped: { sku: string; variantTitle: string | null; reason: string }[];
}

// Push the SKU's linked model to its Shopify product as native 3D media, baked
// in the SKU's colour. Shopify attaches 3D media at the PRODUCT level only —
// models/video cannot be tied to a variant (only images can), so this is one
// model per product, not per size. The previous per-variant attempt failed on
// Shopify's "Non-image media cannot be attached to variants" — per-size
// switching needs a custom theme integration instead (see notes). Writes to the
// live storefront, so it's a deliberate, separate action from the in-app publish.
export async function pushToShopify(sku: string): Promise<PushResult> {
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
  const productId = variant.shopifyProductId;

  const res = await fetch(link.glbUrl);
  if (!res.ok) throw new Error("Could not read the generated GLB.");
  const storedGlb = new Uint8Array(await res.arrayBuffer());

  // Bake this SKU's finish (the stored GLB is silver; the portal recolor is
  // client-only, so Shopify needs it baked in).
  const finishId =
    matchFinish(
      [variant.color, variant.title, variant.variantTitle]
        .filter(Boolean)
        .join(" "),
    )?.id ?? null;
  const glb = await applyFinishToGlb(storedGlb, finishId);

  const { mediaId } = await pushModelToShopify({
    productId,
    glb,
    filename: `${sku.replace(/[^a-zA-Z0-9._-]/g, "_")}.glb`,
    alt: link.modelName ?? sku,
  });

  // Replace every other model on the product (incl. junk left by the failed
  // per-variant attempts) so exactly one clean model remains.
  const existingModelIds = await listProductModelMediaIds(productId);
  for (const id of existingModelIds) {
    if (id !== mediaId) await deleteProductMedia({ productId, mediaId: id });
  }

  await db
    .update(productCadModel)
    .set({
      shopifyProductId: productId,
      shopifyMediaId: mediaId,
      shopifyPublishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productCadModel.sku, sku));

  return {
    pushed: [{ sku, variantTitle: variant.variantTitle, mediaId }],
    skipped: [],
  };
}

