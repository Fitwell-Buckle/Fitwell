import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestFusionExport } from "@/lib/cad/service";

export const runtime = "nodejs";

// Kick off the automated Fusion → STL → GLB pipeline for a CAD model. Fires
// Autodesk's export to the signed-in admin's email; a cron reads it back from
// their inbox and converts it. Requires the model to have a Fusion link.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.id || !session.user.email) {
    return NextResponse.json(
      { error: "Your account has no email/Google connection to receive the export." },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    await requestFusionExport(id, session.user.id, session.user.email);
    return NextResponse.json({ data: { id, status: "awaiting_export" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start export.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
