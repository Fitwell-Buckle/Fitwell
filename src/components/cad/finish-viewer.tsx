"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ModelViewer } from "@/components/marketing/model-viewer";
import { FINISHES, DEFAULT_FINISH_ID, getFinish } from "@/lib/cad/finishes";
import { cn } from "@/lib/utils";

// A 3D model viewer with a finish picker. Recolors the buckle body to the
// chosen finish (spring bar stays silver).
//
// Two modes:
//  - Library (no `appliedFinishId`): shows all finishes to flip through.
//  - Product (`appliedFinishId` set): shows ONLY that product's color, with an
//    Edit button that reveals the full picker to preview/change it.
export function FinishViewer({
  src,
  alt,
  cameraOrbit = "-45deg 55deg auto",
  initialFinishId,
  appliedFinishId,
}: {
  src: string;
  alt: string;
  cameraOrbit?: string;
  initialFinishId?: string | null;
  // The product's applied finish. When set, only this finish shows (others are
  // hidden) until the user clicks Edit.
  appliedFinishId?: string | null;
}) {
  const locked = appliedFinishId != null;
  const [finishId, setFinishId] = useState(
    appliedFinishId || initialFinishId || DEFAULT_FINISH_ID,
  );
  const [editing, setEditing] = useState(false);
  const showPicker = !locked || editing;
  const applied = getFinish(appliedFinishId);

  return (
    <div>
      {/* #464449 matches the slate-grey backdrop of the Fitwell product photos
          (sampled from the storefront images), so the preview reads like a
          product shot. */}
      <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-zinc-700 bg-[#464449]">
        <ModelViewer src={src} alt={alt} finishId={finishId} cameraOrbit={cameraOrbit} />
      </div>

      {showPicker ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
          {locked && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setFinishId(applied.id);
              }}
              className="ml-1 text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
            >
              Done
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900 px-2 py-1 text-xs text-zinc-900">
            <span
              className="h-3.5 w-3.5 rounded-full border border-black/10"
              style={{ background: applied.swatch }}
            />
            {applied.label}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
}
