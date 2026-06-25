import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCadModel, processSourceModel } from "@/lib/cad/service";

export const runtime = "nodejs";
// Conversion + two blob uploads can run a few seconds on larger meshes.
export const maxDuration = 60;

// Server functions cap bodies ~4.5MB; meshes are usually well under that.
const MAX_BYTES = 25 * 1024 * 1024;

// Upload a source model (STL or OBJ) for a CAD model → convert to GLB → store
// both. This is the automated pipeline: source in, website-ready metallic GLB
// out, all server-side. OBJ carries Fusion's per-face appearance names (satin/
// cast finishes); STL is geometry-only and renders everything polished.
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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured — set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const model = await getCadModel(id);
  if (!model) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
    return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 413 });
  }
  if (!/\.(stl|obj)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Please upload an STL (.stl) or OBJ (.obj) file." },
      { status: 400 },
    );
  }

  try {
    const { glbUrl } = await processSourceModel(id, file);
    return NextResponse.json({ data: { id, glbUrl } }, { status: 201 });
  } catch (err) {
    console.error("CAD model conversion failed:", err);
    const message =
      err instanceof Error ? err.message : "Conversion failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
