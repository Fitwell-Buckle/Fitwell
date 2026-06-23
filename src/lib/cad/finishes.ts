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

// The spring bar (the rod through the pin) — fixed silver on every finish.
export const SPRING_BAR = {
  baseColor: [0.8, 0.8, 0.82] as [number, number, number],
  metallic: 1,
  roughness: 0.2,
};

export const FINISHES: Finish[] = [
  // Glossy (low roughness, high metallic).
  { id: "black_steel", label: "Black Steel", group: "glossy", baseColor: [0.045, 0.045, 0.05], metallic: 1, roughness: 0.28, swatch: "#1b1b1e" },
  { id: "yellow_gold_steel", label: "Yellow Gold Steel", group: "glossy", baseColor: [0.86, 0.66, 0.22], metallic: 1, roughness: 0.25, swatch: "#d6a838" },
  { id: "rose_gold_steel", label: "Rose Gold Steel", group: "glossy", baseColor: [0.82, 0.53, 0.46], metallic: 1, roughness: 0.25, swatch: "#cf8a78" },
  { id: "titanium", label: "Titanium", group: "glossy", baseColor: [0.62, 0.63, 0.65], metallic: 1, roughness: 0.32, swatch: "#b7babe" },
  // Matte (high roughness).
  { id: "matte_titanium", label: "Matte Titanium", group: "matte", baseColor: [0.58, 0.59, 0.61], metallic: 1, roughness: 0.62, swatch: "#a7aaae" },
  { id: "matte_steel", label: "Matte Steel", group: "matte", baseColor: [0.66, 0.67, 0.69], metallic: 1, roughness: 0.62, swatch: "#bbbec2" },
];

export const DEFAULT_FINISH_ID = "titanium";

export function getFinish(id: string | null | undefined): Finish {
  return FINISHES.find((f) => f.id === id) ?? FINISHES.find((f) => f.id === DEFAULT_FINISH_ID)!;
}

// glTF material name for the recolorable body (the viewer targets this to apply
// a finish at runtime).
export const BODY_MATERIAL_NAME = "body";
export const SPRING_BAR_MATERIAL_NAME = "spring_bar";
