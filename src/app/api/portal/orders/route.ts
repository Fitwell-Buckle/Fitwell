import { NextResponse } from "next/server";
import { z } from "zod";
import { getCompanyScope } from "@/lib/portal/company-session";
import { createPortalDraft, submitPortalOrder } from "@/lib/invoicing/portal-orders";

const schema = z.object({
  lineItems: z
    .array(
      z.object({
        shopifyVariantId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Your order is empty."),
  // Omitted = save as a draft (no Shopify transaction). Set = submit the order
  // for payment by card or bank wire.
  submit: z.enum(["card", "wire"]).optional(),
});

// Create a B2B portal order. Without `submit` it's saved as a draft (editable,
// no Shopify draft order yet); with `submit` it's also submitted for payment.
export async function POST(req: Request) {
  const scope = await getCompanyScope();
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const draft = await createPortalDraft(scope, input.lineItems);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });

  if (!input.submit) {
    return NextResponse.json(
      {
        data: {
          invoiceId: draft.invoiceId,
          invoiceNumber: draft.invoiceNumber,
          status: "draft",
        },
      },
      { status: 201 },
    );
  }

  const sub = await submitPortalOrder(scope, draft.invoiceId, input.submit);
  if (!sub.ok) {
    // The draft was saved; submission failed — surface the error, the draft
    // remains in their orders for a retry.
    return NextResponse.json({ error: sub.error }, { status: sub.status });
  }
  return NextResponse.json({ data: { ...sub, status: "sent" } }, { status: 201 });
}
