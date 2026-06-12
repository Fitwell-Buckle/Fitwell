"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CreatorActions({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sample" | "code" | null>(null);

  async function sendSample() {
    setBusy("sample");
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/promote`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Promotion failed");
      router.push(
        `/influencer-tracking/new?influencerId=${json.data.influencerId}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
      setBusy(null);
    }
  }

  async function generateCode() {
    setBusy("code");
    try {
      const res = await fetch(
        `/api/admin/creators/${creatorId}/discount-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Code creation failed");
      toast.success(`Created ${json.data.code}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code creation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={sendSample} disabled={busy !== null}>
        {busy === "sample" ? "Preparing…" : "Send sample"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={generateCode}
        disabled={busy !== null}
      >
        {busy === "code" ? "Creating…" : "Generate code (15%)"}
      </Button>
    </div>
  );
}
