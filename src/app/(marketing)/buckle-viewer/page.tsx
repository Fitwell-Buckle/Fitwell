import type { Metadata } from "next";
import { ModelViewer } from "@/components/marketing/model-viewer";

export const metadata: Metadata = {
  title: "Buckle in 3D | Fitwell Buckle Co.",
  description: "Spin the Fitwell micro-adjust buckle in 3D.",
};

// Buckle model, converted from the Autodesk Fusion STL export to GLB
// (see scripts/stl-to-glb.py). Same-origin, so `connect-src 'self'` covers it.
const MODEL_SRC = "/models/buckle.glb";

export default function BuckleViewerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
        See it in 3D
      </h1>
      <p className="mt-3 max-w-xl text-zinc-600">
        Drag to spin the buckle and look at it from any angle.
      </p>

      <div className="mt-8 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100">
        <ModelViewer
          src={MODEL_SRC}
          alt="Fitwell micro-adjust buckle, 3D model"
          cameraOrbit="-45deg 42deg auto"
        />
      </div>
    </div>
  );
}
