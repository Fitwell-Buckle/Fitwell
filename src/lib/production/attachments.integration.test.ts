import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real upload + download cycle through Vercel Blob and the DB. Runs only when
// BOTH a dev DB (TEST_DATABASE_URL) and a Blob token (BLOB_READ_WRITE_TOKEN)
// are present; otherwise the suite self-skips.
const skip = !process.env.TEST_DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN;

const RUN = Date.now();

describe.skipIf(skip)("production attachments (real Blob + DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");
  let blob: typeof import("@vercel/blob");
  let supplierId: string;
  let poId: string;
  let blobUrl: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");
    blob = await import("@vercel/blob");

    const [s] = await db
      .insert(schema.supplier)
      .values({ name: `itest-att-supplier-${RUN}` })
      .returning({ id: schema.supplier.id });
    supplierId = s.id;
    ({ poId } = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [{ sku: "A", title: "Buckle A", quantity: 1 }],
    }));
  });

  afterAll(async () => {
    if (skip) return;
    if (blobUrl) await blob.del(blobUrl).catch(() => {});
    await db.delete(schema.productionPo).where(eq(schema.productionPo.id, poId));
    await db.delete(schema.supplier).where(eq(schema.supplier.id, supplierId));
  });

  it("uploads a blob, records it, and the URL is downloadable", async () => {
    const body = `hello ${RUN}`;
    const put = await blob.put(`production/itest/${RUN}.txt`, body, {
      access: "public",
      addRandomSuffix: true,
    });
    blobUrl = put.url;

    const att = await svc.addAttachment({
      poId,
      blobUrl: put.url,
      filename: `${RUN}.txt`,
      contentType: "text/plain",
      sizeBytes: body.length,
    });

    const po = await svc.getPoDetail(poId);
    expect(po?.attachments.some((a) => a.id === att.id)).toBe(true);

    // The public URL is downloadable and round-trips the content.
    const res = await fetch(put.url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });
});
