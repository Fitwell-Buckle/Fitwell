"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: string; // pre-formatted
}

export function SupplierAttachments({
  poId,
  attachments,
}: {
  poId: string;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/production/po/${poId}/attachments`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed.");
      } else {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Attachments</h2>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        {attachments.length === 0 ? (
          <p className="text-sm text-zinc-400">No attachments yet.</p>
        ) : (
          attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
              >
                <Paperclip className="h-3.5 w-3.5 text-zinc-400" />
                {a.filename}
                <span className="text-xs text-zinc-400">{a.size}</span>
              </a>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
