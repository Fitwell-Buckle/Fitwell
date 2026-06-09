"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

export function SendForm({
  poId,
  defaultTo,
  ccEmail,
  autoCcEmails = [],
}: {
  poId: string;
  defaultTo: string;
  ccEmail: string | null;
  /** Every other supplier_contact for this PO's supplier; the send API
   *  CC's them automatically — listed here so the admin sees the
   *  recipients before hitting send. */
  autoCcEmails?: string[];
}) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  function parseEmails(s: string): string[] {
    return s
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async function send() {
    setError(null);
    setSent(null);
    if (!to.trim()) return setError("Enter a recipient email.");
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          cc: parseEmails(cc),
          message: message.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Send failed.");
      } else {
        const recipients = (data.data?.sentTo ?? [to]).join(", ");
        setSent(`Sent to ${recipients}${ccEmail ? ` (cc ${ccEmail})` : ""}.`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-6 print:hidden">
      <h2 className="text-sm font-semibold text-zinc-900">Send this PO</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>To — vendor email (edit if wrong)</label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="vendor@example.com"
          />
        </div>
        <div>
          <label className={fieldLabel}>Cc (comma-separated)</label>
          <Input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="a@example.com, b@example.com"
          />
        </div>
      </div>
      <div className="mt-4">
        <label className={fieldLabel}>Message to the vendor (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Add a note — appears at the top of the email."
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {ccEmail ? <>A copy is CC&rsquo;d to you ({ccEmail}).</> : "You'll be CC'd."}
        {autoCcEmails.length > 0 && (
          <>
            {" "}Other supplier contacts on file are auto-CC&rsquo;d too:{" "}
            <span className="text-zinc-700">{autoCcEmails.join(", ")}</span>.
          </>
        )}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {sent && <p className="mt-3 text-sm text-emerald-600">{sent}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={send} disabled={busy}>
          <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </Card>
  );
}
