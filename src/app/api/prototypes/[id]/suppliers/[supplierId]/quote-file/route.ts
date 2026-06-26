import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { setPrototypeQuoteFile } from "@/lib/prototypes/service";

export const runtime = "nodejs";

// Server routes cap bodies at ~4.5MB on Vercel; 10MB matches the other
// prototype uploads (larger would need client-direct Blob upload).
const MAX_BYTES = 10 * 1024 * 1024;

async function guard() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

// Upload (replacing any existing) the vendor's quote document for this
// prototype, storing it on the prototype_supplier row. Admin-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured — set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

  const { id, supplierId } = await params;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fall through */
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  try {
    const blob = await put(
      `prototypes/${id}/quotes/${supplierId}/${file.name}`,
      file,
      { access: "public", addRandomSuffix: true },
    );
    const res = await setPrototypeQuoteFile(id, supplierId, {
      url: blob.url,
      name: file.name,
    });
    if (!res.found) {
      await del(blob.url).catch(() => {});
      return NextResponse.json(
        { error: "That vendor isn’t a candidate on this prototype." },
        { status: 404 },
      );
    }
    // Replaced an older file → drop the orphaned blob.
    if (res.previousUrl && res.previousUrl !== blob.url) {
      await del(res.previousUrl).catch(() => {});
    }
    return NextResponse.json(
      { data: { url: blob.url, filename: file.name } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Quote file upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// Remove the vendor's quote document. Admin-only.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id, supplierId } = await params;
  try {
    const res = await setPrototypeQuoteFile(id, supplierId, null);
    if (!res.found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (res.previousUrl) await del(res.previousUrl).catch(() => {});
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Quote file delete failed:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
