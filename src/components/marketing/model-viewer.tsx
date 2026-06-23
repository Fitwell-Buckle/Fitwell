"use client";

import { useEffect, useRef } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { getFinish, BODY_MATERIAL_NAME } from "@/lib/cad/finishes";

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
interface ModelViewerEl extends HTMLElement {
  model?: {
    materials: {
      name: string;
      pbrMetallicRoughness: {
        setBaseColorFactor(v: [number, number, number, number]): void;
        setMetallicFactor(v: number): void;
        setRoughnessFactor(v: number): void;
      };
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
    if (!el || !finishId) return;
    const apply = () => {
      const f = getFinish(finishId);
      const mat = el.model?.materials.find((m) => m.name === BODY_MATERIAL_NAME);
      if (!mat) return;
      mat.pbrMetallicRoughness.setBaseColorFactor([...f.baseColor, 1]);
      mat.pbrMetallicRoughness.setMetallicFactor(f.metallic);
      mat.pbrMetallicRoughness.setRoughnessFactor(f.roughness);
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
      shadow-intensity="1"
      exposure="1"
      className={className}
      style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
    />
  );
}
