import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setLineExpectedCompletionDate } from "@/lib/production/service";
import { ensureSupplierMayActOnLineItem } from "@/lib/production/scope";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { getSupplierScope } from "@/lib/production/supplier-session";

// Set or clear ONE line item's expected_completion_date. Used by the
// supplier portal's per-line ETA editor. Per-line ETAs are independent —
// FWB001-BL-16 and FWB001-RG-16 on the same PO often have different
// completion dates, so the supplier sets them individually. After the
// update, the seeder reruns and the master + every sub-PO get fresh
// stage-target spreads anchored to the new line ETAs.

const bodySchema = z.object({
  expectedCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Suppliers may set ETA only on lines on their own PO; admins always pass.
  const denied = await ensureSupplierMayActOnLineItem(session, id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

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

  const result = await setLineExpectedCompletionDate(
    id,
    input.expectedCompletionDate,
  );
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Notify the admins (in-app + email) so they see the supplier's date change.
  const scope = await getSupplierScope();
  await notifyPoUpdate({
    poId: result.masterId,
    summary: input.expectedCompletionDate
      ? `Set expected completion to ${input.expectedCompletionDate} on line ${id.slice(0, 8)}`
      : `Cleared expected completion on line ${id.slice(0, 8)}`,
    actor: {
      role: scope ? "supplier" : "admin",
      name: session.user.name ?? null,
      supplierId: scope?.supplierId,
    },
  });
  return NextResponse.json({ data: { id, masterId: result.masterId } });
}
