import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { addAttachment } from "@/lib/production/service";

export const runtime = "nodejs";

// Max upload through this server route. Larger files would need Vercel Blob
// client-direct upload (deployed serverless functions cap bodies at ~4.5MB).
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured — set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

  const { id } = await params;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fall through to the no-file error */
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 413 },
    );
  }

  try {
    const blob = await put(`production/po/${id}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    const attachment = await addAttachment({
      poId: id,
      blobUrl: blob.url,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedByUserId: session.user.id,
    });
    return NextResponse.json(
      { data: { id: attachment.id, url: blob.url, filename: file.name } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Attachment upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
