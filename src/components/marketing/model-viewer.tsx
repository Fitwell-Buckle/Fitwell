"use client";

import { useEffect } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

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
 * `src` should be a same-origin GLB (e.g. `/models/buckle.glb`) so the default
 * `connect-src 'self'` CSP covers the fetch with no policy change.
 */
export function ModelViewer({
  src,
  alt,
  poster,
  className = "",
  autoRotate = true,
  cameraOrbit,
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
}) {
  useEffect(() => {
    // Registers the custom element; browser-only, so load it on the client.
    import("@google/model-viewer");
  }, []);

  return (
    <model-viewer
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
