// Derive buckle size (mm) and colour from a Shopify variant's structured
// options. Reading the option *values* (not the joined title) is important —
// some colours contain a "/" (e.g. "Silver Brushed / Polished"). Pure, so it's
// unit-tested directly.

export interface VariantAttrs {
  sizeMm: number | null;
  color: string | null;
}

export function deriveAttrs(
  optionNames: (string | null | undefined)[],
  optionValues: (string | null | undefined)[],
): VariantAttrs {
  let sizeMm: number | null = null;
  let color: string | null = null;

  for (let i = 0; i < optionValues.length; i++) {
    const name = (optionNames[i] ?? "").toLowerCase();
    const val = optionValues[i];
    if (!val) continue;

    if (name.includes("size") || (sizeMm === null && /\d+\s*mm/i.test(val))) {
      const m = val.match(/(\d+)/);
      if (m) sizeMm = Number(m[1]);
    } else if (name.includes("colo")) {
      // matches "color" and "colour"
      color = val;
    }
  }

  return { sizeMm, color };
}
