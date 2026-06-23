import "server-only";
import { getShopifyClient } from "@/lib/shopify/client";

// Push a GLB to a Shopify product's 3D media (the native spinnable viewer on
// the storefront). Flow: stagedUploadsCreate → upload the bytes to the staged
// target → productCreateMedia(MODEL_3D). Requires the write_products scope.
// The model processes async on Shopify's side (PROCESSING → READY); we return
// the media id immediately.

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

export async function pushModelToShopify(opts: {
  productId: string; // numeric id or gid
  glb: Uint8Array;
  filename: string;
  alt: string;
}): Promise<{ mediaId: string; status: string }> {
  const client = getShopifyClient();
  const productGid = opts.productId.startsWith("gid://")
    ? opts.productId
    : `gid://shopify/Product/${opts.productId}`;

  // 1) Reserve a staged upload target.
  const staged = await client.graphql<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[];
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename: opts.filename,
          mimeType: "model/gltf-binary",
          resource: "MODEL_3D",
          httpMethod: "POST",
          fileSize: String(opts.glb.byteLength),
        },
      ],
    },
  );

  const sErrors = staged.stagedUploadsCreate.userErrors;
  if (sErrors.length) {
    throw new Error(`stagedUploadsCreate: ${sErrors.map((e) => e.message).join("; ")}`);
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("Shopify returned no staged upload target.");

  // 2) Upload the bytes to the staged target (multipart; params first, file last).
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append(
    "file",
    new Blob([opts.glb as BlobPart], { type: "model/gltf-binary" }),
    opts.filename,
  );
  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok && up.status !== 201 && up.status !== 204) {
    const body = await up.text().catch(() => "");
    throw new Error(`Staged upload failed (${up.status}): ${body.slice(0, 300)}`);
  }

  // 3) Attach the uploaded resource to the product as a 3D model.
  const created = await client.graphql<{
    productCreateMedia: {
      media: { id: string; status: string }[];
      mediaUserErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id status mediaContentType }
        mediaUserErrors { field message }
      }
    }`,
    {
      productId: productGid,
      media: [
        {
          originalSource: target.resourceUrl,
          mediaContentType: "MODEL_3D",
          alt: opts.alt,
        },
      ],
    },
  );

  const mErrors = created.productCreateMedia.mediaUserErrors;
  if (mErrors.length) {
    throw new Error(`productCreateMedia: ${mErrors.map((e) => e.message).join("; ")}`);
  }
  const media = created.productCreateMedia.media[0];
  if (!media) throw new Error("Shopify created no media.");
  return { mediaId: media.id, status: media.status };
}
