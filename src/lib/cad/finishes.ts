// Buckle finishes for the 3D viewer. Each finish recolors the **body** material
// of the model; the spring bar is always silver (see SPRING_BAR), regardless of
// finish. Colors are PBR factors (baseColor as linear-ish RGB 0–1, metallic,
// roughness) tuned for <model-viewer>'s neutral lighting.

export type FinishGroup = "glossy" | "matte";

export interface Finish {
  id: string;
  label: string;
  group: FinishGroup;
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  // CSS color for the picker swatch (approximate; the 3D look comes from the
  // PBR factors above).
  swatch: string;
}

// The spring bar (the rod through the pin) — fixed silver on every finish, and
// always a touch more matte than the (polished) body.
export const SPRING_BAR = {
  baseColor: [0.8, 0.8, 0.82] as [number, number, number],
  metallic: 1,
  roughness: 0.18,
};

export const FINISHES: Finish[] = [
  // Polished (very low roughness, high metallic) — mirror-shiny, even across colors.
  { id: "silver_steel", label: "Silver Steel", group: "glossy", baseColor: [0.72, 0.73, 0.75], metallic: 1, roughness: 0.05, swatch: "#c2c4c7" },
  { id: "black_steel", label: "Black Steel", group: "glossy", baseColor: [0.045, 0.045, 0.05], metallic: 1, roughness: 0.05, swatch: "#1b1b1e" },
  { id: "yellow_gold_steel", label: "Yellow Gold Steel", group: "glossy", baseColor: [0.86, 0.66, 0.22], metallic: 1, roughness: 0.05, swatch: "#d6a838" },
  { id: "rose_gold_steel", label: "Rose Gold Steel", group: "glossy", baseColor: [0.82, 0.53, 0.46], metallic: 1, roughness: 0.05, swatch: "#cf8a78" },
  { id: "titanium", label: "Titanium", group: "glossy", baseColor: [0.62, 0.63, 0.65], metallic: 1, roughness: 0.05, swatch: "#b7babe" },
  // Matte = bead blasted (high roughness). Only steel + titanium are bead blasted.
  { id: "matte_titanium", label: "Bead Blasted Titanium", group: "matte", baseColor: [0.58, 0.59, 0.61], metallic: 0.9, roughness: 0.82, swatch: "#a7aaae" },
  { id: "matte_steel", label: "Bead Blasted Steel", group: "matte", baseColor: [0.66, 0.67, 0.69], metallic: 0.9, roughness: 0.82, swatch: "#bbbec2" },
];

export const DEFAULT_FINISH_ID = "silver_steel";

export function getFinish(id: string | null | undefined): Finish {
  return FINISHES.find((f) => f.id === id) ?? FINISHES.find((f) => f.id === DEFAULT_FINISH_ID)!;
}

// Map a product/variant color or name to a finish. "Bead blasted" (or "matte")
// selects the matte variant (only steel + titanium have one). Specific colors
// are checked before generic ones (rose gold before gold; black/gold before the
// catch-all steel) so "Yellow Gold Steel" → gold, not steel.
export function matchFinish(text: string | null | undefined): Finish | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const matte = /bead[\s-]*blast|matte|\bmatt\b/.test(t);
  let id: string | null = null;
  if (/black/.test(t)) id = "black_steel";
  else if (/rose[\s-]*gold/.test(t)) id = "rose_gold_steel";
  else if (/yellow[\s-]*gold|gold/.test(t)) id = "yellow_gold_steel";
  else if (/titan/.test(t)) id = matte ? "matte_titanium" : "titanium";
  else if (/natural|silver|stainless|steel|polish/.test(t))
    id = matte ? "matte_steel" : "silver_steel";
  return id ? (FINISHES.find((f) => f.id === id) ?? null) : null;
}

// glTF material name for the recolorable body (the viewer targets this to apply
// a finish at runtime).
export const BODY_MATERIAL_NAME = "body";
export const SPRING_BAR_MATERIAL_NAME = "spring_bar";
// The tagged surfaces of the body (Fusion's "brushed" appearance) — same finish
// colour as `body`, but rendered MATTE instead of mirror-polished. Split out as
// its own material/primitive so only the tagged faces get the matte finish.
export const BODY_BRUSHED_MATERIAL_NAME = "body_brushed";

// Matte-finish parameter for the tagged faces — high roughness so they read as a
// distinctly different, non-reflective metal next to the polish.
export const BRUSHED = {
  roughness: 0.6,
};

// Cast-steel surfaces (Fusion's "Cast" appearance) — a bumpy, always-steel-
// coloured metal (never recoloured per finish, like the spring bar). The bump
// comes from a procedural noise normal map baked onto these faces.
export const BODY_CAST_MATERIAL_NAME = "body_cast";
export const CAST = {
  baseColor: [0.34, 0.34, 0.36] as [number, number, number], // dark steel
  metallic: 0.8, // lower → less mirror, more diffuse
  roughness: 0.85, // high → matte, low reflectivity
  normalScale: 0.7, // bumpiness
};
