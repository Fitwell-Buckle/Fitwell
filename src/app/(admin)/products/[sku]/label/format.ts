/**
 * Strip the parts of a Shopify product title that are already visible
 * elsewhere on the packaging label: the "Fitwell" wordmark is at the top of
 * the artwork, and the colour shows up in the variant subtitle.
 */
export function formatLabelTitle(title: string, color: string | null): string {
  let out = title.replace(/^\s*Fitwell\s+/i, "");
  if (color) {
    const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
  }
  return out.replace(/\s+/g, " ").trim();
}
