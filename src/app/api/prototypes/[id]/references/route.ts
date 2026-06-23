import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addReference } from "@/lib/prototypes/service";
import { isAllowedFusionUrl, resolveFusionEmbed } from "@/lib/prototypes/fusion";
import { referenceSchema } from "../../_schema";

export const runtime = "nodejs";

// Attach an Autodesk Fusion ("AutoCAD Fusion") share link to a prototype. The
// link is validated to an Autodesk host, then its redirects are resolved
// server-side to build an embeddable viewer URL for the inline 3D preview.
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

  let input;
  try {
    input = referenceSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (!isAllowedFusionUrl(input.url)) {
    return NextResponse.json(
      {
        error:
          "Only Autodesk Fusion share links are supported (a360.co or autodesk360.com).",
      },
      { status: 400 },
    );
  }

  try {
    // Best-effort: if resolution fails we still store the raw link (no preview).
    const resolved = await resolveFusionEmbed(input.url);
    const created = await addReference({
      prototypeId: id,
      url: input.url,
      embedUrl: resolved?.embedUrl ?? null,
      title: input.title ?? null,
    });
    return NextResponse.json(
      { data: { id: created.id, embedUrl: resolved?.embedUrl ?? null } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Add prototype reference failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
