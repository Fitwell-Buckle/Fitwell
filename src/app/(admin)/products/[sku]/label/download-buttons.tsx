"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { toPng, toJpeg } from "html-to-image";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Format = "png" | "jpg" | "pdf";

const FORMATS: { key: Format; label: string; hint: string }[] = [
  { key: "png", label: "PNG", hint: "Transparent-aware raster" },
  { key: "jpg", label: "JPEG", hint: "Smaller file, no transparency" },
  { key: "pdf", label: "PDF", hint: "Single 4×5″ page" },
];

/**
 * Single dark "Download" button that opens a small menu of format choices.
 * Client-side capture so the output is pixel-for-pixel what the preview shows
 * (same fonts, same antialiasing). The PDF variant wraps the PNG capture in
 * a single 4×5-inch PDF page via pdf-lib.
 */
export function DownloadButtons({
  sku,
  /** id of the DOM node to capture — see the label page render. */
  targetId,
}: {
  sku: string;
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click + escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function captureAndDownload(format: Format) {
    setOpen(false);
    setError(null);
    setBusy(format);
    try {
      const node = document.getElementById(targetId);
      if (!node) {
        setError("Couldn't find the label element on the page.");
        return;
      }

      // Capture at higher DPI so the printed/exported result stays crisp.
      // Source on-screen is 4 CSS inches wide ≈ 384px; pixelRatio=4 yields a
      // ~1536-px-wide raster, comfortably ≥300 DPI when sized back to 4″.
      const baseOpts = {
        pixelRatio: 4,
        cacheBust: true,
        backgroundColor: "#ffffff",
      } as const;
      const filename = `label-${sku}`;

      if (format === "pdf") {
        // PDF route: capture as PNG, embed in a single PDF page sized to a
        // 4-inch print width with the height derived from the capture's real
        // aspect ratio. The label node is 4in wide but its height is
        // content-driven (not a fixed 5in), so hard-coding a 4×5 page and
        // stretching the image to fill it squished the artwork vertically.
        const pngDataUrl = await toPng(node, baseOpts);
        const pngBytes = dataUrlToBytes(pngDataUrl);
        const pdf = await PDFDocument.create();
        const image = await pdf.embedPng(pngBytes);
        // 1 inch = 72 PDF points. Width fixed at 4in (288pt); height follows
        // the captured pixel aspect ratio so nothing is stretched.
        const pageWidth = 288;
        const pageHeight = pageWidth * (image.height / image.width);
        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
        const pdfBytes = await pdf.save();
        triggerDownload(
          new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }),
          `${filename}.pdf`,
        );
        return;
      }

      const dataUrl =
        format === "png"
          ? await toPng(node, baseOpts)
          : await toJpeg(node, { ...baseOpts, quality: 0.95 });
      triggerDownload(
        dataUrlToBlob(dataUrl, format === "png" ? "image/png" : "image/jpeg"),
        `${filename}.${format}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        size="sm"
        disabled={!!busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" />
        {busy ? `Saving ${busy.toUpperCase()}…` : "Download"}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onClick={() => void captureAndDownload(f.key)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <span className="font-medium">{f.label}</span>
              <span className="text-xs text-zinc-400">{f.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  return new Blob([new Uint8Array(dataUrlToBytes(dataUrl))], { type: mime });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight delay to give the browser time to start the download before we
  // free the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
