import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cadModel, productCadModel } from "@/lib/schema";
import { getCatalogCached } from "@/lib/catalog/load";
import {
  pushModelToShopify,
  deleteProductMedia,
  listProductModelMediaIds,
  appendVariantMedia,
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

// Push 3D models for a product to its Shopify product as native 3D media — one
// per size variant, each baked in that variant's colour and ASSOCIATED with its
// variant so the storefront swaps the model when a shopper picks a size. The
// caller passes any one SKU of the product; we resolve the whole product and
// push every variant that has a linked, finished model. Writes to the live
// storefront, so it's a deliberate, separate action from the in-app publish.
export async function pushToShopify(sku: string): Promise<PushResult> {
  const catalog = await getCatalogCached();
  const variant = catalog.find((v) => v.sku === sku);
  if (!variant?.shopifyProductId) {
    throw new Error("No Shopify product found for this SKU.");
  }
  const productId = variant.shopifyProductId;

  // Every variant of this product (e.g. each size), and the CAD model linked to
  // each. Color variants live in separate products, so a product's variants
  // share a colour but differ by size — exactly the per-size model switch.
  const productVariants = catalog.filter(
    (v) => v.shopifyProductId === productId && v.sku,
  );
  const links = await db
    .select({
      sku: productCadModel.sku,
      cadModelId: productCadModel.cadModelId,
      glbUrl: cadModel.glbUrl,
      status: cadModel.status,
      name: cadModel.name,
    })
    .from(productCadModel)
    .leftJoin(cadModel, eq(productCadModel.cadModelId, cadModel.id))
    .where(
      inArray(
        productCadModel.sku,
        productVariants.map((v) => v.sku),
      ),
    );
  const linkBySku = new Map(links.map((l) => [l.sku, l]));

  const ready = productVariants
    .map((v) => ({ v, link: linkBySku.get(v.sku) }))
    .filter(
      (x) => x.link?.cadModelId && x.link.status === "ready" && x.link.glbUrl,
    );
  if (ready.length === 0) {
    throw new Error(
      "Link a finished CAD model to at least one of this product's size variants first.",
    );
  }

  // Snapshot the product's existing 3D media so we can clear stale models (the
  // old product-level model + any prior per-variant pushes) once the new ones
  // are in place — leaving exactly one model per size.
  const existingModelIds = await listProductModelMediaIds(productId);

  const pushed: PushResult["pushed"] = [];
  for (const { v, link } of ready) {
    const res = await fetch(link!.glbUrl!);
    if (!res.ok) continue;
    const storedGlb = new Uint8Array(await res.arrayBuffer());

    // Bake this variant's finish (the stored GLB is silver; the recolor is
    // client-only in the portal, so Shopify needs it baked in).
    const finishId =
      matchFinish(
        [v.color, v.title, v.variantTitle].filter(Boolean).join(" "),
      )?.id ?? null;
    const glb = await applyFinishToGlb(storedGlb, finishId);

    const { mediaId } = await pushModelToShopify({
      productId,
      glb,
      filename: `${v.sku.replace(/[^a-zA-Z0-9._-]/g, "_")}.glb`,
      alt: `${link!.name ?? v.sku} — ${v.variantTitle ?? v.sku}`,
    });
    // Tie the model to this specific variant so selecting the size shows it.
    await appendVariantMedia({
      productId,
      variantId: v.shopifyVariantId,
      mediaIds: [mediaId],
    });
    pushed.push({ sku: v.sku, variantTitle: v.variantTitle, mediaId });
  }

  // Clear every model that existed before this push (legacy product-level model
  // + superseded per-variant models). Deleting a media also drops its variant
  // associations, so only the freshly associated models remain.
  const keep = new Set(pushed.map((p) => p.mediaId));
  for (const id of existingModelIds) {
    if (!keep.has(id)) await deleteProductMedia({ productId, mediaId: id });
  }

  // Record per-variant publish state.
  const now = new Date();
  for (const p of pushed) {
    await db
      .update(productCadModel)
      .set({
        shopifyProductId: productId,
        shopifyMediaId: p.mediaId,
        shopifyPublishedAt: now,
        updatedAt: now,
      })
      .where(eq(productCadModel.sku, p.sku));
  }

  const skipped: PushResult["skipped"] = productVariants
    .filter((v) => !pushed.some((p) => p.sku === v.sku))
    .map((v) => ({
      sku: v.sku,
      variantTitle: v.variantTitle,
      reason: linkBySku.get(v.sku)?.cadModelId
        ? "model not finished yet"
        : "no model linked",
    }));

  return { pushed, skipped };
}

