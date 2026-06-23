import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import type { Session } from "next-auth";
import { addAttachment } from "./service";

// Max upload through this server route. Larger files would need Vercel Blob
// client-direct upload (deployed serverless functions cap bodies at ~4.5MB).
const MAX_BYTES = 10 * 1024 * 1024;

// Shared handler for prototype + round photo/file uploads. Exactly one of
// prototypeId / roundId should be set (enforced by the table's CHECK).
export async function handleUpload(
  req: Request,
  session: Session,
  parent: { prototypeId?: string; roundId?: string },
  pathPrefix: string,
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured — set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

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
    const blob = await put(`${pathPrefix}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    const attachment = await addAttachment({
      prototypeId: parent.prototypeId ?? null,
      roundId: parent.roundId ?? null,
      blobUrl: blob.url,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedByUserId: session.user?.id ?? null,
    });
    return NextResponse.json(
      { data: { id: attachment.id, url: blob.url, filename: file.name } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Prototype attachment upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
