"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
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
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>

      {showVideo && (
        <div className="mt-3">
          <div className="relative flex min-h-[40vh] items-center justify-center overflow-hidden rounded-md bg-black">
            {/* Always mounted while starting/live so the stream can attach. */}
            <video
              ref={videoRef}
              className="max-h-[60vh] w-full object-contain"
              autoPlay
              playsInline
              muted
            />
            {status === "starting" && (
              <p className="absolute text-sm text-white/80">Starting camera…</p>
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
