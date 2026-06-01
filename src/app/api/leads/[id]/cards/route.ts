import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addLeadCardImage, getLead } from "@/lib/crm/service";

// Attach a card image — already uploaded to Vercel Blob — to an existing
// lead. Used by the capture flow's "attach to existing instead of creating
// new" path: scan-card has already done the Blob upload, so we just record
// the association.
//
// Accepts a JSON body so the multipart re-upload round-trip is avoided.
// (A future multipart variant could be added if we ever need to attach an
// image from somewhere other than the capture flow.)
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
  const existing = await getLead(id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
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
    const record = await addLeadCardImage({
      leadId: id,
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
    console.error("attach lead card failed:", err);
    return NextResponse.json(
      { error: "Card attach failed" },
      { status: 500 },
    );
  }
}
