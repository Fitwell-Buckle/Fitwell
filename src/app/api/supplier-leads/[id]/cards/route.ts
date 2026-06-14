import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  addSupplierLeadCardImage,
  getSupplierLead,
} from "@/lib/suppliers/lead-service";

// Attach a card image — already uploaded to Vercel Blob by scan-card — to an
// existing supplier lead. JSON body avoids a multipart re-upload round-trip.
const bodySchema = z.object({
  blobUrl: z.string().url().max(2000),
  contentType: z.string().max(120).nullish(),
  sizeBytes: z.number().int().positive().nullish(),
});

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
  const existing = await getSupplierLead(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Supplier lead not found" },
      { status: 404 },
    );
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const record = await addSupplierLeadCardImage({
      supplierLeadId: id,
      blobUrl: body.blobUrl,
      contentType: body.contentType ?? null,
      sizeBytes: body.sizeBytes ?? null,
      uploadedByUserId: session.user.id,
    });
    return NextResponse.json(
      { data: { id: record.id, blobUrl: body.blobUrl } },
      { status: 201 },
    );
  } catch (err) {
    console.error("attach supplier lead card failed:", err);
    return NextResponse.json({ error: "Card attach failed" }, { status: 500 });
  }
}
