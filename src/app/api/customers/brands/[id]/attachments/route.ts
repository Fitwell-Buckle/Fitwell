import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyAttachment } from "@/lib/schema";

// Upload a document to a B2B company (from its profile's Activity tab). Vercel
// Blob + a company_attachment row. Admin-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  try {
    const blob = await put(`company/${id}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    const [row] = await db
      .insert(companyAttachment)
      .values({
        companyId: id,
        blobUrl: blob.url,
        filename: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
        uploadedByUserId: session.user.id,
      })
      .returning({ id: companyAttachment.id });
    return NextResponse.json(
      { data: { id: row.id, url: blob.url, filename: file.name } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Company attachment upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
