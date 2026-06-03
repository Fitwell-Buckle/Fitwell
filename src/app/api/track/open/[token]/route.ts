import { NextRequest } from "next/server";
import { recordOpen } from "@/lib/crm/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A 1×1 fully-transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// Public (no auth) open-tracking endpoint. A recipient's mail client loads
// <img src=".../api/track/open/{token}.gif"> when the email is opened; we
// record the open and return the pixel. Always returns the image — tracking is
// best-effort and must never break image loading. Caching is disabled so each
// open hits the server.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const clean = token.replace(/\.gif$/i, "").trim();
  if (clean) {
    try {
      await recordOpen(clean);
    } catch (err) {
      console.error("track open failed:", err);
    }
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
