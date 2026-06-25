import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplierContact } from "@/lib/schema";
import { getPrototypeDetail, markRfqSent } from "@/lib/prototypes/service";
import { buildRfqEmailHtml } from "@/lib/prototypes/rfq-email";
import { sendEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

const bodySchema = z.object({
  to: z.string().email(),
  cc: z.array(z.string().email()).max(20).optional(),
  message: z.string().max(5000).nullish(),
});

// Email a candidate vendor a Request for Quote for this prototype, using the
// same path as PO sends (Resend; auto-CC the vendor's other contacts + the
// sender; reply-to the sender so quotes come back to them). Stamps rfq_sent_at.
// Admin-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, supplierId } = await params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const proto = await getPrototypeDetail(id);
  if (!proto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const vendor = proto.candidateVendors.find((cv) => cv.supplierId === supplierId);
  if (!vendor) {
    return NextResponse.json(
      { error: "That vendor isn’t a candidate on this prototype." },
      { status: 404 },
    );
  }

  // CC = the sender + any CCs entered + every other contact for this vendor,
  // deduped/lowercased, with the To filtered out (mirrors the PO send).
  const contacts = await db
    .select({ email: supplierContact.email })
    .from(supplierContact)
    .where(eq(supplierContact.supplierId, supplierId));
  const toLower = input.to.toLowerCase();
  const cc = Array.from(
    new Set(
      [session.user.email, ...(input.cc ?? []), ...contacts.map((c) => c.email)]
        .filter((x): x is string => Boolean(x))
        .map((x) => x.toLowerCase())
        .filter((x) => x !== toLower),
    ),
  );

  try {
    await sendEmail({
      to: input.to,
      cc: cc.length ? cc : undefined,
      replyTo: session.user.email ?? undefined,
      subject: `Request for Quote — ${proto.name} — Fitwell Buckle Co.`,
      html: buildRfqEmailHtml({
        vendorName: vendor.supplier?.name ?? "there",
        prototypeName: proto.name,
        proposedSku: proto.proposedSku,
        description: proto.description,
        message: input.message ?? null,
        fusionLinks: proto.references.map((r) => ({
          url: r.url,
          title: r.title,
        })),
      }),
    });
    await markRfqSent(id, supplierId);
    return NextResponse.json({ data: { sentTo: [input.to], cc } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    if (message.includes("RESEND_API_KEY")) {
      return NextResponse.json(
        { error: "Email not configured — set RESEND_API_KEY." },
        { status: 503 },
      );
    }
    console.error("RFQ send failed:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
