// Polymorphic parent rule for attachments and comments: exactly one of
// poId / lineItemId must be set (mirrors the DB CHECK constraint). Pure so it
// can be unit tested and used to reject bad input before hitting the database.

export type ResolvedParent =
  | { ok: true; poId: string | null; lineItemId: string | null }
  | { ok: false; error: string };

export function resolveParent(input: {
  poId?: string | null;
  lineItemId?: string | null;
}): ResolvedParent {
  const hasPo = typeof input.poId === "string" && input.poId.length > 0;
  const hasLineItem =
    typeof input.lineItemId === "string" && input.lineItemId.length > 0;

  if (hasPo === hasLineItem) {
    return {
      ok: false,
      error: "Provide exactly one of poId or lineItemId",
    };
  }

  return {
    ok: true,
    poId: hasPo ? input.poId! : null,
    lineItemId: hasLineItem ? input.lineItemId! : null,
  };
}
