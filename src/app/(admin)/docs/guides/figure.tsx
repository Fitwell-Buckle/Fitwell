"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

/**
 * A screenshot/video slot for a guide step. Loads the asset at `src`; until that
 * file exists it shows a dashed placeholder describing the shot + where to drop
 * it. The moment the file is added to public/, the real media appears.
 */
export function Figure({
  src,
  caption,
  video = false,
}: {
  src: string;
  caption: string;
  video?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <figure className="my-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
        <ImageIcon className="mx-auto h-5 w-5 text-zinc-300" />
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          {video ? "Video" : "Screenshot"}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{caption}</p>
        <p className="mt-2 text-[11px] text-zinc-400">
          Add a {video ? "video" : "screenshot"} at{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5">public{src}</code>
        </p>
      </figure>
    );
  }

  return (
    <figure className="my-3 overflow-hidden rounded-lg border border-zinc-200">
      {video ? (
        <video src={src} controls className="w-full" onError={() => setFailed(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={caption}
          className="w-full"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption className="border-t border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500">
        {caption}
      </figcaption>
    </figure>
  );
}
