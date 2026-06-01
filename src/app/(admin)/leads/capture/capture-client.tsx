"use client";

import { useState } from "react";
import { Camera, QrCode, Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseQrPayload } from "@/lib/crm/qr-parser";
import { toNameCase } from "@/lib/crm/names";
import { extractEmailDomain } from "@/lib/crm/email";
import { type LeadFormInitial } from "../lead-form";
import { CardCamera } from "./card-camera";
import { CaptureConfirm } from "./capture-confirm";
import { QrScannerView } from "./qr-scanner-view";

type Mode =
  | "idle"
  | "capturing_card"
  | "scanning_qr"
  | "uploading_card"
  | "confirm";

const MODE_TILE =
  "flex h-32 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-center transition-colors hover:bg-zinc-50 active:bg-zinc-100";

export function CaptureClient() {
  // Open straight into the camera — fastest path for booth capture. Cancel
  // drops to the 3-mode picker (QR / manual still reachable).
  const [mode, setMode] = useState<Mode>("capturing_card");
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [initial, setInitial] = useState<LeadFormInitial | null>(null);
  const [confidence, setConfidence] = useState<
    Record<string, number | undefined> | undefined
  >(undefined);

  function reset() {
    setMode("idle");
    setError(null);
    setBusyLabel(null);
    setInitial(null);
    setConfidence(undefined);
  }

  function startPhoto() {
    setError(null);
    setMode("capturing_card");
  }

  function startQr() {
    setError(null);
    setMode("scanning_qr");
  }

  // Defaults shared by every capture-page entry: this flow is for cards
  // collected at trade shows, and a card is a named decision-maker — which
  // is the spec's bar for `lead` (the booth-conversation anti-pattern is
  // about nameless chats). So default source → Tradeshow, stage → lead.
  const CAPTURE_DEFAULTS = {
    sourceChannel: "b2b_trade_shows_consumer",
    stage: "lead",
  } as const;

  function startManual() {
    setError(null);
    setInitial({ ...CAPTURE_DEFAULTS });
    setConfidence(undefined);
    setMode("confirm");
  }

  async function uploadCardFile(file: File) {
    setMode("uploading_card");
    setBusyLabel("Reading card…");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/scan-card", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? `Scan failed (${res.status})`);
        setMode("idle");
        setBusyLabel(null);
        return;
      }
      const d = body.data as {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        companyName: string | null;
        website: string | null;
        confidence?: Record<string, number>;
        rawText: string;
        cardImageUrl: string;
      };
      setInitial({
        ...CAPTURE_DEFAULTS,
        firstName: toNameCase(d.firstName),
        lastName: toNameCase(d.lastName),
        email: d.email,
        phone: d.phone,
        title: d.title,
        // Company is identified by its email domain (the durable key),
        // falling back to any company name the model read off the card.
        companyName: extractEmailDomain(d.email) ?? d.companyName,
        website: d.website,
        cardImageUrl: d.cardImageUrl,
        cardRawText: d.rawText,
      });
      setConfidence(d.confidence ?? undefined);
      setMode("confirm");
      setBusyLabel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setMode("idle");
      setBusyLabel(null);
    }
  }

  function onQrDecoded(payload: string) {
    const parsed = parseQrPayload(payload);
    if (!parsed) {
      setError(
        "QR code wasn't recognized as a contact. Try a card photo or type it in.",
      );
      setMode("idle");
      return;
    }
    setInitial({
      ...CAPTURE_DEFAULTS,
      firstName: toNameCase(parsed.firstName),
      lastName: toNameCase(parsed.lastName),
      email: parsed.email,
      phone: parsed.phone,
      title: parsed.title,
      companyName: extractEmailDomain(parsed.email) ?? parsed.companyName,
      website: parsed.website,
    });
    setConfidence(undefined);
    setMode("confirm");
  }

  // After saving, jump straight back to the camera for the next card.
  function captureAnother() {
    setError(null);
    setBusyLabel(null);
    setInitial(null);
    setConfidence(undefined);
    setMode("capturing_card");
  }

  if (mode === "confirm" && initial) {
    return (
      <CaptureConfirm
        initial={initial}
        confidence={confidence}
        onStartOver={reset}
        onSavedNext={captureAnother}
      />
    );
  }

  if (mode === "capturing_card") {
    return (
      <Card>
        <CardContent>
          <CardCamera onCapture={uploadCardFile} onCancel={reset} />
        </CardContent>
      </Card>
    );
  }

  if (mode === "uploading_card") {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-12">
            <Camera className="h-7 w-7 animate-pulse text-zinc-400" />
            <p className="text-sm text-zinc-600">
              {busyLabel ?? "Reading card…"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === "scanning_qr") {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-700">
              Point at the QR code on the card
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
          <div className="mt-3">
            <QrScannerView onDecode={onQrDecoded} onError={setError} />
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className={MODE_TILE} onClick={startPhoto}>
            <Camera className="h-7 w-7 text-zinc-700" />
            <span className="text-sm font-medium">Scan card</span>
            <span className="text-xs text-zinc-500">Use the camera</span>
          </button>
          <button type="button" className={MODE_TILE} onClick={startQr}>
            <QrCode className="h-7 w-7 text-zinc-700" />
            <span className="text-sm font-medium">Scan QR</span>
            <span className="text-xs text-zinc-500">vCard / MeCard / URL</span>
          </button>
          <button type="button" className={MODE_TILE} onClick={startManual}>
            <Keyboard className="h-7 w-7 text-zinc-700" />
            <span className="text-sm font-medium">Type it in</span>
            <span className="text-xs text-zinc-500">No card on hand</span>
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
