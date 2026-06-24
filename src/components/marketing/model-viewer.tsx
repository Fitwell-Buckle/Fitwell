"use client";

import { useEffect, useRef } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import {
  getFinish,
  BODY_MATERIAL_NAME,
  BODY_BRUSHED_MATERIAL_NAME,
  BODY_CAST_MATERIAL_NAME,
  SPRING_BAR_MATERIAL_NAME,
  SPRING_BAR,
  BRUSHED,
  CAST,
} from "@/lib/cad/finishes";

// Minimal typing for the <model-viewer> custom element (only the attributes we
// use). Augments React's JSX so TSX accepts the tag.
type ModelViewerAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  src?: string;
  alt?: string;
  poster?: string;
  "camera-controls"?: boolean;
  "auto-rotate"?: boolean;
  "auto-rotate-delay"?: number;
  "rotation-per-second"?: string;
  "interaction-prompt"?: string;
  "touch-action"?: string;
  "shadow-intensity"?: string;
  "shadow-softness"?: string;
  "camera-orbit"?: string;
  exposure?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}

/**
 * Chrome-free 3D model viewer for the public site. Renders a GLB/glTF with
 * drag-to-orbit and a gentle auto-spin — and nothing else: no toolbar, no
 * navigation cube, no vendor branding, no AR button (we never set `ar`). This
 * is the same engine (`<model-viewer>`) Shopify's native 3D product media uses.
 *
 * `src` is a GLB URL (typically a Vercel Blob URL from the CAD library). The CSP
 * `connect-src` allows `*.public.blob.vercel-storage.com` + `blob:` for this.
 * Pass `finishId` to recolor the body material (spring bar stays silver).
 */
// Minimal shape of the bits of the <model-viewer> element we touch.
interface MVTexture {
  texture: unknown;
  setTexture(texture: unknown): void;
}
interface ModelViewerEl extends HTMLElement {
  model?: {
    materials: {
      name: string;
      pbrMetallicRoughness: {
        setBaseColorFactor(v: [number, number, number, number]): void;
        setMetallicFactor(v: number): void;
        setRoughnessFactor(v: number): void;
      };
      normalTexture?: MVTexture;
    }[];
  };
}

export function ModelViewer({
  src,
  alt,
  poster,
  className = "",
  autoRotate = true,
  cameraOrbit,
  finishId,
}: {
  src: string;
  alt: string;
  poster?: string;
  className?: string;
  autoRotate?: boolean;
  /**
   * Default/reset camera position as model-viewer's "theta phi radius"
   * (e.g. "45deg 60deg auto"). theta = orbit around the model, phi =
   * elevation (0 = top-down, 90 = side), radius = distance.
   */
  cameraOrbit?: string;
  /**
   * Recolor the "body" material to this finish on load (the spring bar stays
   * silver — it's a separate baked material we never touch).
   */
  finishId?: string;
}) {
  const ref = useRef<ModelViewerEl | null>(null);

  useEffect(() => {
    // Registers the custom element; browser-only, so load it on the client.
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const mats = el.model?.materials;
      if (!mats) return;
      // Body — recolored to the chosen finish.
      if (finishId) {
        const f = getFinish(finishId);
        const body = mats.find((m) => m.name === BODY_MATERIAL_NAME);
        body?.pbrMetallicRoughness.setBaseColorFactor([...f.baseColor, 1]);
        body?.pbrMetallicRoughness.setMetallicFactor(f.metallic);
        body?.pbrMetallicRoughness.setRoughnessFactor(f.roughness);
        // Brushed top/sides — same finish colour, but keep the satin brushed
        // roughness (matte finishes go fully matte; the baked anisotropy stays).
        const brushed = mats.find((m) => m.name === BODY_BRUSHED_MATERIAL_NAME);
        brushed?.pbrMetallicRoughness.setBaseColorFactor([...f.baseColor, 1]);
        brushed?.pbrMetallicRoughness.setMetallicFactor(f.metallic);
        brushed?.pbrMetallicRoughness.setRoughnessFactor(
          f.group === "matte" ? f.roughness : BRUSHED.roughness,
        );
        // Cast — the buckle's colour, but kept as a matte, bumpy cast surface
        // (the baked bump normal map stays). No longer fixed steel.
        const cast = mats.find((m) => m.name === BODY_CAST_MATERIAL_NAME);
        cast?.pbrMetallicRoughness.setBaseColorFactor([...f.baseColor, 1]);
        cast?.pbrMetallicRoughness.setMetallicFactor(CAST.metallic);
        cast?.pbrMetallicRoughness.setRoughnessFactor(CAST.roughness);
      }
      // Spring bar — always the fixed silver, applied live so tweaks to its
      // matte/shine take effect without re-baking the stored model.
      const bar = mats.find((m) => m.name === SPRING_BAR_MATERIAL_NAME);
      bar?.pbrMetallicRoughness.setBaseColorFactor([...SPRING_BAR.baseColor, 1]);
      bar?.pbrMetallicRoughness.setMetallicFactor(SPRING_BAR.metallic);
      bar?.pbrMetallicRoughness.setRoughnessFactor(SPRING_BAR.roughness);
    };
    if (el.model) apply();
    el.addEventListener("load", apply);
    return () => el.removeEventListener("load", apply);
  }, [finishId, src]);

  return (
    <model-viewer
      ref={ref}
      src={src}
      alt={alt}
      poster={poster}
      camera-controls
      auto-rotate={autoRotate}
      auto-rotate-delay={0}
      rotation-per-second="24deg"
      camera-orbit={cameraOrbit}
      interaction-prompt="none"
      touch-action="pan-y"
      shadow-intensity="1.6"
      shadow-softness="0.9"
      exposure="1"
      className={className}
      style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
    />
  );
}
