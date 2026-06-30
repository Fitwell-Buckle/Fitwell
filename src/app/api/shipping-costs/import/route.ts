import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseBillingCsv, importShippingCharges } from "@/lib/shopify/billing-csv";

export const runtime = "nodejs";

// Serverless function bodies cap at ~4.5MB on Vercel; a year of bills is tiny
// (the sample export was <200KB), so 10MB is plenty of headroom.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Import a Shopify billing CSV export (Settings → Billing → Export bills) into
 * `shipping_charge`. Reuses the same parser/importer as the CLI script, so it's
 * idempotent (delete-replace per Bill #) — re-uploading an overlapping export
 * never double-counts.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let text: string;
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No CSV file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)." }, { status: 400 });
    }
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  let charges;
  try {
    charges = parseBillingCsv(text);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not parse the CSV." },
      { status: 400 },
    );
  }
  if (charges.length === 0) {
    return NextResponse.json(
      {
        error:
          "No shipping charges found. Make sure this is the Shopify billing export (Settings → Billing → Export bills), which contains shipping_fee rows.",
      },
      { status: 400 },
    );
  }

  const result = await importShippingCharges(charges);
  return NextResponse.json({ data: result });
}
