"use client";

import { useEffect, useRef, useState } from "react";

// Live-camera QR decoder. Dynamically imports qr-scanner so the browser-only
// library never lands in a server bundle. Calls onDecode once with the first
// successful read; the caller is expected to unmount us at that point.
export function QrScannerView({
  onDecode,
  onError,
}: {
  onDecode: (payload: string) => void;
  onError?: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const decodedRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied">(
    "starting",
  );

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let alive = true;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (!alive || !videoRef.current) return;

        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            onDecode(result.data);
          },
          { highlightScanRegion: true, highlightCodeOutline: true },
        );
        await scanner.start();
        if (alive) setStatus("scanning");
      } catch (err) {
        if (!alive) return;
        setStatus("denied");
        onError?.(
          err instanceof Error ? err.message : "Camera unavailable",
        );
      }
    })();

    return () => {
      alive = false;
      scanner?.stop();
      scanner?.destroy();
    };
  }, [onDecode, onError]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
      />
      {status !== "scanning" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
          {status === "starting" ? "Starting camera…" : "Camera denied"}
        </div>
      )}
    </div>
  );
}
