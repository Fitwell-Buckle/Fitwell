import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorDiscountCode } from "@/lib/schema";
import { defaultCreatorCode, normalizeCode } from "@/lib/creators/codes";
import { getShopifyClient } from "@/lib/shopify/client";

// Middleware gates /api/admin/* to signed-in non-portal users.

const bodySchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "letters/numbers/dash/underscore only")
    .optional(),
  percentOff: z.number().min(1).max(100).default(15),
});

/**
 * Create a Shopify discount code for this creator (default 15% off,
 * single-use-per-customer, no expiry — creator-program.md Phase 4) and
 * register it in creator_discount_code. Redemptions are computed by
 * joining order_discount_code on the normalized code, never counters.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const record = await db.query.creator.findFirst({
    where: eq(creator.id, id),
    with: { platforms: { columns: { platform: true, handle: true } } },
  });
  if (!record) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const primaryHandle =
    record.platforms.find((p) => p.platform === record.primaryPlatform)
      ?.handle ??
    record.platforms[0]?.handle ??
    record.name;
  const codeRaw =
    parsed.data.code ?? defaultCreatorCode(primaryHandle, parsed.data.percentOff);
  const code = normalizeCode(codeRaw);

  const existing = await db.query.creatorDiscountCode.findFirst({
    where: eq(creatorDiscountCode.code, code),
  });
  if (existing) {
    return NextResponse.json(
      { error: `Code ${codeRaw} is already registered` },
      { status: 409 },
    );
  }

  let discountNodeId: string;
  try {
    const result = await getShopifyClient().createBasicDiscountCode({
      code: codeRaw,
      percentOff: parsed.data.percentOff,
      title: `Creator: ${record.name}`,
    });
    discountNodeId = result.discountNodeId;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Shopify error";
    // write_discounts not granted yet → graceful 502 (same pattern as the
    // leads address-sync button) so the UI explains instead of breaking.
    const accessDenied = /access ?denied|protected|merchant approval/i.test(message);
    return NextResponse.json(
      {
        error: accessDenied
          ? "Shopify hasn't granted write_discounts yet — the scope rides the next app deploy + re-auth (see shopify.app.toml). Nothing was created."
          : `Shopify rejected the discount code: ${message}`,
      },
      { status: 502 },
    );
  }

  const [row] = await db
    .insert(creatorDiscountCode)
    .values({
      creatorId: id,
      code,
      codeRaw,
      shopifyDiscountCodeId: discountNodeId,
      percentOff: parsed.data.percentOff,
    })
    .returning({ id: creatorDiscountCode.id });

  return NextResponse.json({
    data: { id: row.id, code: codeRaw, discountNodeId },
  });
}
