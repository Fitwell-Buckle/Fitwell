"use client";

import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDictation } from "@/components/ui/use-dictation";

export interface NewVoiceNote {
  id: string;
  blobUrl: string;
  transcript: string | null;
  durationSec: number | null;
  createdAt: string;
}

// Pick a container the browser can actually record. Chrome/Android → webm,
// iOS Safari → mp4. Returns [mimeType, fileExtension].
function pickMime(): [string, string] {
  if (typeof MediaRecorder === "undefined") return ["", "webm"];
  if (MediaRecorder.isTypeSupported("audio/webm")) return ["audio/webm", "webm"];
  if (MediaRecorder.isTypeSupported("audio/mp4")) return ["audio/mp4", "m4a"];
  return ["", "webm"];
}

export function VoiceRecorder({
  uploadUrl,
  onUploaded,
}: {
  uploadUrl: string;
  onUploaded: (note: NewVoiceNote) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const transcriptRef = useRef("");

  // Live on-device dictation captured while recording (no external STT).
  const dictation = useDictation(
    (full) => {
      transcriptRef.current = full;
      setLiveTranscript(full);
    },
    () => "",
  );

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const [mimeType] = pickMime();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      transcriptRef.current = "";
      setLiveTranscript("");
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => void finalize();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setRecording(true);
      if (dictation.supported && !dictation.listening) dictation.toggle();
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stop() {
    if (dictation.listening) dictation.toggle();
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function finalize() {
    const [mimeType, ext] = pickMime();
    const durationSec = (Date.now() - startedAtRef.current) / 1000;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const blob = new Blob(chunksRef.current, {
      type: mimeType || "audio/webm",
    });
    if (blob.size === 0) {
      toast.error("Nothing recorded");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", blob, `note.${ext}`);
      form.append("durationSec", String(Math.round(durationSec)));
      if (transcriptRef.current.trim())
        form.append("transcript", transcriptRef.current.trim());
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");
      onUploaded({
        id: json.data.id,
        blobUrl: json.data.blobUrl,
        transcript: json.data.transcript ?? null,
        durationSec: json.data.durationSec ?? Math.round(durationSec),
        createdAt: new Date().toISOString(),
      });
      setLiveTranscript("");
      toast.success("Voice note saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={uploading}
        onClick={recording ? stop : start}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
          recording
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-brand text-white hover:bg-brand-hover",
          uploading && "opacity-60",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </>
        ) : recording ? (
          <>
            <Square className="h-4 w-4 fill-current" /> Stop &amp; save
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" /> Record voice note
          </>
        )}
      </button>

      {recording && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
          Recording…
          {dictation.supported && " (transcribing live)"}
        </div>
      )}
      {recording && liveTranscript && (
        <p className="mt-2 rounded-md bg-zinc-50 p-2 text-sm text-zinc-600">
          {liveTranscript}
        </p>
      )}
    </div>
  );
}
