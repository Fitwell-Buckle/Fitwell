// Helpers for deciding whether a Gmail message surfaced for a PO is actually
// about that PO. SKU matching is intentionally loose — the same buckle SKU
// recurs across many POs — so an email that explicitly names a *different* PO
// (e.g. a "PO #14" thread surfacing on PO-00104 because they share a SKU) is
// cross-talk we want to drop.

// A PO number reduced to its bare digits (leading zeros dropped) so "PO-00104",
// "PO00104", and "104" all compare equal. Null if the string has no digits.
export function canonicalPoNumber(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const m = String(raw).match(/\d+/);
  return m ? String(Number(m[0])) : null;
}

// Every PO number *named* in free text — "PO #14", "PO-00104", "PO00104",
// "P.O. 104", "purchase order 14" — as canonical digit strings.
export function namedPoNumbers(text: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const po = /\bP\.?\s?O\.?\s*#?\s*-?\s*0*(\d{1,6})\b/gi;
  while ((m = po.exec(text))) out.add(String(Number(m[1])));
  const order = /\bpurchase\s+order\s*#?\s*-?\s*0*(\d{1,6})\b/gi;
  while ((m = order.exec(text))) out.add(String(Number(m[1])));
  return out;
}

// True when the text names PO number(s) and *none* of them are ours — i.e. the
// email is explicitly about a different PO. Names none (SKU-only match) → false
// (keep). Names ours, even alongside others → false (keep).
export function isAboutAnotherPo(
  text: string,
  myPoNumbers: Set<string>,
): boolean {
  const found = namedPoNumbers(text);
  if (found.size === 0) return false;
  for (const f of found) if (myPoNumbers.has(f)) return false;
  return true;
}
