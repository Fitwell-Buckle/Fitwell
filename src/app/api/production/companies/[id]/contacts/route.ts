import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyContact } from "@/lib/schema";

const schema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(200).nullish(),
});

// Add an authorized login email to a company (Phase 7 B2B portal). Admin-only.
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

  const email = input.email.trim().toLowerCase();

  try {
    // Unique on email — an address maps to exactly one company.
    const [row] = await db
      .insert(companyContact)
      .values({ companyId: id, email, name: input.name?.trim() || null })
      .onConflictDoNothing({ target: companyContact.email })
      .returning({ id: companyContact.id });

    if (!row) {
      return NextResponse.json(
        { error: "That email is already assigned to a company." },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: { id: row.id } }, { status: 201 });
  } catch (err) {
    console.error("Add company contact failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
