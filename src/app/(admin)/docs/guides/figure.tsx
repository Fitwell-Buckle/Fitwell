"use client";

import { useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";

/**
 * A screenshot slot for a guide step (PNG or animated GIF — both render as an
 * <img>, so GIFs animate inline). Until the asset exists it shows a dashed
 * placeholder describing the shot + where to drop it. Renders at half width and
 * opens full-size in a modal when clicked.
 */
export function Figure({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const isGif = src.endsWith(".gif");

  // Close the zoom modal on Escape.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  if (failed) {
    return (
      <figure className="my-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center sm:max-w-[50%]">
        <ImageIcon className="mx-auto h-5 w-5 text-zinc-300" />
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          {isGif ? "Animation" : "Screenshot"}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{caption}</p>
        <p className="mt-2 text-[11px] text-zinc-400">
          Add {isGif ? "an animation" : "a screenshot"} at{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5">public{src}</code>
        </p>
      </figure>
    );
  }

  return (
    <>
      <figure className="my-3 w-full overflow-hidden rounded-lg border border-zinc-200 sm:max-w-[50%]">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in"
          aria-label="View full size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption} className="w-full" onError={() => setFailed(true)} />
        </button>
        <figcaption className="border-t border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500">
          {caption}
        </figcaption>
      </figure>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] cursor-zoom-out rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
