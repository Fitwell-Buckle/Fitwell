import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { addVoiceNote, listVoiceNotes } from "@/lib/tradeshows/service";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // ~25MB — generous for a booth memo.

// Audio MIME types browsers produce via MediaRecorder. iOS Safari emits
// mp4/aac; Chrome/Android emit webm/ogg.
const ALLOWED_PREFIX = "audio/";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { vendorId } = await params;
  const rows = await listVoiceNotes(vendorId);
  return NextResponse.json({ data: rows });
}

// Upload a recorded booth memo: stores the audio in Vercel Blob and records a
// voice-note row (with the optional on-device dictation transcript).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
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

  const { vendorId } = await params;

  let file: File | null = null;
  let transcript: string | null = null;
  let durationSec: number | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const t = form.get("transcript");
    if (typeof t === "string" && t.trim()) transcript = t.trim();
    const d = form.get("durationSec");
    if (typeof d === "string" && d) {
      const n = Number(d);
      if (Number.isFinite(n) && n >= 0) durationSec = n;
    }
  } catch {
    /* fall through to no-file error */
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Audio too large (max 25MB)" },
      { status: 413 },
    );
  }
  if (!file.type.startsWith(ALLOWED_PREFIX)) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(
      `trade-show-vendors/${vendorId}/voice-notes/${file.name || "note"}`,
      buffer,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
      },
    );
    const { id } = await addVoiceNote(
      vendorId,
      {
        blobUrl: blob.url,
        contentType: file.type,
        sizeBytes: buffer.byteLength,
        durationSec,
        transcript,
      },
      session.user.id,
    );
    return NextResponse.json(
      { data: { id, blobUrl: blob.url, transcript, durationSec } },
      { status: 201 },
    );
  } catch (err) {
    console.error("trade-show vendor voice-note upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
