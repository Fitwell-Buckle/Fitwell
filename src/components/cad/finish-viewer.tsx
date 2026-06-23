"use client";

import { useState } from "react";
import { ModelViewer } from "@/components/marketing/model-viewer";
import { FINISHES, DEFAULT_FINISH_ID } from "@/lib/cad/finishes";
import { cn } from "@/lib/utils";

// A 3D model viewer with a finish picker. Recolors the buckle body to the
// chosen finish (spring bar stays silver). Used wherever we preview a CAD model.
export function FinishViewer({
  src,
  alt,
  cameraOrbit = "-45deg 55deg auto",
  initialFinishId,
}: {
  src: string;
  alt: string;
  cameraOrbit?: string;
  // Pre-select a finish (e.g. auto-matched from the product's color).
  initialFinishId?: string | null;
}) {
  const [finishId, setFinishId] = useState(initialFinishId || DEFAULT_FINISH_ID);

  return (
    <div>
      <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100">
        <ModelViewer src={src} alt={alt} finishId={finishId} cameraOrbit={cameraOrbit} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FINISHES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFinishId(f.id)}
            title={f.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
              finishId === f.id
                ? "border-zinc-900 text-zinc-900"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300",
            )}
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-black/10"
              style={{ background: f.swatch }}
            />
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
