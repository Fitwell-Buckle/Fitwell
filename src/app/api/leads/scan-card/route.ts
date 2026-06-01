import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import {
  extractBusinessCard,
  type SupportedImageMediaType,
} from "@/lib/ai/anthropic";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME: ReadonlySet<SupportedImageMediaType> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function isSupportedMime(s: string): s is SupportedImageMediaType {
  return (ALLOWED_MIME as ReadonlySet<string>).has(s);
}

// Upload a business-card image and return the extracted fields. Does NOT
// persist a lead — the client follows up with POST /api/leads once the user
// has reviewed/edited the extraction.
export async function POST(req: Request) {
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Vision model not configured — set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fall through to no-file error */
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
  if (!isSupportedMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }
  const mediaType: SupportedImageMediaType = file.type;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(`leads/cards/${file.name || "card"}`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: mediaType,
    });
    const extracted = await extractBusinessCard({
      imageBase64: buffer.toString("base64"),
      mediaType,
    });
    return NextResponse.json(
      {
        data: {
          ...extracted,
          cardImageUrl: blob.url,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("scan-card failed:", err);
    return NextResponse.json(
      { error: "Card scan failed" },
      { status: 500 },
    );
  }
}
