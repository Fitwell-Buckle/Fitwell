"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

// Business-card viewfinder aspect ratio (landscape, ~8:5 — between the
// US 3.5×2 card and the EU/ID-1 85.6×54mm card). The live preview and the
// captured image both use this so what you frame is what gets saved.
const CARD_W = 8;
const CARD_H = 5;
const CARD_ASPECT = CARD_W / CARD_H;

// Live rear-camera viewfinder for capturing a business card. Uses
// getUserMedia for a true in-app shutter experience. When a live camera
// isn't available — getUserMedia needs a secure context (HTTPS or
// localhost), so it fails when a phone hits the dev server over a plain
// http://192.168.x.x LAN address — it falls back to a file input with
// `capture="environment"`, which hands off to the OS camera app and works
// over HTTP too. Either way the user ends up with a File.
export function CardCamera({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"starting" | "live" | "fallback">(
    "starting",
  );

  // Acquire the camera stream once on mount.
  useEffect(() => {
    let alive = true;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fallback");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStatus("live");
      } catch {
        // Permission denied, no device, or insecure context → fall back.
        if (alive) setStatus("fallback");
      }
    }
    start();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach the stream to the <video> whenever both exist. Runs after every
  // render (cheap, guarded by the srcObject check) so it catches the case
  // where the stream resolves before the element mounts AND vice-versa —
  // the original bug was attaching only inside start(), when the element
  // hadn't rendered yet (videoRef was null), leaving a black viewfinder.
  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (v && s && v.srcObject !== s) {
      v.srcObject = s;
      // iOS needs an explicit play() after srcObject; ignore autoplay rejects.
      void v.play().catch(() => {});
    }
  });

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function shoot() {
    const video = videoRef.current;
    const vw = video?.videoWidth ?? 0;
    const vh = video?.videoHeight ?? 0;
    if (!video || !vw || !vh) return;

    // Center-crop the camera frame to the card aspect ratio — the same region
    // the object-cover preview shows — so the saved image is WYSIWYG.
    let sw: number;
    let sh: number;
    if (vw / vh > CARD_ASPECT) {
      // Source is wider than the card window → crop the sides.
      sh = vh;
      sw = Math.round(vh * CARD_ASPECT);
    } else {
      // Source is taller (e.g. a portrait phone feed) → crop top/bottom.
      sw = vw;
      sh = Math.round(vw / CARD_ASPECT);
    }
    const sx = Math.round((vw - sw) / 2);
    const sy = Math.round((vh - sh) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        onCapture(new File([blob], "card.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) {
      stopStream();
      onCapture(f);
    }
  }

  const showVideo = status === "starting" || status === "live";

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700">
          {status === "live"
            ? "Fill the frame with the card, then tap the shutter"
            : status === "starting"
              ? "Starting camera…"
              : "Use your camera to take a photo of the card"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            stopStream();
            onCancel();
          }}
        >
          <MoreHorizontal className="h-4 w-4" /> Other options
        </Button>
      </div>

      {showVideo && (
        <div className="mt-3">
          {/* Card-shaped viewfinder window — frame the card to fill it. */}
          <div
            className="relative w-full overflow-hidden rounded-md bg-black"
            style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
          >
            {/* Always mounted while starting/live so the stream can attach. */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted
            />
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-white/80">Starting camera…</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button
              onClick={shoot}
              disabled={status !== "live"}
              className="px-8"
            >
              <Camera className="h-5 w-5" /> Capture
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUp className="h-4 w-4" /> Upload instead
            </Button>
          </div>
        </div>
      )}

      {status === "fallback" && (
        <div className="mt-4 flex flex-col items-center gap-3 py-6">
          <p className="text-center text-xs text-zinc-500">
            Live camera unavailable. Tap below — on a phone this opens the
            camera directly.
          </p>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Camera className="h-5 w-5" /> Open camera
          </Button>
        </div>
      )}

      {/* Hidden fallback input — `capture` hints the rear camera on mobile. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilePicked}
      />
    </div>
  );
}
